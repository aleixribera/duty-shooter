import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlib, gzip } from 'node:zlib';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { DEFAULT_MAX_PLAYERS, GameServer, MAX_BOTS_PER_TEAM, PROTOCOL_VERSION, TICK_SECONDS, buildNavGraph, createWorld, type Connection, type ServerMap, type ServerTransport } from '@duty-shooter/fps-core';
import { EventLog } from './event-log';
import { MODE_IDS, type ModeId } from '@duty-shooter/fps-core/modes';
import { LOBBY_MAPS, MAP_IDS, buildMapById, mapSolids, type MapDefinition, type MapId } from '@duty-shooter/range/maps';
import { WebSocketServer, type WebSocket } from 'ws';

export interface ServerOptions {
  readonly port: number;
  readonly host: string;
  /** Empty runs one public lobby. */
  readonly passphrase: string;
  readonly maxPlayers: number;
  /** The built range app (apps/range/dist). */
  readonly staticDir: string;
  /** The release this server was built from (`git describe`), reported by /healthz. */
  readonly version: string;
  /** The mode an empty server starts in (a first joiner may pick another). */
  readonly mode: ModeId;
  /** The map the lobby starts on; the host may switch to any other lobby map between matches. */
  readonly map: MapId;
  /** Seconds per match in every mode, for short matches; each mode's own limit when absent. */
  readonly timeLimit?: number;
  /** Bots a side the lobby fills to while anyone plays (0: none unless a first joiner asks); none when absent. */
  readonly botsPerTeam?: number;
  /** The most bots a side a first joiner may ask for; 0 or absent turns bots off. Only on maps with a nav graph. */
  readonly maxBotsPerTeam?: number;
  /** Where the event log is appended (one JSON line per join, leave, match start and end); stdout only when absent. */
  readonly eventLog?: string;
  /** Replaces stdout for the event log's lines (tests). */
  readonly printLog?: (line: string) => void;
}

export interface RunningServer {
  readonly http: Server;
  readonly game: GameServer;
  /** The port actually bound (useful with port 0). */
  readonly port: number;
  close(): Promise<void>;
}

/** Largest WebSocket frame accepted, in bytes; the game server checks message sizes again. */
const MAX_PAYLOAD = 16 * 1024;

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
};

/** Types worth compressing: the code and the models. Pictures, fonts and the lighting bake are compressed already. */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.glb']);
const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/**
 * Compressed copies of the static files, made once on the thread pool (never
 * on the game loop's thread) and kept: a first visit downloads about a
 * quarter of the code and half the models, through the home upload and Funnel.
 * Keyed by path, size and time, so a rebuilt file is compressed afresh.
 */
const compressed = new Map<string, Promise<{ br: Buffer; gzip: Buffer }>>();

function compressedCopy(file: string, size: number, mtime: number): Promise<{ br: Buffer; gzip: Buffer }> {
  const key = `${file}:${size}:${mtime}`;
  let copy = compressed.get(key);
  if (!copy) {
    copy = readFile(file).then(async (data) => {
      const [br, gz] = await Promise.all([brotli(data, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9, [zlib.BROTLI_PARAM_SIZE_HINT]: data.length } }), gzipped(data, { level: 9 })]);
      return { br, gzip: gz };
    });
    copy.catch(() => compressed.delete(key));
    compressed.set(key, copy);
  }
  return copy;
}

/** The encoding to answer with, from the request's Accept-Encoding: brotli, then gzip, else none. */
function encodingFor(req: IncomingMessage): 'br' | 'gzip' | null {
  const accepted = String(req.headers['accept-encoding'] ?? '')
    .split(',')
    .map((part) => part.trim().split(';')[0]);
  return accepted.includes('br') ? 'br' : accepted.includes('gzip') ? 'gzip' : null;
}

