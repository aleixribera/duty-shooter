import type { ChildProcess } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { WIDE_SCALE, type LobbyStatus } from '@duty-shooter/fps-core';

/** What the Battle Royale process tells the server that started it. */
export type FromRoyale = { readonly t: 'ready' } | { readonly t: 'status'; readonly status: LobbyStatus };

/** A WebSocket upgrade handed to the Battle Royale process, the connection itself going with it. */
export interface UpgradeHandOff {
  readonly t: 'upgrade';
  readonly method: string;
  /** The path as the Battle Royale process serves it: `/ws`, with any query. */
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
  /** Bytes read past the request, base64. */
  readonly head: string;
}

export interface RoyaleProcessOptions {
  /** Starts the Battle Royale process: a Node child with an IPC channel. */
  readonly start: () => ChildProcess;
  /** Whether this server can play Battle Royale at all: Zero Island's nav built and bots on. */
  readonly available: boolean;
  /** How long the process may sit with nobody in it before it's stopped. */
  readonly idleMs?: number;
  /** How long an upgrade waits for a starting process before it's refused. */
  readonly readyTimeoutMs?: number;
  /** How long after a crash before the process may start again. */
  readonly restartDelayMs?: number;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

const IDLE_MS = 3 * 60 * 1000;
const READY_TIMEOUT_MS = 30_000;
const RESTART_DELAY_MS = 5_000;
/** How long a stopped process has to close before it's killed. */
const STOP_GRACE_MS = 5_000;

/** The status of a Battle Royale nobody has opened yet, or that is still starting: free, its joiner the host. */
function freeRoyaleStatus(starting: boolean): LobbyStatus & { readonly starting: boolean } {
  return { map: 'zero-island', mode: 'battle-royale', players: 0, away: 0, capacity: WIDE_SCALE.seats, phase: 'lobby', bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, lobby: true, hvb: false, lobbyMode: 'battle-royale', squadSize: 1, royale: true, starting };
}

const refuse = (socket: Duplex, status: string) => {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
};

/**
 * Battle Royale's own OS process, seen from the server that holds the public
 * address (ADR 0009). It starts when a Battle Royale is first wanted (its
 * screen asks for the status, or someone joins), takes each of its players'
 * connections whole once the HTTP upgrade has been read, and stops when it has
 * sat empty a while. A crash ends only its own match: this server notices,
 * waits a moment and starts a fresh one when it's next wanted.
 */
export class RoyaleProcess {
  readonly #options: RoyaleProcessOptions;
  readonly #now: () => number;
  readonly #log: (line: string) => void;
  #child: ChildProcess | null = null;
  #ready = false;
  #status: LobbyStatus | null = null;
  #idleSince: number | null = null;
  #crashedAt = -Infinity;
  #stopping = false;
  /** Upgrades waiting for a starting process. */
  #waiting: { readonly message: UpgradeHandOff; readonly socket: Duplex; readonly timer: NodeJS.Timeout }[] = [];

  constructor(options: RoyaleProcessOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => Date.now());
    this.#log = options.log ?? ((line) => console.log(line));
  }

  get running(): boolean {
    return this.#child !== null;
  }

  get ready(): boolean {
    return this.#ready;
  }

  /** People in the Battle Royale now, for the health check (which the updater reads before restarting). */
  get players(): number {
    return this.#status?.players ?? 0;
  }

