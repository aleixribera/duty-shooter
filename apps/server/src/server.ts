import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlib, gzip } from 'node:zlib';
import { isIP } from 'node:net';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { DEFAULT_MAX_PLAYERS, GameServer, MATCH_SCALES, MAX_BOTS_PER_TEAM, PROTOCOL_VERSION, TICK_SECONDS, WIDE_MAP, WIDE_SCALE, buildNavGraph, createWorld, decodeLargeNav, type Connection, type GameServerOptions, type NavGraph, type ServerMap, type ServerTransport, type WireData } from '@duty-shooter/fps-core';
import { EventLog } from './event-log';
import { spendFirstUpgrade } from './first-upgrade';
import { MODE_IDS, type ModeId, type DropHolds, type SquadSize } from '@duty-shooter/fps-core/modes';
import { MATCH_MAPS, MAP_IDS, TEAM_SIZES, buildMapById, mapConcealment, mapSolids, type MapDefinition, type MapId } from '@duty-shooter/range/maps';
import { WebSocketServer, type WebSocket } from 'ws';
import { watchTicks } from './slow-ticks';
import { TickCosts, type TickWindow } from './tick-costs';
import { warmUp } from './warm-up';

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
  /** Seats a Squad in a Battle Royale: 1, 2 or 3; Solos when absent. */
  readonly squadSize?: SquadSize;
  /** What a Battle Royale's Supply Drops hold: `resupply` plays it on loadouts, with nothing on the ground; the sniper when absent. */
  readonly dropHolds?: DropHolds;
  /** Bots a side the lobby fills to while anyone plays (0: none unless a first joiner asks); none when absent. */
  readonly botsPerTeam?: number;
  /** The most bots a side a first joiner may ask for; 0 or absent turns bots off. Only on maps with a nav graph. */
  readonly maxBotsPerTeam?: number;
  /** Where the event log is appended (one JSON line per join, leave, match start and end); stdout only when absent. */
  readonly eventLog?: string;
  /** Replaces stdout for the event log's lines (tests). */
  readonly printLog?: (line: string) => void;
  /** Plays every mode on the kilometre-wide map's network profile: for the load test. */
  readonly wideNet?: boolean;
  /** Open sockets this machine itself may hold, for the load test; every other address keeps the limit. */
  readonly loadTestSockets?: number;
  /**
   * Peers besides loopback whose X-Forwarded-For names the visitor: the proxy
   * in front, such as Docker's bridge gateway behind Funnel (TRUSTED_PROXY).
   */
  readonly trustedProxies?: readonly string[];
  /** Ticks of a private bot match played before listening, so the first real ticks run compiled. */
  readonly warmTicks?: number;
  /** Ticks of at least this many milliseconds are logged with what they did; SLOW_TICK_MS by default. */
  readonly slowTickMs?: number;
  /** Battle Royale in a process of its own, behind `/royale/status` and `/royale/ws` (ADR 0009). */
  readonly royale?: RoyaleRoute;
  /**
   * This is that Battle Royale process: it listens on no port and serves no
   * files, taking its players' connections from the server that holds the
   * public address. Its event log lines say so.
   */
  readonly handedSockets?: boolean;
}

