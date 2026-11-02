import type { PlayerId } from '../simulation';

/** The parts of a server tick, in the order they run. */
export type TickPhase = 'input' | 'plan' | 'think' | 'sim' | 'mode' | 'events' | 'send';

/** What a tick did. One object is reused from tick to tick: read it, don't keep it. */
export interface TickFacts {
  /** Bots asked for a usercmd; a far one may keep to its last. */
  thoughts: number;
  /** Routes planned. */
  plans: number;
  /** Grenade arcs simulated for bots' aim. */
  arcs: number;
  /** Shots, deaths, downs and grenades exploding. */
  shots: number;
  deaths: number;
  downs: number;
  blasts: number;
  /** Grenades in flight. */
  grenades: number;
  /** Snapshots sent, and their bytes before compression. */
  snapshots: number;
  bytes: number;
  /** The mode's events: a Stage, a match's start or end. */
  modeEvents: string[];
}

export function noFacts(): TickFacts {
  return { thoughts: 0, plans: 0, arcs: 0, shots: 0, deaths: 0, downs: 0, blasts: 0, grenades: 0, snapshots: 0, bytes: 0, modeEvents: [] };
}

/** The game server's side of a profile: stamps, one call each, cheap enough for every tick of a live server. */
export interface TickProbe {
  start(): void;
  /** `name` has just finished. */
  phase(name: TickPhase): void;
  /** One bot has just finished thinking, and is now doing `state`. */
  thought(id: PlayerId, state: string): void;
  end(facts: TickFacts): void;
}

export interface Collection {
  /** Minor (scavenge), major (mark-compact), incremental or weak callbacks. */
  readonly kind: string;
  /** How long it held the game's thread. */
  readonly ms: number;
  /** Milliseconds after the tick's start it began, negative if before. */
  readonly offset: number;
}

/** A tick over the line, and what it was doing. */
export interface SlowTick {
  /** When it started, on the clock given to the profiler. */
  readonly at: number;
  /** Milliseconds from start to end, and how many of them the game's thread was on a CPU. */
  readonly wall: number;
  readonly cpu: number;
  /** How late the tick started. */
  readonly lag: number;
  readonly phases: Readonly<Record<string, number>>;
  readonly slowestBot: { readonly id: PlayerId; readonly state: string; readonly ms: number } | null;
  readonly facts: TickFacts;
  readonly gc: readonly Collection[];
  /** `stall`, `gc:<kind>` or `work:<phase>`: see {@link causeOf}. */
  readonly cause: string;
}

/** The part of a tick a cause must account for to take the blame. */
const BLAME = 0.4;

/**
 * Why a tick was slow. A collection comes first: it may run parallel and leave
 * the game's thread waiting off the CPU, which looks like a stall but isn't.
 * Then a stall: wall time the thread wasn't on a CPU, so the machine or a cap
 * took it, whatever the tick was doing. Otherwise it's the tick's own work, the
 * phase that took longest.
 */
export function causeOf(tick: Omit<SlowTick, 'cause'>): string {
  const biggest = [...tick.gc].sort((a, b) => b.ms - a.ms)[0];
  const collected = tick.gc.reduce((sum, c) => sum + c.ms, 0);
  if (biggest && collected >= tick.wall * BLAME) return `gc:${biggest.kind}`;
  if (tick.wall - tick.cpu >= tick.wall * BLAME) return 'stall';
  const [phase] = Object.entries(tick.phases).sort((a, b) => b[1] - a[1])[0] ?? ['unknown'];
  return `work:${phase}`;
}

export interface TickProfilerOptions {
  /** Milliseconds, a monotonic clock. */
  readonly now: () => number;
  /** Milliseconds of CPU this thread has used. */
  readonly cpu: () => number;
  /** Ticks at or over this are reported. */
  readonly slowMs: number;
  /** How long a slow tick waits for the collector's report, which arrives after it. */
  readonly settleMs?: number;
  readonly onSlow: (tick: SlowTick) => void;
}

