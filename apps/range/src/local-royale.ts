/**
 * Local bots (ticket 15, ADR 0010): a Battle Royale on Zero Island with the
 * page's player and 59 bots, played by the same `GameServer` the Battle Royale
 * process runs, in a Web Worker of its own so the bots never take the render
 * thread's time. The page talks to it over the worker's message channel with
 * the protocol a WebSocket carries (`connectPort`), so everything from the
 * lobby to the Preparation, the Ring, Downed and spectating is the online game.
 */
import { GameServer, TICK_SECONDS, WIDE_SCALE, createWorld, decodeLargeNav, messageData, servePort, type NavGraph, type PortLike, type ServerTransport } from '@duty-shooter/fps-core';
import { TEAM_SIZES, buildMapById, mapConcealment, mapSolids } from './map/maps';

const MAP = 'zero-island';
/**
 * Seconds of silence before the page's player is let go. The server's own is
 * for a seat someone else could have; here a minute in another tab, where the
 * page stops sending, shouldn't lose the match.
 */
const IDLE_SECONDS = 600;

export interface LocalRoyaleOptions {
  /** Every match's seed (spawns and circles); a fresh one each match when absent, as on the server. */
  readonly seed?: number;
}

/** The island's Battle Royale server, set up as the Battle Royale process sets up its own. */
export class LocalRoyale {
  readonly server: GameServer;

  constructor(transport: ServerTransport, nav: NavGraph, options: LocalRoyaleOptions = {}) {
    const map = buildMapById(MAP);
    const world = createWorld(mapSolids(map), { ladders: map.ladders ?? [], terrain: map.terrain, concealment: mapConcealment(map), traps: map.soundTraps ?? [] });
    this.server = new GameServer(transport, {
      world,
      map: MAP,
      mode: 'battle-royale',
      spawns: map.spawns.ffa,
      ...(map.towns ? { towns: map.towns } : {}),
      teamSize: TEAM_SIZES[MAP],
      passphrase: '',
      maxPlayers: WIDE_SCALE.seats,
      idleTimeout: IDLE_SECONDS,
      modes: { battleRoyale: options.seed === undefined ? {} : { seed: options.seed } },
      bots: { nav, perTeam: 3, maxPerTeam: WIDE_SCALE.botsPerTeam },
      lobby: true,
    });
  }

  tick(): void {
    this.server.tick();
  }
}

/** The worker's 60 Hz: how many ticks are due by a wall clock (ms). */
export class TickClock {
  /** Ticks run at once to catch up a stall; the rest of a longer one is let go, as the server's loop does. */
  static readonly catchUp = 5;
  #next: number;

  constructor(now: number) {
    this.#next = now + TICK_SECONDS * 1000;
  }

  /** Ticks to run now. */
  due(now: number): number {
    const step = TICK_SECONDS * 1000;
    if (now < this.#next) return 0;
    const behind = Math.floor((now - this.#next) / step) + 1;
    if (behind > TickClock.catchUp) {
      this.#next = now + step;
      return TickClock.catchUp;
    }
    this.#next += behind * step;
    return behind;
  }

  /** Milliseconds until the next tick is due. */
  wait(now: number): number {
    return Math.max(0, this.#next - now);
  }
}

/** What the worker says to the page besides game traffic. */
export type FromLocalRoyale =
  | { readonly t: 'ready' }
  | { readonly t: 'failed'; readonly reason: string }
  /** Every couple of seconds: ticks run, and their cost (ms) on the worker's thread. */
  | { readonly t: 'stats'; readonly ticks: number; readonly seconds: number; readonly mean: number; readonly p99: number; readonly worst: number };

/** What the page says to the worker: start, with the island's nav as bytes or where to fetch it, and a seed for every match (a fresh one each when absent). */
export type ToLocalRoyale = { readonly t: 'start'; readonly nav: Uint8Array | string; readonly seed?: number };

const STATS_MS = 2000;

/**
 * The worker's side: on `start` it builds the island and its nav, says it is
 * ready, then serves connections on the same channel and runs the 60 Hz loop.
 * Returns a stop for tests.
 */
export function serveLocalRoyale(scope: PortLike): () => void {
  const transport = servePort(scope);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const begin = async (message: ToLocalRoyale) => {
    const bytes = typeof message.nav === 'string' ? new Uint8Array(await (await fetch(message.nav)).arrayBuffer()) : message.nav;
    // No staleness check against the island built here: the browser's sines and cosines can differ from
    // Node's in the last bit, which changes the fingerprint and nothing else, and this file comes from the
    // same build as this code (served no-cache with an ETag, so never a release behind).
    const nav = decodeLargeNav(bytes);
    const local = new LocalRoyale(transport, nav, message.seed === undefined ? {} : { seed: message.seed });
    scope.postMessage({ t: 'ready' } satisfies FromLocalRoyale);
    const clock = new TickClock(performance.now());
    const costs: number[] = [];
    let since = performance.now();
    const loop = () => {
      if (stopped) return;
      const due = clock.due(performance.now());
      for (let i = 0; i < due; i++) {
        const at = performance.now();
        local.tick();
        costs.push(performance.now() - at);
      }
      const now = performance.now();
      if (now - since >= STATS_MS && costs.length > 0) {
        const sorted = [...costs].sort((a, b) => a - b);
        scope.postMessage({ t: 'stats', ticks: costs.length, seconds: (now - since) / 1000, mean: costs.reduce((s, c) => s + c, 0) / costs.length, p99: sorted[Math.floor(sorted.length * 0.99)]!, worst: sorted.at(-1)! } satisfies FromLocalRoyale);
        costs.length = 0;
        since = now;
      }
      timer = setTimeout(loop, clock.wait(performance.now()));
    };
    loop();
  };
  let started = false;
  scope.addEventListener('message', (e) => {
    const message = messageData(e) as Partial<ToLocalRoyale> | null;
    if (started || message?.t !== 'start') return;
    started = true;
    begin(message as ToLocalRoyale).catch((error: unknown) => scope.postMessage({ t: 'failed', reason: String(error) } satisfies FromLocalRoyale));
  });
  scope.start?.();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
