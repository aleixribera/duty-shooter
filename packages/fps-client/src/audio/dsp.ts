/**
 * Offline DSP used to render the procedural sounds into AudioBuffers once per AudioContext.
 * Everything here works on plain Float32Arrays so the expensive synthesis happens once (at unlock
 * or first use) and each in-game play() is just a buffer source and a gain node.
 */

export interface Rng {
  next(): number; // [0, 1)
  range(min: number, max: number): number;
  /** Symmetric jitter: value * (1 +- amount). */
  jitter(value: number, amount: number): number;
  bool(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    jitter: (value, amount) => value * (1 + amount * (next() * 2 - 1)),
    bool: (p) => next() < p,
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function samples(sr: number, seconds: number): number {
  return Math.max(1, Math.round(sr * seconds));
}

export function buffer(sr: number, seconds: number): Float32Array {
  return new Float32Array(samples(sr, seconds));
}

export function white(sr: number, seconds: number, rng: Rng): Float32Array {
  const out = buffer(sr, seconds);
  for (let i = 0; i < out.length; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/**
 * Sparse random impulses (grit, crunch, debris, tinkle). `rate` is impulses per second at the
 * envelope's peak; the amplitude of each impulse is random and skewed towards small values.
 */
export function crackle(sr: number, seconds: number, rng: Rng, rate: number, density?: (t: number) => number): Float32Array {
  const out = buffer(sr, seconds);
  const p = rate / sr;
  for (let i = 0; i < out.length; i++) {
    const d = density ? density(i / sr) : 1;
    if (rng.next() < p * d) {
      const a = rng.next();
      out[i] = (rng.bool(0.5) ? 1 : -1) * (0.15 + 0.85 * a * a);
    }
  }
  return out;
}

export type FilterMode = 'lowpass' | 'highpass' | 'bandpass';

/**
 * Topology-preserving state-variable filter (12 dB/oct), in place. `cutoff` may be a function of
 * time in seconds for sweeps. Band-pass output has unity gain at the centre frequency.
 */
export function svf(
  data: Float32Array,
  sr: number,
  mode: FilterMode,
  cutoff: number | ((t: number) => number),
  q = 0.7071,
): Float32Array {
  const k = 1 / q;
  let ic1 = 0;
  let ic2 = 0;
  const nyq = sr * 0.49;
  let g = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const update = (fc: number): void => {
    const f = Math.min(Math.max(fc, 10), nyq);
    g = Math.tan((Math.PI * f) / sr);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  const sweep = typeof cutoff === 'function' ? cutoff : null;
  if (!sweep) update(cutoff as number);
  for (let i = 0; i < data.length; i++) {
    if (sweep && (i & 15) === 0) update(sweep(i / sr));
    const v0 = data[i] ?? 0;
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    data[i] = mode === 'lowpass' ? v2 : mode === 'highpass' ? v0 - k * v1 - v2 : k * v1;
  }
  return data;
}

export function lp(data: Float32Array, sr: number, fc: number | ((t: number) => number), q?: number): Float32Array {
  return svf(data, sr, 'lowpass', fc, q);
}
export function hp(data: Float32Array, sr: number, fc: number | ((t: number) => number), q?: number): Float32Array {
  return svf(data, sr, 'highpass', fc, q);
}
export function bp(data: Float32Array, sr: number, fc: number | ((t: number) => number), q?: number): Float32Array {
  return svf(data, sr, 'bandpass', fc, q);
}

/** Multiply in place by an attack (linear, seconds) then exponential decay (time constant, seconds). */
export function adEnv(data: Float32Array, sr: number, attack: number, tau: number, hold = 0): Float32Array {
  const aN = attack * sr;
  const hN = aN + hold * sr;
  const k = Math.exp(-1 / Math.max(tau * sr, 1));
  let e = 1;
  for (let i = 0; i < data.length; i++) {
    let g: number;
    if (i < aN) g = i / aN;
    else if (i < hN) g = 1;
    else {
      g = e;
      e *= k;
    }
    data[i] = (data[i] ?? 0) * g;
  }
  return data;
}

/** Multiply in place by an arbitrary envelope of time in seconds. */
export function shape(data: Float32Array, sr: number, env: (t: number) => number): Float32Array {
  for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * env(i / sr);
  return data;
}

export function peak(data: Float32Array): number {
  let m = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] ?? 0);
    if (v > m) m = v;
  }
  return m;
}

export function normalize(data: Float32Array, target = 1): Float32Array {
  const m = peak(data);
  if (m > 1e-9) {
    const s = target / m;
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * s;
  }
  return data;
}

/** Add `src * gain` into `dst` starting at `at` seconds. */
export function mix(dst: Float32Array, src: Float32Array, sr: number, at: number, gain: number): void {
  const off = Math.round(at * sr);
  const end = Math.min(dst.length, off + src.length);
  for (let i = Math.max(0, off); i < end; i++) dst[i] = (dst[i] ?? 0) + (src[i - off] ?? 0) * gain;
}

/** A filtered noise burst normalised to peak 1 (before gain), mixed into dst. */
export function noiseBurst(
  dst: Float32Array,
  sr: number,
  rng: Rng,
  o: {
    at: number;
    attack: number;
    tau: number;
    gain: number;
    mode?: FilterMode;
    freq?: number | ((t: number) => number);
    q?: number;
    /** Run the filter twice (24 dB/oct). */
    steep?: boolean;
    length?: number;
  },
): void {
  const len = o.length ?? Math.min(o.attack + o.tau * 7, 2);
  const n = white(sr, len, rng);
  if (o.mode && o.freq !== undefined) {
    svf(n, sr, o.mode, o.freq, o.q);
    if (o.steep) svf(n, sr, o.mode, o.freq, o.q);
  }
  adEnv(n, sr, o.attack, o.tau);
  normalize(n, 1);
  mix(dst, n, sr, o.at, o.gain);
}

/**
 * Decaying sinusoidal modes (struck metal, wood, glass). Each mode starts at zero phase with a
 * tiny attack so it never clicks; the click comes from whatever noise layer is struck with it.
 */
export function modes(
  dst: Float32Array,
  sr: number,
  at: number,
  freqs: readonly number[],
  amps: readonly number[],
  taus: readonly number[],
  gain: number,
  attack = 0.0003,
): void {
  const off = Math.round(at * sr);
  const aN = Math.max(1, attack * sr);
  for (let m = 0; m < freqs.length; m++) {
    const f = freqs[m] ?? 0;
    if (f <= 0 || f >= sr * 0.48) continue;
    const a = (amps[m] ?? 0) * gain;
    const tau = taus[m] ?? 0.01;
    const n = Math.min(dst.length - off, Math.round(tau * 8 * sr));
    // Damped sinusoid by recurrence: y[n] = 2 r cos(w) y[n-1] - r^2 y[n-2] = r^n sin(w n).
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp(-1 / (tau * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = i === 0 ? 0 : i === 1 ? r * Math.sin(w) : c1 * y1 - c2 * y2;
      y2 = y1;
      y1 = y;
      const idx = off + i;
      if (idx >= 0) dst[idx] = (dst[idx] ?? 0) + a * (i < aN ? i / aN : 1) * y;
    }
  }
}

/**
 * A sine with an exponential pitch glide from f0 to f1 (time constant glideTau) and an
 * attack/decay amplitude envelope. Used for the low thump layers.
 */
export function thump(
  dst: Float32Array,
  sr: number,
  o: { at: number; f0: number; f1: number; glideTau: number; attack: number; tau: number; gain: number; vibrato?: { rate: number; depth: number } },
): void {
  const off = Math.round(o.at * sr);
  const n = Math.min(dst.length - off, Math.round((o.attack + o.tau * 7) * sr));
  let phase = 0;
  const aN = Math.max(1, o.attack * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.glideTau);
    if (o.vibrato) f *= 1 + o.vibrato.depth * Math.sin(2 * Math.PI * o.vibrato.rate * t);
    phase += (2 * Math.PI * f) / sr;
    const e = i < aN ? i / aN : Math.exp(-(i - aN) / (o.tau * sr));
    const idx = off + i;
    if (idx >= 0) dst[idx] = (dst[idx] ?? 0) + o.gain * e * Math.sin(phase);
  }
}

/** tanh saturation normalised so that +-1 maps to +-1. Glues layers like a hot recording. */
export function saturate(data: Float32Array, drive: number): Float32Array {
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh((data[i] ?? 0) * drive) * norm;
  return data;
}

/** Short raised-cosine fades so a buffer never starts or ends with a step. */
export function fadeEdges(data: Float32Array, sr: number, fadeIn = 0, fadeOut = 0.01): Float32Array {
  const inN = Math.round(fadeIn * sr);
  for (let i = 0; i < inN && i < data.length; i++) data[i] = (data[i] ?? 0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / inN));
  const outN = Math.min(data.length, Math.round(fadeOut * sr));
  for (let i = 0; i < outN; i++) {
    const idx = data.length - 1 - i;
    data[idx] = (data[idx] ?? 0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / outN));
  }
  return data;
}

/** Final pass for any rendered one-shot: remove DC/rumble, fade the tail, normalise the peak. */
export function finish(data: Float32Array, sr: number, peakTarget = 0.5, hpHz = 30): Float32Array {
  hp(data, sr, hpHz);
  fadeEdges(data, sr, 0, Math.min(0.03, (data.length / sr) * 0.2));
  return normalize(data, peakTarget);
}

/** Random times in [start, end) with optional bias towards the start (bias > 1). */
export function scatter(rng: Rng, count: number, start: number, end: number, bias = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(start + (end - start) * Math.pow(rng.next(), bias));
  return out.sort((a, b) => a - b);
}

/** Smoothed random gain wobble (rolling, uneven decay instead of a perfectly smooth one). */
export function wobble(rng: Rng, seconds: number, step: number, depth: number): (t: number) => number {
  const points: number[] = [];
  for (let i = 0; i <= Math.ceil(seconds / step) + 1; i++) points.push(1 + depth * (rng.next() * 2 - 1));
  return (t) => {
    const x = t / step;
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return (points[i] ?? 1) * (1 - s) + (points[i + 1] ?? 1) * s;
  };
}