/**
 * WebSocket compression (permessage-deflate), which browsers undo on their
 * own. A snapshot goes out 60 times a second to every player and is mostly
 * the one before it, so with the window kept across messages it shrinks
 * about 18 times: a full lobby sent 4 Mbit/s to each player, 48 Mbit/s out
 * of the home server through Funnel, and that queueing showed as ping.
 * Messages under the threshold (welcomes, rejections) go as they are.
 */
const DEFLATE = { zlibDeflateOptions: { level: 3 }, threshold: 256, concurrencyLimit: 16 } as const;

/** Wrong passphrases allowed per address before it is locked out for a while. */
const MAX_FAILED_JOINS = 10;
const LOCKOUT_MS = 10 * 60 * 1000;
/** Open sockets allowed per address, joined or not (a household behind one NAT, the 8-bot load test). */
const MAX_SOCKETS_PER_ADDRESS = 12;

const isLoopback = (address: string | undefined): boolean => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

/**
 * The visitor's address. Tailscale Funnel connects from loopback and names the
 * visitor in X-Forwarded-For; the header is trusted from loopback only.
 */
function clientAddress(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress;
  const forwarded = req.headers['x-forwarded-for'];
  if (isLoopback(remote) && typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]!.trim();
  return remote ?? 'unknown';
}

/** Per-address limits on open sockets and passphrase guesses. */
class AddressGuard {
  readonly #open = new Map<string, number>();
  readonly #failures = new Map<string, { count: number; since: number }>();

  /** Whether a new socket from this address is allowed now. */
  admits(address: string, now: number): boolean {
    const failures = this.#failures.get(address);
    if (failures && now - failures.since > LOCKOUT_MS) this.#failures.delete(address);
    else if (failures && failures.count >= MAX_FAILED_JOINS) return false;
    return (this.#open.get(address) ?? 0) < MAX_SOCKETS_PER_ADDRESS;
  }

  opened(address: string): void {
    this.#open.set(address, (this.#open.get(address) ?? 0) + 1);
  }

  closed(address: string): void {
    const open = (this.#open.get(address) ?? 1) - 1;
    if (open <= 0) this.#open.delete(address);
    else this.#open.set(address, open);
  }

  failedJoin(address: string, now: number): void {
    const failures = this.#failures.get(address);
    if (failures) failures.count += 1;
    else this.#failures.set(address, { count: 1, since: now });
  }
}

/** fps-core's Connection over one WebSocket. `onLocalClose` sees the reason whenever the game server closes it. */
function wsConnection(socket: WebSocket, onLocalClose: (reason: string) => void): Connection {
  let onMessage: ((data: string) => void) | null = null;
  let onClose: ((reason: string) => void) | null = null;
  const inbox: string[] = [];
  let closed = false;
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      socket.close(1003, 'text only');
      return;
    }
    const text = data.toString();
    if (onMessage) onMessage(text);
    else inbox.push(text);
  });
  socket.on('close', (_code, reason) => {
    if (closed) return;
    closed = true;
    onClose?.(reason.toString() || 'connection closed');
  });
  socket.on('error', () => socket.terminate());
  return {
    get open() {
      return socket.readyState === socket.OPEN;
    },
    send(data) {
      if (socket.readyState !== socket.OPEN) return;
      // A client that stops reading is dropped rather than buffered without bound.
      if (socket.bufferedAmount > 1024 * 1024) {
        socket.terminate();
        return;
      }
      socket.send(data);
    },
    close(reason = 'closed') {
      if (closed) return;
      closed = true;
      onLocalClose(reason);
      onClose?.(reason);
      socket.close(1000, reason.slice(0, 120));
    },
    onMessage(handler) {
      onMessage = handler;
      for (const data of inbox.splice(0)) handler(data);
    },
    onClose(handler) {
      onClose = handler;
    },
  };
}