  /**
   * What the Battle Royale screen shows before joining, and a sign that a
   * Battle Royale is wanted: the process starts if it isn't running. Null
   * while it may not start yet (just after a crash); `royale: false` when this
   * server has no Battle Royale.
   */
  status(): (LobbyStatus & { readonly starting?: boolean }) | null {
    if (!this.#options.available) return { ...freeRoyaleStatus(false), royale: false };
    if (!this.#ensure()) return null;
    return this.#ready && this.#status ? this.#status : freeRoyaleStatus(true);
  }

  /** Hands a WebSocket upgrade for `/royale/ws` to the process, starting it first if need be. */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.#options.available) return refuse(socket, '404 Not Found');
    // Nothing more is read here: the bytes belong to the process that answers.
    socket.pause();
    const url = (req.url ?? '/royale/ws').replace(/^\/royale/, '');
    const message: UpgradeHandOff = { t: 'upgrade', method: req.method ?? 'GET', url, headers: req.headers, head: head.toString('base64') };
    if (!this.#ensure()) return refuse(socket, '503 Service Unavailable');
    if (this.#ready) return this.#send(message, socket);
    const timer = setTimeout(() => {
      this.#waiting = this.#waiting.filter((w) => w.socket !== socket);
      refuse(socket, '503 Service Unavailable');
    }, this.#options.readyTimeoutMs ?? READY_TIMEOUT_MS);
    timer.unref();
    this.#waiting.push({ message, socket, timer });
  }

  /** Stops the process and waits for it to go. */
  async close(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    await new Promise<void>((done) => {
      child.once('exit', () => done());
      this.#stop();
    });
  }

  /** Starts the process unless it's running or crashed a moment ago; whether it's running now. */
  #ensure(): boolean {
    if (this.#child) return true;
    if (this.#now() - this.#crashedAt < (this.#options.restartDelayMs ?? RESTART_DELAY_MS)) return false;
    const child = this.#options.start();
    this.#child = child;
    this.#ready = false;
    this.#status = null;
    this.#idleSince = null;
    this.#stopping = false;
    this.#log(`Battle Royale process ${child.pid ?? '?'} starting`);
    child.on('message', (message: FromRoyale) => {
      if (this.#child !== child) return;
      if (message.t === 'ready') {
        this.#ready = true;
        this.#log(`Battle Royale process ${child.pid ?? '?'} ready`);
        for (const w of this.#waiting.splice(0)) {
          clearTimeout(w.timer);
          this.#send(w.message, w.socket);
        }
      } else if (message.t === 'status') this.#noteStatus(message.status);
    });
    child.on('error', (error) => this.#log(`Battle Royale process error: ${error.message}`));
    child.once('exit', (code, signal) => {
      if (this.#child !== child) return;
      const crashed = !this.#stopping;
      this.#log(`Battle Royale process ${child.pid ?? '?'} ${crashed ? 'ended unexpectedly' : 'stopped'} (code ${code}, signal ${signal})`);
      if (crashed) this.#crashedAt = this.#now();
      this.#child = null;
      this.#ready = false;
      this.#status = null;
      // Someone joined while an idle process was stopping: they get a fresh one.
      if (!crashed && this.#waiting.length > 0 && this.#ensure()) return;
      for (const w of this.#waiting.splice(0)) {
        clearTimeout(w.timer);
        refuse(w.socket, '503 Service Unavailable');
      }
    });
    return true;
  }

  #noteStatus(status: LobbyStatus): void {
    this.#status = status;
    const empty = status.players + status.away === 0 && status.phase === 'lobby';
    if (!empty) {
      this.#idleSince = null;
      return;
    }
    const now = this.#now();
    this.#idleSince ??= now;
    if (now - this.#idleSince >= (this.#options.idleMs ?? IDLE_MS)) {
      this.#log('Battle Royale process idle: stopping it');
      this.#stop();
    }
  }

  #send(message: UpgradeHandOff, socket: Duplex): void {
    const child = this.#child;
    if (!child?.connected) return refuse(socket, '503 Service Unavailable');
    // The connection goes to the process whole; this one keeps no part of it. A socket that names its
    // server is sent the cluster's way, which ties the HTTP server's close to the child answering for it
    // (a child that's gone never does): unnamed, it goes as a plain connection.
    (socket as Socket & { server: unknown }).server = null;
    child.send(message, socket as Socket, (error) => {
      if (error) return refuse(socket, '503 Service Unavailable');
      // Its handle went with the message; what's left here only holds the HTTP server's count of open connections.
      socket.destroy();
    });
  }

  #stop(): void {
    const child = this.#child;
    if (!child || this.#stopping) return;
    this.#stopping = true;
    this.#ready = false;
    child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
    kill.unref();
    child.once('exit', () => clearTimeout(kill));
  }
}
