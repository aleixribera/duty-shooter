import type { Vec3 } from '@duty-shooter/fps-core';
import type { CameraKey } from './map/definition';

/** A camera pose along a path. */
export interface CameraPose {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

/** Shortest signed difference b - a between two angles. */
function angleTo(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Plays a camera path at a steady speed: position moves straight between keys, the view turns along with it. */
export class CameraPath {
  readonly #keys: readonly CameraKey[];
  readonly #at: number[] = [0];
  readonly length: number;

  constructor(keys: readonly CameraKey[]) {
    if (keys.length < 2) throw new Error('A camera path needs at least two keys');
    this.#keys = keys;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!.position;
      const b = keys[i]!.position;
      this.#at.push(this.#at[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    this.length = this.#at[this.#at.length - 1]!;
  }

  /** The pose `distance` metres along the path (clamped to its ends). */
  pose(distance: number): CameraPose {
    const s = Math.min(Math.max(distance, 0), this.length);
    let i = 1;
    while (i < this.#keys.length - 1 && this.#at[i]! < s) i++;
    const a = this.#keys[i - 1]!;
    const b = this.#keys[i]!;
    const span = this.#at[i]! - this.#at[i - 1]!;
    const t = span > 0 ? (s - this.#at[i - 1]!) / span : 1;
    const lerp = (p: number, q: number) => p + (q - p) * t;
    return {
      position: [lerp(a.position[0], b.position[0]), lerp(a.position[1], b.position[1]), lerp(a.position[2], b.position[2])],
      yaw: a.yaw + angleTo(a.yaw, b.yaw) * t,
      pitch: lerp(a.pitch, b.pitch),
    };
  }
}

/** p50, p95, p99 and max of a sample, in its own units. */
export interface Percentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function percentiles(values: readonly number[]): Percentiles {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { p50: round(at(0.5)), p95: round(at(0.95)), p99: round(at(0.99)), max: round(sorted[sorted.length - 1]!) };
}

/** The mean of a sample, to a thousandth; 0 for none. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}

/**
 * The "1% low": the mean of the slowest hundredth of the frames (at least
 * one), in ms. What a stutter feels like, where the average hides it.
 */
export function onePercentLow(frameMs: readonly number[]): number {
  if (frameMs.length === 0) return 0;
  const sorted = [...frameMs].sort((a, b) => b - a);
  return mean(sorted.slice(0, Math.max(1, Math.round(sorted.length / 100))));
}

export interface BenchResult {
  readonly frames: number;
  /** Frame-to-frame time (ms). */
  readonly frameMs: Percentiles;
  /** The average frame time (ms), and the average of the slowest 1% of frames. */
  readonly meanMs: number;
  readonly low1Ms: number;
  /** The render scale over the run where dynamic resolution moved it: where it sat most (the median) and the least it went. Null with the scale fixed. */
  readonly renderScale: { readonly settled: number; readonly min: number } | null;
  /** GPU time per frame (ms), where the browser exposes timestamp queries; null otherwise. */
  readonly gpuMs: Percentiles | null;
  readonly drawCalls: { readonly mean: number; readonly max: number };
  readonly triangles: { readonly mean: number; readonly max: number };
}

export interface BenchReport extends BenchResult {
  readonly map: string;
  /** The quality tier drawn. */
  readonly tier: string;
  readonly backend: string;
  /** The graphics adapter's name, or '' where the browser keeps it. */
  readonly adapter: string;
  /** The size drawn (px), at the tier's own render scale and under its pixel cap: a tier that renders smaller says so here. */
  readonly resolution: readonly [number, number];
  /** Page start to the map's first rendered frame (ms). */
  readonly loadMs: number;
}

/** What the benchmark needs from the renderer each frame. */
export interface FrameStats {
  readonly drawCalls: number;
  readonly triangles: number;
}

/**
 * Flies a camera path once, measuring each frame. Call `frame` before
 * rendering (it says where the camera goes, or that the run is over) and
 * `rendered` after.
 */
export class Benchmark {
  readonly #path: CameraPath;
  /** Camera speed (m/s), and a still warm-up before the run (s) so shader compiles stay out of it. */
  readonly #speed: number;
  readonly #warmup: number;
  #start: number | null = null;
  #last: number | null = null;
  readonly #frameMs: number[] = [];
  readonly #gpuMs: number[] = [];
  readonly #draws: number[] = [];
  readonly #tris: number[] = [];
  readonly #scales: number[] = [];
  #result: BenchResult | null = null;

  constructor(keys: readonly CameraKey[], options: { speed?: number; warmup?: number } = {}) {
    this.#path = new CameraPath(keys);
    this.#speed = options.speed ?? 6;
    this.#warmup = options.warmup ?? 2;
  }

  /** What the run measured, once it is over. */
  get result(): BenchResult | null {
    return this.#result;
  }

  /** Where the camera goes this frame, or null when the run is over. */
  frame(now: number): CameraPose | null {
    if (this.#result) return null;
    this.#start ??= now;
    const t = (now - this.#start) / 1000 - this.#warmup;
    if (t * this.#speed > this.#path.length) {
      this.#finish();
      return null;
    }
    return this.#path.pose(Math.max(0, t) * this.#speed);
  }

  /** How far through the run, 0 to 1 (0 through the warm-up). */
  progress(now: number): number {
    if (this.#start === null) return 0;
    if (this.#result) return 1;
    return Math.min(1, Math.max(0, (((now - this.#start) / 1000 - this.#warmup) * this.#speed) / this.#path.length));
  }

  /** Past the warm-up at `now`: the frames from here are the ones measured. */
  measuring(now: number): boolean {
    return this.#start !== null && !this.#result && (now - this.#start) / 1000 > this.#warmup;
  }

  /** How long the run takes (s), warm-up and all. */
  get seconds(): number {
    return this.#warmup + this.#path.length / this.#speed;
  }

  /** Records the frame just drawn (outside the warm-up). `scale` is the render scale it was drawn at, where dynamic resolution moves it. */
  rendered(now: number, stats: FrameStats, scale?: number): void {
    if (this.#start === null) return;
    // Both ends of the frame after the warm-up, so a compile stall that began in it is not counted.
    const after = (t: number) => (t - this.#start!) / 1000 > this.#warmup;
    if (after(now) && this.#last !== null && after(this.#last)) {
      this.#frameMs.push(now - this.#last);
      this.#draws.push(stats.drawCalls);
      this.#tris.push(stats.triangles);
      if (scale !== undefined) this.#scales.push(scale);
    }
    this.#last = now;
  }

  /** GPU time (ms) per frame, as resolved from timestamp queries. */
  gpu(ms: number): void {
    if (this.#start !== null && Number.isFinite(ms) && ms > 0) this.#gpuMs.push(ms);
  }

  #finish(): void {
    const whole = (v: readonly number[]) => Math.round(mean(v));
    const scales = [...this.#scales].sort((a, b) => a - b);
    this.#result = {
      frames: this.#frameMs.length,
      frameMs: percentiles(this.#frameMs),
      meanMs: mean(this.#frameMs),
      low1Ms: onePercentLow(this.#frameMs),
      renderScale: scales.length ? { settled: scales[Math.floor(scales.length / 2)]!, min: scales[0]! } : null,
      gpuMs: this.#gpuMs.length ? percentiles(this.#gpuMs) : null,
      drawCalls: { mean: whole(this.#draws), max: Math.max(0, ...this.#draws) },
      triangles: { mean: whole(this.#tris), max: Math.max(0, ...this.#tris) },
    };
  }
}

/** A frame time as a player reads it: `6.9 ms (145 fps)`. */
export function frameTimeText(ms: number): string {
  if (!(ms > 0)) return 'no frames';
  return `${ms.toFixed(1)} ms (${Math.round(1000 / ms)} fps)`;
}

/**
 * A benchmark's runs as one line to paste: the release, the tier, the backend
 * and adapter, the resolution, then each map's average and 1% low (and the
 * render scale dynamic resolution settled on, where it was on).
 */
export function benchLine(version: string, reports: readonly BenchReport[], names: (map: string) => string = (m) => m): string {
  const first = reports[0];
  if (!first) return '';
  const head = [`Duty Shooter ${version}`, first.tier, first.backend, first.adapter || 'adapter not named', `drawn at ${first.resolution[0]}x${first.resolution[1]}`];
  const runs = reports.map((r) => {
    const scale = r.renderScale ? `, scale ${Math.round(r.renderScale.settled * 100)}%` : '';
    return `${names(r.map)} ${r.meanMs.toFixed(1)} ms avg, ${r.low1Ms.toFixed(1)} ms 1% low${scale}`;
  });
  return [...head, ...runs].join(' | ');
}