/** Same-origin only: a page on another site cannot open a game connection with a visitor's browser. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (tests, load scripts)
  // Behind a proxy on loopback (Funnel), the public host may arrive as X-Forwarded-Host.
  const forwarded = isLoopback(req.socket.remoteAddress) ? req.headers['x-forwarded-host'] : undefined;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || (typeof forwarded === 'string' && host === forwarded.split(',')[0]!.trim());
  } catch {
    return false;
  }
}

async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = resolve(root, '.' + normalize(path === '/' ? '/index.html' : path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(file);
    const type = TYPES[ext] ?? 'application/octet-stream';
    // Vite's hashed assets never change; the page itself must always be fresh.
    const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    const headers = { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    const encoding = COMPRESSIBLE.has(ext) && info.size > 1024 ? encodingFor(req) : null;
    if (encoding) {
      const body = (await compressedCopy(file, info.size, info.mtimeMs))[encoding];
      res.writeHead(200, { ...headers, 'content-encoding': encoding, 'content-length': body.length, vary: 'accept-encoding' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...headers, 'content-length': info.size, ...(COMPRESSIBLE.has(ext) ? { vary: 'accept-encoding' } : {}) });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

/** Starts the HTTP server, the WebSocket endpoint at /ws and the 60 Hz game loop. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const root = resolve(options.staticDir);
  const maxBots = options.maxBotsPerTeam ?? 0;
  /** A map as the game server runs it, its nav graph built when bots are on. */
  const serverMap = (def: MapDefinition): ServerMap => {
    const world = createWorld(mapSolids(def));
    return {
      id: def.id,
      world,
      spawns: def.spawns.ffa,
      ...(def.spawns.teams ? { teamSpawns: def.spawns.teams } : {}),
      zones: def.zones,
      sites: def.sites,
      ...(def.nav && maxBots > 0 ? { nav: buildNavGraph(world, def.nav) } : {}),
    };
  };
  const map = buildMapById(options.map);
  const first = serverMap(map);
  // Every lobby map is built up front, so a switch at a match's start costs nothing.
  const others = LOBBY_MAPS.includes(options.map) ? LOBBY_MAPS.filter((id) => id !== options.map).map((id) => serverMap(buildMapById(id))) : [];
  let accept: ((connection: Connection) => void) | null = null;
  const transport: ServerTransport = { onConnection: (handler) => (accept = handler) };
  const log = new EventLog(options.eventLog ?? null, options.printLog ? { print: options.printLog } : {});
  log.write({ event: 'serverStart', version: options.version });
  const game = new GameServer(transport, {
    world: first.world,
    map: first.id,
    maps: others,
    mode: options.mode,
    spawns: first.spawns,
    ...(first.teamSpawns ? { teamSpawns: first.teamSpawns } : {}),
    ...(first.zones ? { zones: first.zones } : {}),
    ...(first.sites ? { sites: first.sites } : {}),
    dummies: map.dummies,
    passphrase: options.passphrase,
    maxPlayers: options.maxPlayers,
    ...(options.timeLimit === undefined ? {} : { modes: { tdm: { timeLimit: options.timeLimit }, ffa: { timeLimit: options.timeLimit }, outposts: { timeLimit: options.timeLimit } } }),
    ...(first.nav ? { bots: { nav: first.nav, perTeam: options.botsPerTeam ?? 0, maxPerTeam: maxBots } } : {}),
    onLog: (event) => log.write(event),
    // Between matches everyone waits in the lobby for the host to start the next.
    lobby: true,
  });

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ status: 'ok', players: game.playerCount, maxPlayers: game.maxPlayers, public: options.passphrase === '', version: options.version, protocol: PROTOCOL_VERSION }));
      return;
    }
    if (req.url === '/status') {
      // The lobby as the Play Online menu shows it, fetched before joining.
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(game.status()));
      return;
    }
    void serveStatic(root, req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: DEFLATE });
  const guard = new AddressGuard();
  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws' || !sameOrigin(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const address = clientAddress(req);
    if (!guard.admits(address, Date.now())) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      guard.opened(address);
      ws.on('close', () => guard.closed(address));
      accept?.(
        wsConnection(ws, (reason) => {
          if (reason === 'rejected: passphrase') guard.failedJoin(address, Date.now());
        }),
      );
    });
  });

  // Fixed 60 Hz: run however many ticks are due, scheduling the next check for the next deadline.
  const tickMs = TICK_SECONDS * 1000;
  let next = performance.now();
  let timer: NodeJS.Timeout | null = null;
  const loop = () => {
    const now = performance.now();
    let ran = 0;
    while (now >= next && ran < 5) {
      game.tick();
      next += tickMs;
      ran += 1;
    }
    if (now - next > tickMs * 5) next = now; // a long stall: drop time instead of catching up
    timer = setTimeout(loop, Math.max(0, next - performance.now()));
  };
  loop();

  await new Promise<void>((done) => http.listen(options.port, options.host, done));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  return {
    http,
    game,
    port,
    close: async () => {
      if (timer) clearTimeout(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((done) => http.close(() => done()));
    },
  };
}

