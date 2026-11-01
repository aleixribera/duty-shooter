/** Width of a histogram bucket, in milliseconds. */
const BUCKET_MS = 0.25;
/** The top bucket holds this many milliseconds and everything above; `slowest` keeps the true worst. */
const TOP_MS = 100;
const TOP = TOP_MS / BUCKET_MS;

/** A stretch of the game loop: what the LOG_STATS line prints and the load test adds up. */
export interface TickWindow {
  readonly ticks: number;
  /** Milliseconds per tick. */
  readonly average: number;
  readonly p50: number;
  readonly p99: number;
  readonly slowest: number;
  /** Ticks that started a whole tick late. */
  readonly late: number;
  /** Ticks in each bucket, by bucket number. */
  readonly buckets: Readonly<Record<number, number>>;
}

/** The milliseconds under which this share of the ticks fell. */
function percentile(buckets: Readonly<Record<number, number>>, ticks: number, share: number): number {
  const rank = Math.ceil(ticks * share);
  let seen = 0;
  for (const bucket of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
    seen += buckets[bucket]!;
    if (seen >= rank) return bucket * BUCKET_MS;
  }
  return 0;
}

/** Tick costs as a histogram: one counter a tick, and windows add up into true percentiles. */
export class TickCosts {
  #buckets: Record<number, number> = {};
  #ticks = 0;
  #total = 0;
  #slowest = 0;
  #late = 0;

  record(cost: number, late = false): void {
    const bucket = Math.min(TOP, Math.ceil(cost / BUCKET_MS));
    this.#buckets[bucket] = (this.#buckets[bucket] ?? 0) + 1;
    this.#ticks += 1;
    this.#total += cost;
    this.#slowest = Math.max(this.#slowest, cost);
    if (late) this.#late += 1;
  }

  /** The window since the last call. */
  take(): TickWindow {
    const ticks = this.#ticks;
    const taken = { ticks, average: ticks ? this.#total / ticks : 0, p50: percentile(this.#buckets, ticks, 0.5), p99: percentile(this.#buckets, ticks, 0.99), slowest: this.#slowest, late: this.#late, buckets: this.#buckets };
    this.#buckets = {};
    this.#ticks = this.#total = this.#slowest = this.#late = 0;
    return taken;
  }

  /** Windows added up into one. */
  static merge(windows: readonly TickWindow[]): TickWindow {
    const buckets: Record<number, number> = {};
    for (const w of windows) for (const [bucket, count] of Object.entries(w.buckets)) buckets[Number(bucket)] = (buckets[Number(bucket)] ?? 0) + count;
    const ticks = windows.reduce((sum, w) => sum + w.ticks, 0);
    const total = windows.reduce((sum, w) => sum + w.average * w.ticks, 0);
    return { ticks, average: ticks ? total / ticks : 0, p50: percentile(buckets, ticks, 0.5), p99: percentile(buckets, ticks, 0.99), slowest: Math.max(0, ...windows.map((w) => w.slowest)), late: windows.reduce((sum, w) => sum + w.late, 0), buckets };
  }
}
