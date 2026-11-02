import { PerformanceObserver, constants } from 'node:perf_hooks';
import { TickProfiler, type SlowTick } from '@duty-shooter/fps-core';

/** Half a tick: no player feels it, but it's the room left before one they do. */
const SLOW_TICK_MS = 8;
/** The bar a tick has to meet: one frame of 60. */
const TICK_BAR_MS = 1000 / 60;
/** Lines a stretch of {@link LOG_WINDOW_MS} may print: all of the first few, then only ticks over the bar. A machine that stalls for seconds shouldn't fill the log as well. */
const QUIET_LINES = 12;
const MOST_LINES = 60;
const LOG_WINDOW_MS = 10_000;

const GC_KINDS: Readonly<Record<number, string>> = {
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weak',
};

/** One log line, on the wall clock so it lines up with anything else watching the machine. */
export function slowLine(tick: SlowTick): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `slow ${JSON.stringify({
    ...tick,
    at: Math.round(performance.timeOrigin + tick.at),
    wall: round(tick.wall),
    cpu: round(tick.cpu),
    lag: round(tick.lag),
    phases: Object.fromEntries(Object.entries(tick.phases).map(([phase, ms]) => [phase, round(ms)])),
    slowestBot: tick.slowestBot && { ...tick.slowestBot, ms: round(tick.slowestBot.ms) },
    gc: tick.gc.map((c) => ({ ...c, ms: round(c.ms), offset: round(c.offset) })),
  })}`;
}

/** Decides which slow ticks reach the log. */
export class SlowLog {
  readonly #print: (line: string) => void;
  #since = -Infinity;
  #lines = 0;

  constructor(print: (line: string) => void) {
    this.#print = print;
  }

  write(tick: SlowTick): void {
    if (tick.at - this.#since >= LOG_WINDOW_MS) {
      this.#since = tick.at;
      this.#lines = 0;
    }
    if (this.#lines >= (tick.wall >= TICK_BAR_MS ? MOST_LINES : QUIET_LINES)) return;
    this.#lines += 1;
    this.#print(slowLine(tick));
  }
}

/** A profiler on this thread's clocks. */
export function clockedProfiler(slowMs: number, onSlow: (tick: SlowTick) => void): TickProfiler {
  return new TickProfiler({
    now: () => performance.now(),
    cpu: () => {
      const { user, system } = process.threadCpuUsage();
      return (user + system) / 1000;
    },
    slowMs,
    onSlow,
  });
}

/** A profiler told of the collector's pauses, logging what slow ticks did. */
export function watchTicks(slowMs = SLOW_TICK_MS, print: (line: string) => void = console.log): { readonly profiler: TickProfiler; stop(): void } {
  const log = new SlowLog(print);
  const profiler = clockedProfiler(slowMs, (tick) => log.write(tick));
  const collector = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const { kind } = (entry as unknown as { detail: { kind: number } }).detail;
      profiler.gc(entry.startTime, entry.duration, GC_KINDS[kind] ?? 'other');
    }
  });
  collector.observe({ entryTypes: ['gc'] });
  return { profiler, stop: () => collector.disconnect() };
}