/**
 * Reads the server settings from the environment. Without a PASSPHRASE the
 * server runs one public lobby that anyone with the link can join. The
 * passphrase is never logged.
 */
export function optionsFromEnv(env: NodeJS.ProcessEnv, defaultStaticDir: string): ServerOptions {
  const passphrase = env['PASSPHRASE'] ?? '';
  const maxPlayers = Number(env['MAX_PLAYERS'] ?? DEFAULT_MAX_PLAYERS);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 32) throw new Error('MAX_PLAYERS must be an integer from 1 to 32.');
  const mode = env['MODE'] ?? 'tdm';
  if (!(MODE_IDS as readonly string[]).includes(mode)) throw new Error(`MODE must be one of ${MODE_IDS.join(', ')}.`);
  const map = env['MAP'] ?? 'survival-town';
  if (!(MAP_IDS as readonly string[]).includes(map)) throw new Error(`MAP must be one of ${MAP_IDS.join(', ')}.`);
  const timeLimit = env['TIME_LIMIT'] ? Number(env['TIME_LIMIT']) : undefined;
  if (timeLimit !== undefined && !(Number.isFinite(timeLimit) && timeLimit >= 10 && timeLimit <= 3600)) throw new Error('TIME_LIMIT must be a number of seconds from 10 to 3600.');
  const maxBotsPerTeam = Number(env['MAX_BOTS_PER_TEAM'] || MAX_BOTS_PER_TEAM);
  if (!Number.isInteger(maxBotsPerTeam) || maxBotsPerTeam < 0 || maxBotsPerTeam > MAX_BOTS_PER_TEAM) throw new Error(`MAX_BOTS_PER_TEAM must be an integer from 0 to ${MAX_BOTS_PER_TEAM}.`);
  const botsPerTeam = Number(env['BOTS_PER_TEAM'] || Math.min(3, maxBotsPerTeam));
  if (!Number.isInteger(botsPerTeam) || botsPerTeam < 0 || botsPerTeam > maxBotsPerTeam) throw new Error(`BOTS_PER_TEAM must be an integer from 0 to MAX_BOTS_PER_TEAM (${maxBotsPerTeam}).`);
  return {
    port: Number(env['PORT'] ?? 3000),
    host: env['HOST'] ?? '0.0.0.0',
    passphrase,
    maxPlayers,
    staticDir: env['STATIC_DIR'] ?? defaultStaticDir,
    version: env['DUTY_VERSION'] || 'dev',
    mode: mode as ModeId,
    map: map as MapId,
    ...(timeLimit === undefined ? {} : { timeLimit }),
    botsPerTeam,
    maxBotsPerTeam,
    ...(env['EVENT_LOG'] ? { eventLog: env['EVENT_LOG'] } : {}),
  };
}
