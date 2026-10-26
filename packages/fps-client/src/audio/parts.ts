/**
 * Reusable foley building blocks (cloth, gear rattle, metal clacks, thuds) rendered offline into
 * a mono Float32Array. All gains are relative; each recipe normalises its final peak.
 */
import { bp, crackle, hp, mix, modes, noiseBurst, normalize, shape, thump, white, wobble, type Rng } from './dsp';

/** Fabric rustle: band-passed noise with a fast irregular "scratchy" amplitude wobble. */
export function cloth(dst: Float32Array, sr: number, rng: Rng, at: number, dur: number, gain: number, center = 1400): void {
  const n = white(sr, dur, rng);
  bp(n, sr, (t) => center * (0.8 + 0.4 * (t / dur)), 0.55);
  const wob = wobble(rng, dur, 0.011, 0.8);
  const att = Math.min(0.06, dur * 0.3);
  shape(n, sr, (t) => {
    const e = t < att ? t / att : Math.cos(((t - att) / (dur - att)) * Math.PI * 0.5);
    return Math.max(0, e) * Math.max(0, wob(t));
  });
  normalize(n, 1);
  mix(dst, n, sr, at, gain);
  // Fibre crackle on top.
  const c = crackle(sr, dur, rng, 600, (t) => Math.max(0, Math.sin((t / dur) * Math.PI)));
  bp(c, sr, 3200, 0.8);
  normalize(c, 1);
  mix(dst, c, sr, at, gain * 0.22);
}

/** One small metallic clink (sling swivel, buckle, mag in pouch). */
export function clink(dst: Float32Array, sr: number, rng: Rng, at: number, base: number, gain: number, tau = 0.009): void {
  noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.0006, gain: gain * 0.6, mode: 'highpass', freq: 4000, length: 0.006 });
  modes(dst, sr, at, [base, base * 1.53, base * 2.31, base * 3.17], [1, 0.6, 0.4, 0.2], [tau, tau * 0.7, tau * 0.5, tau * 0.35], gain);
}

/** Loose gear rattle: `count` clinks scattered over `span` seconds. */
export function rattle(dst: Float32Array, sr: number, rng: Rng, at: number, span: number, count: number, gain: number, lo = 1800, hi = 3800): void {
  for (let i = 0; i < count; i++) {
    const t = at + span * Math.pow(rng.next(), 1.4);
    clink(dst, sr, rng, t, rng.range(lo, hi), gain * rng.range(0.35, 1), rng.range(0.005, 0.012));
  }
}

/** A solid mechanical metal-on-metal clack (bolt, latch, mag catch). */
export function clack(
  dst: Float32Array,
  sr: number,
  rng: Rng,
  at: number,
  o: { noiseFreq: number; base: number; gain: number; tau?: number; body?: number },
): void {
  const tau = o.tau ?? 0.014;
  noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.0018, gain: o.gain, mode: 'bandpass', freq: o.noiseFreq, q: 0.9, length: 0.02 });
  noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.0007, gain: o.gain * 0.5, mode: 'highpass', freq: 5000, length: 0.006 });
  const b = o.base;
  modes(dst, sr, at, [b, b * 1.47, b * 2.09, b * 2.56, b * 3.3], [1, 0.6, 0.45, 0.3, 0.2], [tau, tau * 0.7, tau * 0.55, tau * 0.4, tau * 0.3], o.gain * 0.5);
  if (o.body) thump(dst, sr, { at, f0: o.body * 1.15, f1: o.body, glideTau: 0.008, attack: 0.0003, tau: 0.007, gain: o.gain * 0.35 });
}

/** A low body thud: low-passed noise plus a short falling sine. */
export function thud(dst: Float32Array, sr: number, rng: Rng, at: number, o: { freq: number; gain: number; tau: number; pitch?: number }): void {
  noiseBurst(dst, sr, rng, { at, attack: 0.001, tau: o.tau, gain: o.gain, mode: 'lowpass', freq: o.freq, steep: true });
  const f = o.pitch ?? o.freq * 0.45;
  thump(dst, sr, { at, f0: f * 1.5, f1: f, glideTau: o.tau * 0.5, attack: 0.0015, tau: o.tau * 1.2, gain: o.gain * 0.7 });
}

/** Metallic sliding friction (mag in the well, charging handle travel). */
export function scrape(dst: Float32Array, sr: number, rng: Rng, at: number, dur: number, gain: number, f0: number, f1: number): void {
  const n = white(sr, dur, rng);
  bp(n, sr, (t) => f0 + (f1 - f0) * (t / dur), 3.5);
  const wob = wobble(rng, dur, 0.006, 0.6);
  shape(n, sr, (t) => Math.sin(Math.PI * Math.min(1, t / dur)) * Math.max(0, wob(t)));
  normalize(n, 1);
  mix(dst, n, sr, at, gain);
  const g = crackle(sr, dur, rng, 900);
  hp(g, sr, 2500);
  normalize(g, 1);
  mix(dst, g, sr, at, gain * 0.25);
}

/** Air whoosh: band-passed noise with the centre swept along a bell-shaped gust. */
export function whoosh(dst: Float32Array, sr: number, rng: Rng, at: number, dur: number, gain: number, lo: number, hi: number): void {
  const n = white(sr, dur, rng);
  const peakAt = dur * 0.42;
  const bell = (t: number): number => Math.exp(-(((t - peakAt) / (dur * 0.22)) ** 2));
  bp(n, sr, (t) => lo + (hi - lo) * bell(t), 1.6);
  shape(n, sr, bell);
  normalize(n, 1);
  mix(dst, n, sr, at, gain);
}