/** What the server holding the public address needs of the Battle Royale process (`RoyaleProcess`). */
export interface RoyaleRoute {
  /** The Battle Royale lobby's status, starting the process if need be; null while it can't start. */
  status(): object | null;
  /** People in the Battle Royale now. */
  readonly players: number;
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export interface RunningServer {
  readonly http: Server;
  /** The public lobby. */
  readonly game: GameServer;
  /** The private lobbies open now, by code. */
  readonly privateLobbies: ReadonlyMap<string, GameServer>;
  /** Seats the warm-up match filled; 0 when there was none. */
  readonly warmedSeats: number;
  /** The port actually bound (useful with port 0). */
  readonly port: number;
  /** The game loop since the last call: milliseconds per tick, ticks that started a whole tick late, and slow ticks by cause. */
  takeLoopStats(): TickWindow & { readonly causes: Readonly<Record<string, number>> };
  close(): Promise<void>;
}

/** A private lobby's code, as its link carries it (`?lobby=`): letters and digits, any case. */
const LOBBY_CODE = /^[A-Za-z0-9]{4,12}$/;
/** Private lobbies a server holds at once; each plays its own match. */
export const MAX_PRIVATE_LOBBIES = 8;
/** Seconds a private lobby with nobody in it stays open before it closes. */
export const PRIVATE_LOBBY_IDLE = 60;

/** The private lobby a request names (`?lobby=<code>`, upper-cased), null for the public one, or 'bad' for a code that can't be one. */
function lobbyCode(url: string | undefined): string | null | 'bad' {
  const asked = new URL(url ?? '/', 'http://x').searchParams.get('lobby');
  if (asked === null || asked === '') return null;
  return LOBBY_CODE.test(asked) ? asked.toUpperCase() : 'bad';
}

/** Where the build leaves Zero Island's bots' nav (`MapDefinition.navFile`). */
const ISLAND_NAV = 'nav/zero-island.nav';

/** Whether a server with these options can hold a Battle Royale: bots on, and the island's nav built. */
export function royaleAvailable(options: Pick<ServerOptions, 'staticDir' | 'maxBotsPerTeam'>): boolean {
  return (options.maxBotsPerTeam ?? 0) > 0 && existsSync(join(resolve(options.staticDir), ISLAND_NAV));
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

/** Types worth compressing: the code, the models and a large map's nav. Pictures, fonts and the lighting bake are compressed already. */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.glb', '.nav']);
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

/**
 * Compresses every compressible file under `root` in the background, one at
 * a time, so the first player after a restart doesn't wait seconds for the
 * models' brotli. One file at a time leaves the rest of the thread pool to
 * the snapshots' compression.
 */
async function precompress(root: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(root, { recursive: true });
  } catch {
    return;
  }
  for (const name of names) {
    const file = resolve(root, name);
    if (!COMPRESSIBLE.has(extname(file))) continue;
    try {
      const info = await stat(file);
      if (info.isFile() && info.size > 1024) await compressedCopy(file, info.size, info.mtimeMs);
    } catch {
      // Gone or unreadable: served (or refused) as it is when asked for.
    }
  }
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
/** Addresses with wrong passphrases on record before the expired ones are cleared out. */
const MAX_TRACKED = 1000;
/** Open sockets allowed per address, joined or not (a household behind one NAT). */
const MAX_SOCKETS_PER_ADDRESS = 12;

/**
 * Bytes waiting on a socket before snapshots are skipped, and before the client
 * is dropped. Skipped snapshots lose nothing: the next carries what they would
 * have. Compressed, this is about a fifth of a second of them; much more is a
 * player watching the past.
 */
const CONGESTED = 8 * 1024;
const MAX_BUFFERED = 1024 * 1024;
/** Ticks in a row that may fail before the server restarts (Compose brings it back). */
const MAX_TICK_FAILURES = 60;
/** A wide server's warm-up: forty seconds of match, after the openings; about five seconds of real time in all. Fewer left routes cold: 600 ticks had them at 18 to 21 ms. */
const WIDE_WARM_TICKS = 2400;

const isLoopback = (address: string | undefined): boolean => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

/** A peer's address as the proxy setting names it: IPv4 without the `::ffff:` a dual-stack socket adds. */
const plainAddress = (address: string | undefined): string | undefined => (address?.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address);

/**
 * Whether this peer is a proxy that names the visitor in X-Forwarded-For:
 * loopback (Tailscale Funnel on the same machine), or an address in
 * `trustedProxies` (Docker's bridge gateway, which docker-proxy connects from,
 * so a container sees every Funnel visitor arrive from it). Nobody else's
 * header is believed.
 */
function fromTrustedProxy(req: IncomingMessage, trustedProxies: ReadonlySet<string>): boolean {
  const remote = req.socket.remoteAddress;
  return isLoopback(remote) || trustedProxies.has(plainAddress(remote) ?? '');
}

/**
 * The visitor's address. Behind a trusted proxy it is the last X-Forwarded-For
 * entry, the one that proxy added: anything before it the visitor could have
 * written themselves.
 */
function clientAddress(req: IncomingMessage, trustedProxies: ReadonlySet<string>): string {
  const remote = req.socket.remoteAddress;
  const forwarded = req.headers['x-forwarded-for'];
  if (fromTrustedProxy(req, trustedProxies) && typeof forwarded === 'string') {
    const last = forwarded.split(',').at(-1)!.trim();
    if (isIP(last)) return last;
  }
  return remote ?? 'unknown';
}

/** Per-address limits on open sockets and passphrase guesses. */
class AddressGuard {
  readonly #open = new Map<string, number>();
  readonly #failures = new Map<string, { count: number; since: number }>();
  readonly #loopbackSockets: number;

  constructor(loopbackSockets: number) {
    this.#loopbackSockets = loopbackSockets;
  }

  /** Whether a new socket from this address is allowed now. */
  admits(address: string, now: number): boolean {
    const failures = this.#failures.get(address);
    if (failures && now - failures.since > LOCKOUT_MS) this.#failures.delete(address);
    else if (failures && failures.count >= MAX_FAILED_JOINS) return false;
    return (this.#open.get(address) ?? 0) < (isLoopback(address) ? this.#loopbackSockets : MAX_SOCKETS_PER_ADDRESS);
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
    if (this.#failures.size > MAX_TRACKED) for (const [known, entry] of this.#failures) if (now - entry.since > LOCKOUT_MS) this.#failures.delete(known);
    const failures = this.#failures.get(address);
    if (failures) failures.count += 1;
    else this.#failures.set(address, { count: 1, since: now });
  }
}

/** fps-core's Connection over one WebSocket. `onLocalClose` sees the reason whenever the game server closes it. */
function wsConnection(socket: WebSocket, onLocalClose: (reason: string) => void): Connection {
  let onMessage: ((data: WireData) => void) | null = null;
  let onClose: ((reason: string) => void) | null = null;
  const inbox: WireData[] = [];
  let closed = false;
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      socket.close(1003, 'text only');
      return;
    }
    const text = data.toString();
    if (!onMessage) {
      inbox.push(text);
      return;
    }
    try {
      onMessage(text);
    } catch (error) {
      // One client's bad message ends that client, not everyone's match.
      console.error('A message failed:', error);
      socket.terminate();
    }
  });
  socket.on('close', (_code, reason) => {
    if (closed) return;
    closed = true;
    onClose?.(reason.toString() || 'connection closed');
  });
  socket.on('error', () => socket.terminate());
  return {
    reliable: true,
    get congested() {
      return socket.bufferedAmount > CONGESTED;
    },
    get open() {
      return socket.readyState === socket.OPEN;
    },
    send(data) {
      if (socket.readyState !== socket.OPEN) return;
      // A client that stops reading is dropped rather than buffered without bound.
      if (socket.bufferedAmount > MAX_BUFFERED) {
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
function sameOrigin(req: IncomingMessage, trustedProxies: ReadonlySet<string>): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (tests, load scripts)
  // Behind a trusted proxy (Funnel), the public host may arrive as X-Forwarded-Host.
  const forwarded = fromTrustedProxy(req, trustedProxies) ? req.headers['x-forwarded-host'] : undefined;
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
    // Vite's hashed assets never change; everything else (the page, the models, the bake) is checked each visit,
    // and an unchanged file is answered with a 304, so a returning player downloads none of it again.
    const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = { 'content-type': type, 'cache-control': cache, etag, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    if (String(req.headers['if-none-match'] ?? '').split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) {
      res.writeHead(304, headers).end();
      return;
    }
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
  /** A map's nav: a large map's from the build, a small map's generated now (once: every lobby shares it). */
  const navs = new Map<string, NavGraph | null>();
  const navOf = (def: MapDefinition, world: ServerMap['world']): NavGraph | null => {
    if (!navs.has(def.id)) navs.set(def.id, freshNav(def, world));
    return navs.get(def.id)!;
  };
  const freshNav = (def: MapDefinition, world: ServerMap['world']): NavGraph | null => {
    if (def.navFile) {
      const file = join(root, def.navFile);
      if (!existsSync(file)) throw new Error(`${file} is missing: build the range app first.`);
      return decodeLargeNav(readFileSync(file), world);
    }
    return def.nav ? buildNavGraph(world, def.nav) : null;
  };
  /** A map as the game server runs it, its nav graph ready when bots are on. */
  const serverMap = (def: MapDefinition): ServerMap => {
    const world = createWorld(mapSolids(def), { ladders: def.ladders ?? [], terrain: def.terrain, concealment: mapConcealment(def), traps: def.soundTraps ?? [] });
    const nav = maxBots > 0 ? navOf(def, world) : null;
    return {
      id: def.id,
      world,
      spawns: def.spawns.ffa,
      ...(def.spawns.teams ? { teamSpawns: def.spawns.teams } : {}),
      zones: def.zones,
      sites: def.sites,
      ...(def.towns ? { towns: def.towns } : {}),
      ...(nav ? { nav } : {}),
      teamSize: TEAM_SIZES[def.id],
    };
  };
  const defs = new Map<MapId, MapDefinition>();
  const defOf = (id: MapId): MapDefinition => {
    if (!defs.has(id)) defs.set(id, buildMapById(id));
    return defs.get(id)!;
  };
  const map = defOf(options.map);
  const first = serverMap(map);
  // Every lobby map is built up front, so a switch at a match's start costs nothing.
  // Zero Island isn't among them: Battle Royale plays in a process of its own (ADR 0009).
  const otherIds = MATCH_MAPS.includes(options.map) ? MATCH_MAPS.filter((id) => id !== options.map) : [];
  const others = otherIds.map((id) => serverMap(defOf(id)));
  let accept: ((connection: Connection) => void) | null = null;
  const transport: ServerTransport = { onConnection: (handler) => (accept = handler) };
  const log = new EventLog(options.eventLog ?? null, { ...(options.printLog ? { print: options.printLog } : {}), ...(options.handedSockets ? { process: 'royale' } : {}) });
  log.write({ event: 'serverStart', version: options.version });
  log.flush();
  const config: GameServerOptions = {
    world: first.world,
    map: first.id,
    maps: others,
    mode: options.mode,
    spawns: first.spawns,
    ...(first.teamSpawns ? { teamSpawns: first.teamSpawns } : {}),
    ...(first.zones ? { zones: first.zones } : {}),
    ...(first.sites ? { sites: first.sites } : {}),
    ...(first.towns ? { towns: first.towns } : {}),
    ...(first.teamSize ? { teamSize: first.teamSize } : {}),
    dummies: map.dummies,
    passphrase: options.passphrase,
    maxPlayers: options.maxPlayers,
    modes: {
      ...(options.timeLimit === undefined ? {} : { tdm: { timeLimit: options.timeLimit }, ffa: { timeLimit: options.timeLimit }, outposts: { timeLimit: options.timeLimit }, gungame: { timeLimit: options.timeLimit } }),
      // A load test measures play: a kill limit would end it partway and measure the lobby.
      ...(options.wideNet ? { ffa: { killLimit: null, ...(options.timeLimit === undefined ? {} : { timeLimit: options.timeLimit }) } } : {}),
      battleRoyale: { ...(options.squadSize === undefined ? {} : { squadSize: options.squadSize }), ...(options.dropHolds === undefined ? {} : { holds: options.dropHolds }), ...(options.timeLimit === undefined ? {} : { timeLimit: options.timeLimit }) },
    },
    ...(first.nav ? { bots: { nav: first.nav, perTeam: options.botsPerTeam ?? 0, maxPerTeam: maxBots } } : {}),
    onLog: (event) => log.write(event),
    ...(options.wideNet ? { net: WIDE_MAP, scale: WIDE_SCALE } : {}),
    // Between matches everyone waits in the lobby for the host to start the next.
    lobby: true,
  };
  if (options.warmTicks) await spendFirstUpgrade();
  const warmedSeats = options.warmTicks && first.nav ? warmUp(config, maxBots, options.warmTicks) : 0;
  const ticks = watchTicks(options.slowTickMs);
  const game = new GameServer(transport, { ...config, probe: ticks.profiler });

  /** Private lobbies by code: each its own game, on worlds of its own (props fall per match), sharing the maps' nav. */
  type PrivateLobby = { game: GameServer; accept: ((connection: Connection) => void) | null; emptySince: number | null; sockets: Set<WebSocket> };
  const lobbies = new Map<string, PrivateLobby>();
  /** The private lobby with this code, opened if need be; null when the server holds all it may. */
  const privateLobby = (code: string) => {
    const open = lobbies.get(code);
    if (open) return open;
    if (lobbies.size >= MAX_PRIVATE_LOBBIES || options.handedSockets) return null;
    const own = serverMap(map);
    const lobby: PrivateLobby = { game: null!, accept: null, emptySince: performance.now(), sockets: new Set() };
    const ownTransport: ServerTransport = { onConnection: (handler) => (lobby.accept = handler) };
    lobby.game = new GameServer(ownTransport, {
      ...config,
      world: own.world,
      maps: otherIds.map((id) => serverMap(defOf(id))),
      onLog: (event) => log.write({ ...event, lobby: code }),
      ...(own.nav ? { bots: { nav: own.nav, perTeam: options.botsPerTeam ?? 0, maxPerTeam: maxBots } } : {}),
    });
    lobbies.set(code, lobby);
    log.write({ event: 'lobbyOpen', lobby: code });
    return lobby;
  };
  /** A private lobby gone: its code free again, and any socket still on it cut. */
  const closeLobby = (code: string) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    lobbies.delete(code);
    for (const ws of lobby.sockets) ws.terminate();
    log.write({ event: 'lobbyClose', lobby: code });
  };
  /** Closes private lobbies left empty long enough: nobody in them, and no seat held for someone coming back. */
  const closeIdleLobbies = (now: number) => {
    for (const [code, lobby] of lobbies) {
      if (lobby.game.playerCount > 0 || lobby.game.status().away > 0) lobby.emptySince = null;
      else if (lobby.emptySince === null) lobby.emptySince = now;
      else if (now - lobby.emptySince >= PRIVATE_LOBBY_IDLE * 1000) closeLobby(code);
    }
  };

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      // Everyone on the box, Battle Royale included: the updater waits for nobody before it restarts the container.
      const royalePlayers = options.royale?.players ?? 0;
      const privatePlayers = [...lobbies.values()].reduce((sum, l) => sum + l.game.playerCount, 0);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ status: 'ok', players: game.playerCount + royalePlayers + privatePlayers, maxPlayers: game.maxPlayers, public: options.passphrase === '', version: options.version, protocol: PROTOCOL_VERSION, ...(options.royale ? { royalePlayers } : {}) }));
      return;
    }
    if (req.url === '/status' || req.url?.startsWith('/status?')) {
      // The lobby as the Play Online menu shows it, fetched before joining. Only joining opens a private one, so a
      // plain GET can't fill the server with lobbies: one not open yet reads as it will be, empty and waiting.
      const code = lobbyCode(req.url);
      if (code === 'bad') {
        res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ status: 'no such lobby' }));
        return;
      }
      const open = code === null ? game : lobbies.get(code)?.game;
      const status = open ? open.status() : { ...game.status(), map: map.id, mode: options.mode, lobbyMode: options.mode, players: 0, away: 0, bots: 0, phase: 'lobby' as const };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(status));
      return;
    }
    if (req.url === '/royale/status' && options.royale) {
      // The Battle Royale screen's: asking starts the process, so it's warm by the time anyone joins.
      const royale = options.royale.status();
      res.writeHead(royale ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(royale ?? { status: 'starting soon' }));
      return;
    }
    if (options.handedSockets) {
      res.writeHead(404).end();
      return;
    }
    serveStatic(root, req, res).catch(() => res.destroy());
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: DEFLATE });
  const guard = new AddressGuard(options.loadTestSockets ?? MAX_SOCKETS_PER_ADDRESS);
  const trustedProxies = new Set(options.trustedProxies ?? []);
  http.on('upgrade', (req, socket, head) => {
    // Http stops watching the socket here: a reset before ws takes it over would otherwise end the process.
    socket.on('error', () => socket.destroy());
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/royale/ws' && options.royale && sameOrigin(req, trustedProxies)) {
      // The Battle Royale process takes the connection whole, and holds its own per-address limit.
      options.royale.upgrade(req, socket, head);
      return;
    }
    if (path !== '/ws' || !sameOrigin(req, trustedProxies)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const address = clientAddress(req, trustedProxies);
    if (!guard.admits(address, Date.now())) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    // `/ws?lobby=<code>` joins (or opens) that private lobby; plain `/ws` the public one.
    const code = lobbyCode(req.url);
    const lobby = code === null ? null : code === 'bad' ? undefined : privateLobby(code);
    if (lobby === undefined) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    if (code !== null && lobby === null) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      guard.opened(address);
      ws.on('close', () => guard.closed(address));
      if (lobby) {
        lobby.sockets.add(ws);
        ws.on('close', () => lobby.sockets.delete(ws));
      }
      (lobby ? lobby.accept : accept)?.(
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
  let failures = 0;
  const costs = new TickCosts();
  const loop = () => {
    const now = performance.now();
    let ran = 0;
    while (now >= next && ran < 5) {
      try {
        const lag = now - next;
        const started = performance.now();
        ticks.profiler.willStart(lag);
        game.tick();
        for (const [code, lobby] of lobbies) {
          try {
            lobby.game.tick();
          } catch (error) {
            // A private lobby that fails closes on its own; the public game and the other lobbies play on.
            console.error(`Private lobby ${code} failed:`, error);
            closeLobby(code);
          }
        }
        costs.record(performance.now() - started, lag >= tickMs, lag);
        failures = 0;
      } catch (error) {
        // A tick that fails is lost; the match goes on. One that keeps failing won't mend: a fresh start beats a frozen lobby.
        console.error('A tick failed:', error);
        failures += 1;
        if (failures >= MAX_TICK_FAILURES) {
          log.flush();
          process.exit(1);
        }
      }
      next += tickMs;
      ran += 1;
    }
    if (now - next > tickMs * 5) next = now; // a long stall: drop time instead of catching up
    closeIdleLobbies(now);
    log.flush();
    ticks.profiler.flush();
    timer = setTimeout(loop, Math.max(0, next - performance.now()));
  };
  loop();

  if (!options.handedSockets) {
    await new Promise<void>((done) => http.listen(options.port, options.host, done));
    void precompress(root);
  }
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  return {
    http,
    game,
    get privateLobbies() {
      return new Map([...lobbies].map(([code, l]) => [code, l.game]));
    },
    warmedSeats,
    port,
    takeLoopStats: () => ({ ...costs.take(), causes: ticks.profiler.takeCauses() }),
    close: async () => {
      if (timer) clearTimeout(timer);
      ticks.stop();
      log.flush();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((done) => (http.listening ? http.close(() => done()) : done()));
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
  // NET=wide stands for a match on the wide map, with that match's own limits.
  const wide = env['NET'] === 'wide';
  const royale = env['MODE'] === 'battle-royale';
  const mostPlayers = wide || royale ? WIDE_SCALE.seats : MATCH_SCALES.tdm.seats;
  const mostBots = wide || royale ? WIDE_SCALE.botsPerTeam : MAX_BOTS_PER_TEAM;
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > mostPlayers) throw new Error(`MAX_PLAYERS must be an integer from 1 to ${mostPlayers}.`);
  const mode = env['MODE'] ?? 'tdm';
  if (!(MODE_IDS as readonly string[]).includes(mode)) throw new Error(`MODE must be one of ${MODE_IDS.join(', ')}.`);
  const map = env['MAP'] ?? (royale ? 'zero-island' : 'survival-town');
  if (!(MAP_IDS as readonly string[]).includes(map)) throw new Error(`MAP must be one of ${MAP_IDS.join(', ')}.`);
  if (royale && map !== 'zero-island') throw new Error('Battle Royale plays only on zero-island.');
  const squads = env['SQUADS'] ? Number(env['SQUADS']) : undefined;
  if (squads !== undefined && squads !== 1 && squads !== 2 && squads !== 3) throw new Error('SQUADS must be 1, 2 or 3.');
  const holds = env['ROYALE_DROPS'] || undefined;
  if (holds !== undefined && holds !== 'sniper' && holds !== 'resupply') throw new Error('ROYALE_DROPS must be sniper or resupply.');
  const timeLimit = env['TIME_LIMIT'] ? Number(env['TIME_LIMIT']) : undefined;
  const slowTickMs = env['SLOW_TICK_MS'] ? Number(env['SLOW_TICK_MS']) : undefined;
  if (slowTickMs !== undefined && !(slowTickMs > 0)) throw new Error('SLOW_TICK_MS must be a number of milliseconds above 0.');
  if (timeLimit !== undefined && !(Number.isFinite(timeLimit) && timeLimit >= 10 && timeLimit <= 3600)) throw new Error('TIME_LIMIT must be a number of seconds from 10 to 3600.');
  const maxBotsPerTeam = Number(env['MAX_BOTS_PER_TEAM'] || MAX_BOTS_PER_TEAM);
  if (!Number.isInteger(maxBotsPerTeam) || maxBotsPerTeam < 0 || maxBotsPerTeam > mostBots) throw new Error(`MAX_BOTS_PER_TEAM must be an integer from 0 to ${mostBots}.`);
  const loadTestSockets = env['LOAD_TEST_SOCKETS'] ? Number(env['LOAD_TEST_SOCKETS']) : undefined;
  if (loadTestSockets !== undefined && !(Number.isInteger(loadTestSockets) && loadTestSockets >= MAX_SOCKETS_PER_ADDRESS)) throw new Error(`LOAD_TEST_SOCKETS must be an integer of at least ${MAX_SOCKETS_PER_ADDRESS}.`);
  const trustedProxies = env['TRUSTED_PROXY'] ? env['TRUSTED_PROXY'].split(',').map((part) => part.trim()) : undefined;
  if (trustedProxies?.some((address) => !isIP(address))) throw new Error('TRUSTED_PROXY must be a comma-separated list of IP addresses.');
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
    ...(squads === undefined ? {} : { squadSize: squads }),
    ...(holds === undefined ? {} : { dropHolds: holds }),
    botsPerTeam,
    maxBotsPerTeam,
    ...(env['EVENT_LOG'] ? { eventLog: env['EVENT_LOG'] } : {}),
    ...(wide ? { wideNet: true } : {}),
    ...(wide || royale ? { warmTicks: env['WARM_TICKS'] ? Number(env['WARM_TICKS']) : WIDE_WARM_TICKS } : {}),
    ...(loadTestSockets === undefined ? {} : { loadTestSockets }),
    ...(trustedProxies === undefined ? {} : { trustedProxies }),
    ...(slowTickMs === undefined ? {} : { slowTickMs }),
  };
}