interface Held {
  readonly tick: Omit<SlowTick, 'gc' | 'cause'>;
  readonly end: number;
}

/**
 * Names what a slow tick did. A fast tick costs a clock read per phase and per
 * thinking bot, and a CPU read at each end: about 4 µs with 58 bots, a
 * thousandth of a 3 ms tick (`.scratch/battle-royale/ticks/probe-cost.mjs`).
 */
export class TickProfiler implements TickProbe {
  readonly #now: () => number;
  readonly #cpu: () => number;
  readonly #slowMs: number;
  readonly #settleMs: number;
  readonly #onSlow: (tick: SlowTick) => void;
  #start = 0;
  #startCpu = 0;
  #lag = 0;
  #stamp = 0;
  #phases: Record<string, number> = {};
  #slowestBot: { id: PlayerId; state: string; ms: number } | null = null;
  #held: Held[] = [];
  #collections: { at: number; ms: number; kind: string }[] = [];
  #causes: Record<string, number> = {};

  constructor(options: TickProfilerOptions) {
    this.#now = options.now;
    this.#cpu = options.cpu;
    this.#slowMs = options.slowMs;
    this.#settleMs = options.settleMs ?? 50;
    this.#onSlow = options.onSlow;
  }

  /** The next tick is starting `lag` ms after it was due. */
  willStart(lag: number): void {
    this.#lag = lag;
  }

  start(): void {
    this.#phases = {};
    this.#slowestBot = null;
    this.#startCpu = this.#cpu();
    this.#start = this.#stamp = this.#now();
  }

  phase(name: TickPhase): void {
    const now = this.#now();
    this.#phases[name] = now - this.#stamp + (this.#phases[name] ?? 0);
    this.#stamp = now;
  }

  thought(id: PlayerId, state: string): void {
    const now = this.#now();
    const ms = now - this.#stamp;
    this.#phases['think'] = ms + (this.#phases['think'] ?? 0);
    this.#stamp = now;
    if (!this.#slowestBot || ms > this.#slowestBot.ms) this.#slowestBot = { id, state, ms };
  }

  end(facts: TickFacts): void {
    const end = this.#now();
    const wall = end - this.#start;
    if (wall < this.#slowMs) return;
    const cpu = this.#cpu() - this.#startCpu;
    this.#held.push({ end, tick: { at: this.#start, wall, cpu, lag: this.#lag, phases: this.#phases, slowestBot: this.#slowestBot, facts: { ...facts, modeEvents: [...facts.modeEvents] } } });
  }

  /** The collector ran for `ms` from `at`, on the same clock. */
  gc(at: number, ms: number, kind: string): void {
    this.#collections.push({ at, ms, kind });
  }

  /** Hands over the slow ticks the collector has had time to report on. Call it often; it's nothing when there's none. */
  flush(): void {
    const settled = this.#now() - this.#settleMs;
    while (this.#held.length > 0 && this.#held[0]!.end <= settled) {
      const { tick, end } = this.#held.shift()!;
      const gc = this.#collections.filter((c) => c.at < end && c.at + c.ms > tick.at).map((c) => ({ kind: c.kind, ms: c.ms, offset: c.at - tick.at }));
      const slow = { ...tick, gc, cause: causeOf({ ...tick, gc }) };
      this.#causes[slow.cause] = (this.#causes[slow.cause] ?? 0) + 1;
      this.#onSlow(slow);
    }
    const oldest = this.#held[0] ? this.#held[0].tick.at : settled;
    if (this.#collections.length > 8) this.#collections = this.#collections.filter((c) => c.at + c.ms >= oldest);
  }

  /** Slow ticks by cause since the last call. */
  takeCauses(): Readonly<Record<string, number>> {
    const causes = this.#causes;
    this.#causes = {};
    return causes;
  }

  /** Collections kept in case a held tick needs them. */
  get heldCollections(): number {
    return this.#collections.length;
  }
}
