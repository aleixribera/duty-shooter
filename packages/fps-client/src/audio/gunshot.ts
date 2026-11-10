/**
 * The guns' voices. Every weapon has its own recipe, rendered offline per AudioContext into
 * round-robin banks and layered per shot:
 *
 *   mechanism  the action, different in kind per gun: the M4A1's bolt carrier and buffer spring,
 *              the Wasp 9's light blowback clatter, the Warden 9's slide, the Harrow 12's
 *              receiver thunk and tube rattle, the Ridgeline's striker and ringing barrel.
 *              Heard on your own gun and from a shooter a few metres off.
 *   crack      the muzzle blast's front: an N-wave, a high-passed snap and a presence band.
 *              It is the shot's peak, added after the body is saturated, so the attack stays
 *              under a millisecond.
 *   body       band-passed noise where a recording of that calibre carries its energy, and the
 *              barrel's own resonance.
 *   sub        the low thump and, for your own gun (and part of it for the big bores at any
 *              distance), the sub under it.
 *   tail       what the place gives back, baked per gun and per environment: outdoors a few
 *              slaps off walls and a rolling decay; indoors dense early reflections and a short
 *              boom. Each gun's tail has its own length (a pistol's is over in a fifth of a
 *              second, the .308's rolls for more than one), which a shared reverb can't give:
 *              the sound system's convolver now adds only a faint bloom on top.
 *
 * Your own gun is a dedicated stereo close bank (more sub, more mechanism, decorrelated air).
 * Past 40 m the near shot cross-fades to the far bank of the gun's family (rifle, sniper,
 * shotgun, light): no crack, no mechanism, a dull thump and a long dark tail, fading out at the
 * hearing range's edge.
 */
import { buffer, fadeEdges, hp, lp, mix, modes, noiseBurst, peak, saturate, scatter, thump, white, wobble, type Rng } from './dsp';
import { kitFor } from './kit';
import { upsample } from './nuke';
import { dbToGain, jit, cleanupOnEnd } from './synth-voice';
import { WIDE_MAP, type WeaponId } from '@duty-shooter/fps-core';
import type { SoundParams, Voice, VoiceExtras, VoiceParams } from './types';

type Environment = 'outdoor' | 'indoor';
type Range = readonly [number, number];

// A shot is a variant of each of its layers, so a few of each make many shots: 4 x 3 x 3 of your own.
const LOCAL_VARIANTS = 4;
const NEAR_VARIANTS = 3;
const MECH_VARIANTS = 3;
const TAIL_VARIANTS = 3;
const FAR_VARIANTS = 3;

/** How much taller the N-wave of a third-person shot is than your own gun's. */
const AWAY_FRONT = 1.35;
/** Peak target of every rendered layer: -6 dBFS. */
const PEAK = 0.5;

/** Cuts everything under `hpHz` (0: nothing), fades the end and sets the peak. */
function finishChannels(chs: Float32Array[], sr: number, hpHz: number, fadeOut = 0.04): Float32Array[] {
  let m = 0;
  for (const ch of chs) {
    if (hpHz > 0) hp(ch, sr, hpHz);
    fadeEdges(ch, sr, 0, fadeOut);
    m = Math.max(m, peak(ch));
  }
  if (m > 1e-9) for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] ?? 0) * (PEAK / m);
  return chs;
}

/** A band of the body: band-passed noise at `hz` dying away over `tau`. */
interface Band {
  readonly hz: Range;
  readonly q: number;
  readonly tau: Range;
  readonly gain: number;
}

/** What the place gives back to a shot. */
interface TailShape {
  readonly seconds: number;
  /** The decay's time constant (s): the tail is 40 dB down about 4.6 of these after it peaks. */
  readonly tau: number;
  /** The diffuse part's low-pass: from the first to the second (Hz) over `sweep` s. */
  readonly bright: readonly [number, number, number];
  readonly hp: number;
  /** Discrete reflections: how many, between when (s), how loud and how bright (Hz). */
  readonly slaps: number;
  readonly window: Range;
  readonly slapGain: number;
  readonly slapHz: Range;
  /** A mid band that hangs on (the shotgun's bark), as a gain. */
  readonly mid?: { readonly hz: number; readonly gain: number };
  /** The room's low build-up (indoors), or the low roll off the hills (the big bores outdoors). */
  readonly boom?: { readonly hz: number; readonly gain: number };
  /** How unevenly it decays (0: smoothly). */
  readonly roll: number;
}

interface Recipe {
  /** Length of the dry shot (s). */
  readonly seconds: number;
  /** The N-wave: its length (ms) and its height (the squashed shot under it tops out near 1.3); `away` is how much taller it starts for someone else's shot. */
  readonly front: { readonly ms: Range; readonly gain: number; readonly away?: number };
  /** The snap: high-passed noise over the front. */
  readonly snap: { readonly hz: Range; readonly tau: Range; readonly gain: number };
  /** The presence band that makes a crack a crack. */
  readonly crack: { readonly hz: Range; readonly q: number; readonly tau: Range; readonly gain: number };
  readonly body: readonly Band[];
  /** The barrel or handguard ringing with the shot. */
  readonly ring?: { readonly f0: Range; readonly f1: Range; readonly tau: number; readonly gain: number };
  /** The low thump: a sine falling from f0 to f1, and the low-passed boom with it. */
  readonly low: { readonly f0: Range; readonly f1: Range; readonly glide: number; readonly tau: number; readonly gain: number; readonly boomHz: number; readonly boomTau: number; readonly boom: number };
  /** The sub under your own gun; `carry` is how much of it a third-person shot keeps. */
  readonly sub: { readonly f0: number; readonly f1: number; readonly tau: number; readonly gain: number; readonly carry: number };
  /** How hard the body is driven into saturation, and its level under the crack. */
  readonly drive: number;
  readonly bodyLevel: number;
  /** How hard the whole shot is pressed against the ceiling afterwards: the more, the denser. */
  readonly squash: number;
  /** Everything under this is cut (Hz). */
  readonly hp: number;
  /** The mechanism: its length (s), its draw, and how loud it sits under your own shot. */
  readonly mech: { readonly seconds: number; readonly draw: (m: Float32Array, sr: number, rng: Rng) => void; readonly gain: number };
  readonly tail: Readonly<Record<Environment, TailShape>>;
  /** Tail level under the dry shot, per environment. */
  readonly tailGain: Readonly<Record<Environment, number>>;
  /** The gun's place in the mix: first-person, third-person and far (set against the meters: see .scratch/next-level/audio). */
  readonly gain: { readonly local: number; readonly near: number; readonly far: number };
}

const between = (rng: Rng, r: Range): number => rng.range(r[0], r[1]);

// ---------------------------------------------------------------------------------------------
// Mechanisms
// ---------------------------------------------------------------------------------------------

/** M4A1: the bolt carrier unlocking and running back, slamming home, and the buffer spring's twang in the stock. */
function mechM4(m: Float32Array, sr: number, rng: Rng): void {
  const t1 = rng.range(0.006, 0.01);
  noiseBurst(m, sr, rng, { at: t1, attack: 0.0001, tau: 0.0012, gain: 0.8, mode: 'bandpass', freq: rng.range(2800, 3600), q: 1.2, length: 0.012 });
  const b1 = rng.range(2100, 2600);
  modes(m, sr, t1, [b1, b1 * 1.47, b1 * 2.09, b1 * 2.56, b1 * 3.3], [1, 0.6, 0.5, 0.35, 0.25], [0.01, 0.007, 0.006, 0.004, 0.003], 0.45);
  const t2 = rng.range(0.048, 0.058);
  noiseBurst(m, sr, rng, { at: t2, attack: 0.0001, tau: 0.002, gain: 1, mode: 'bandpass', freq: rng.range(1600, 2000), q: 0.9, length: 0.02 });
  const b2 = rng.range(1250, 1550);
  modes(m, sr, t2, [b2, b2 * 1.52, b2 * 2.21, b2 * 3.07], [1, 0.55, 0.4, 0.25], [0.014, 0.009, 0.006, 0.004], 0.5);
  thump(m, sr, { at: t2, f0: 340, f1: 300, glideTau: 0.01, attack: 0.0003, tau: 0.006, gain: 0.35 });
  const spring = rng.range(680, 760);
  thump(m, sr, { at: t1, f0: spring, f1: spring, glideTau: 1, attack: 0.004, tau: 0.028, gain: 0.12, vibrato: { rate: 33, depth: 0.025 } });
  const b3 = rng.range(2800, 3200);
  modes(m, sr, 0, [b3, b3 * 1.37, b3 * 1.93], [1, 0.6, 0.4], [0.035, 0.025, 0.015], 0.12);
}

/** Wasp 9: a light bolt blown straight back and thrown forward again in a stamped receiver: two quick, thin ticks and sheet metal buzzing. */
function mechSmg(m: Float32Array, sr: number, rng: Rng): void {
  const t1 = rng.range(0.003, 0.005);
  noiseBurst(m, sr, rng, { at: t1, attack: 0.0001, tau: 0.0009, gain: 0.9, mode: 'bandpass', freq: rng.range(3800, 4600), q: 1.4, length: 0.008 });
  const b1 = rng.range(3100, 3600);
  modes(m, sr, t1, [b1, b1 * 1.41, b1 * 2.2, b1 * 2.9], [1, 0.7, 0.45, 0.3], [0.005, 0.004, 0.003, 0.002], 0.5);
  const t2 = rng.range(0.026, 0.032);
  noiseBurst(m, sr, rng, { at: t2, attack: 0.0001, tau: 0.0014, gain: 1, mode: 'bandpass', freq: rng.range(2500, 3000), q: 1.1, length: 0.012 });
  const b2 = rng.range(2000, 2400);
  modes(m, sr, t2, [b2, b2 * 1.5, b2 * 2.3], [1, 0.6, 0.35], [0.008, 0.005, 0.004], 0.55);
  // The receiver's thin sheet, buzzing between the two.
  noiseBurst(m, sr, rng, { at: t1, attack: 0.002, tau: 0.018, gain: 0.22, mode: 'bandpass', freq: rng.range(4800, 5600), q: 2.5, length: 0.08 });
  const spring = rng.range(1100, 1300);
  thump(m, sr, { at: t1, f0: spring, f1: spring, glideTau: 1, attack: 0.002, tau: 0.015, gain: 0.08, vibrato: { rate: 45, depth: 0.03 } });
}

/** Warden 9: the slide driven back against its spring and running home onto the barrel hood: a clack, then a heavier one. */
function mechPistol(m: Float32Array, sr: number, rng: Rng): void {
  const t1 = rng.range(0.009, 0.012);
  noiseBurst(m, sr, rng, { at: t1, attack: 0.0001, tau: 0.0015, gain: 0.7, mode: 'bandpass', freq: rng.range(2000, 2400), q: 1, length: 0.012 });
  const b1 = rng.range(1700, 2000);
  modes(m, sr, t1, [b1, b1 * 1.5, b1 * 2.4], [1, 0.55, 0.3], [0.009, 0.006, 0.004], 0.4);
  const t2 = rng.range(0.04, 0.046);
  noiseBurst(m, sr, rng, { at: t2, attack: 0.0001, tau: 0.002, gain: 1, mode: 'bandpass', freq: rng.range(1350, 1650), q: 0.9, length: 0.016 });
  const b2 = rng.range(1100, 1300);
  modes(m, sr, t2, [b2, b2 * 1.58, b2 * 2.3, b2 * 3.1], [1, 0.6, 0.4, 0.2], [0.012, 0.008, 0.005, 0.003], 0.55);
  thump(m, sr, { at: t2, f0: 420, f1: 380, glideTau: 0.01, attack: 0.0003, tau: 0.005, gain: 0.35 });
  const spring = rng.range(850, 950);
  thump(m, sr, { at: t1, f0: spring, f1: spring * 1.08, glideTau: 0.02, attack: 0.003, tau: 0.02, gain: 0.07, vibrato: { rate: 28, depth: 0.02 } });
}

/** Harrow 12: nothing cycles until the pump is worked; the shot knocks the receiver and sets the shells in the tube rattling. */
function mechShotgun(m: Float32Array, sr: number, rng: Rng): void {
  thump(m, sr, { at: 0.003, f0: rng.range(500, 560), f1: rng.range(410, 450), glideTau: 0.012, attack: 0.0005, tau: 0.012, gain: 0.7 });
  noiseBurst(m, sr, rng, { at: 0.003, attack: 0.0002, tau: 0.003, gain: 0.5, mode: 'bandpass', freq: rng.range(1100, 1400), q: 0.9, length: 0.02 });
  const tube = rng.range(800, 950);
  modes(m, sr, 0.006, [tube, tube * 1.47, tube * 2.3], [1, 0.6, 0.35], [0.03, 0.02, 0.012], 0.28);
  for (const t of scatter(rng, 3, 0.02, 0.1)) noiseBurst(m, sr, rng, { at: t, attack: 0.0001, tau: 0.0012, gain: rng.range(0.15, 0.3), mode: 'bandpass', freq: rng.range(2200, 2900), q: 1.6, length: 0.008 });
}

/** Ridgeline .308: the striker falling, and a heavy free-floated barrel ringing like a struck bar long after the shot. */
function mechSniper(m: Float32Array, sr: number, rng: Rng): void {
  noiseBurst(m, sr, rng, { at: 0, attack: 0.0001, tau: 0.0008, gain: 0.6, mode: 'bandpass', freq: rng.range(3000, 3500), q: 1.3, length: 0.008 });
  const bar = rng.range(1900, 2300);
  // A free bar's partials: 1, 2.76, 5.4.
  modes(m, sr, 0.001, [bar, bar * 2.76, bar * 5.4], [1, 0.45, 0.2], [0.09, 0.05, 0.025], 0.4);
  thump(m, sr, { at: 0.002, f0: rng.range(250, 280), f1: 200, glideTau: 0.015, attack: 0.0006, tau: 0.015, gain: 0.35 });
}

// ---------------------------------------------------------------------------------------------
// The recipes
// ---------------------------------------------------------------------------------------------

const RECIPES: Readonly<Record<WeaponId, Recipe>> = {
  // 5.56 from a 14.5 in barrel: a hard supersonic crack around 3 kHz, a tight body, not much below 100 Hz.
  m4a1: {
    seconds: 0.36,
    front: { ms: [0.28, 0.38], gain: 1.5 },
    snap: { hz: [2400, 3000], tau: [0.002, 0.003], gain: 1 },
    crack: { hz: [2900, 3600], q: 0.8, tau: [0.007, 0.01], gain: 0.9 },
    body: [
      { hz: [750, 950], q: 0.8, tau: [0.016, 0.022], gain: 1 },
      { hz: [1500, 1900], q: 1, tau: [0.009, 0.013], gain: 0.7 },
    ],
    ring: { f0: [240, 280], f1: [170, 200], tau: 0.018, gain: 0.15 },
    low: { f0: [150, 170], f1: [80, 92], glide: 0.022, tau: 0.04, gain: 0.4, boomHz: 190, boomTau: 0.05, boom: 0.2 },
    sub: { f0: 68, f1: 46, tau: 0.07, gain: 0.12, carry: 0 },
    drive: 2,
    bodyLevel: 0.8,
    squash: 1,
    hp: 32,
    mech: { seconds: 0.16, draw: mechM4, gain: 0.3 },
    tail: {
      outdoor: { seconds: 0.5, tau: 0.064, bright: [5500, 900, 0.12], hp: 160, slaps: 4, window: [0.03, 0.2], slapGain: 0.5, slapHz: [1800, 3800], roll: 0.35 },
      indoor: { seconds: 0.55, tau: 0.075, bright: [6000, 800, 0.1], hp: 80, slaps: 16, window: [0.003, 0.05], slapGain: 0.45, slapHz: [2500, 6000], boom: { hz: 240, gain: 0.6 }, roll: 0.15 },
    },
    tailGain: { outdoor: 0.4, indoor: 0.42 },
    gain: { local: 1.3, near: 1.43, far: 3.14 },
  },
  // 9 mm from a short barrel: shorter, brighter, and nearly nothing under 100 Hz.
  smg: {
    seconds: 0.2,
    front: { ms: [0.2, 0.28], gain: 1.45 },
    snap: { hz: [3200, 4200], tau: [0.0015, 0.0022], gain: 1 },
    crack: { hz: [3800, 4600], q: 0.9, tau: [0.004, 0.006], gain: 0.85 },
    body: [
      { hz: [1150, 1450], q: 0.9, tau: [0.009, 0.012], gain: 1 },
      { hz: [2200, 2700], q: 1, tau: [0.006, 0.008], gain: 0.6 },
    ],
    low: { f0: [185, 205], f1: [90, 105], glide: 0.014, tau: 0.02, gain: 0.35, boomHz: 260, boomTau: 0.022, boom: 0.2 },
    sub: { f0: 90, f1: 60, tau: 0.04, gain: 0.1, carry: 0 },
    drive: 1.8,
    bodyLevel: 0.8,
    squash: 1,
    hp: 60,
    mech: { seconds: 0.12, draw: mechSmg, gain: 0.4 },
    tail: {
      outdoor: { seconds: 0.36, tau: 0.046, bright: [7000, 1500, 0.08], hp: 220, slaps: 3, window: [0.02, 0.12], slapGain: 0.5, slapHz: [2400, 4800], roll: 0.3 },
      indoor: { seconds: 0.4, tau: 0.05, bright: [7000, 1100, 0.08], hp: 120, slaps: 14, window: [0.003, 0.04], slapGain: 0.45, slapHz: [3000, 7000], boom: { hz: 300, gain: 0.35 }, roll: 0.15 },
    },
    tailGain: { outdoor: 0.38, indoor: 0.42 },
    gain: { local: 0.96, near: 1.08, far: 1.7 },
  },
  // 12 gauge: no crack to speak of, a broad bark and a big thump at 60-120 Hz, and mids that hang on.
  shotgun: {
    seconds: 0.6,
    front: { ms: [0.9, 1.3], gain: 1.4 },
    snap: { hz: [1200, 1600], tau: [0.003, 0.004], gain: 0.7 },
    crack: { hz: [1700, 2200], q: 0.7, tau: [0.012, 0.016], gain: 0.55 },
    body: [
      { hz: [420, 560], q: 0.7, tau: [0.04, 0.05], gain: 1.3 },
      { hz: [900, 1150], q: 0.8, tau: [0.022, 0.028], gain: 0.9 },
    ],
    ring: { f0: [300, 330], f1: [230, 250], tau: 0.03, gain: 0.3 },
    low: { f0: [125, 138], f1: [68, 76], glide: 0.035, tau: 0.09, gain: 0.8, boomHz: 200, boomTau: 0.11, boom: 0.5 },
    sub: { f0: 72, f1: 40, tau: 0.12, gain: 0.22, carry: 0.35 },
    drive: 2.4,
    bodyLevel: 0.55,
    squash: 1,
    hp: 26,
    mech: { seconds: 0.2, draw: mechShotgun, gain: 0.22 },
    tail: {
      outdoor: { seconds: 1.1, tau: 0.17, bright: [3000, 500, 0.25], hp: 90, slaps: 5, window: [0.04, 0.4], slapGain: 0.5, slapHz: [700, 1800], mid: { hz: 700, gain: 0.6 }, boom: { hz: 160, gain: 0.25 }, roll: 0.4 },
      indoor: { seconds: 0.8, tau: 0.13, bright: [4000, 600, 0.15], hp: 60, slaps: 18, window: [0.003, 0.06], slapGain: 0.45, slapHz: [1200, 4000], mid: { hz: 650, gain: 0.4 }, boom: { hz: 220, gain: 0.7 }, roll: 0.15 },
    },
    tailGain: { outdoor: 0.38, indoor: 0.42 },
    gain: { local: 1.32, near: 1.58, far: 3.71 },
  },
  // .308 from a bolt gun: a crack as hard as the rifle's on the heaviest low end of any, and an echo that rolls for more than a second.
  sniper: {
    seconds: 0.7,
    // In your own hands the .308 is the loudest thing in the game: its front is held under the master's clip knee, and keeps its full height for everyone else.
    front: { ms: [0.36, 0.46], gain: 1.35, away: 1.55 },
    snap: { hz: [1900, 2400], tau: [0.0028, 0.0036], gain: 1 },
    crack: { hz: [2400, 2900], q: 0.8, tau: [0.009, 0.012], gain: 0.85 },
    body: [
      { hz: [620, 780], q: 0.8, tau: [0.028, 0.034], gain: 1.1 },
      { hz: [1250, 1550], q: 0.9, tau: [0.014, 0.018], gain: 0.7 },
    ],
    ring: { f0: [200, 225], f1: [150, 165], tau: 0.03, gain: 0.3 },
    low: { f0: [125, 140], f1: [56, 62], glide: 0.04, tau: 0.11, gain: 0.8, boomHz: 170, boomTau: 0.13, boom: 0.5 },
    sub: { f0: 54, f1: 30, tau: 0.14, gain: 0.3, carry: 0.45 },
    drive: 2.4,
    bodyLevel: 0.5,
    squash: 1,
    hp: 22,
    mech: { seconds: 0.3, draw: mechSniper, gain: 0.2 },
    tail: {
      outdoor: { seconds: 1.9, tau: 0.36, bright: [4500, 450, 0.5], hp: 70, slaps: 7, window: [0.05, 0.9], slapGain: 0.55, slapHz: [900, 2600], boom: { hz: 140, gain: 0.35 }, roll: 0.5 },
      indoor: { seconds: 1.05, tau: 0.17, bright: [5000, 600, 0.15], hp: 55, slaps: 18, window: [0.003, 0.06], slapGain: 0.45, slapHz: [1800, 5000], boom: { hz: 200, gain: 0.6 }, roll: 0.15 },
    },
    tailGain: { outdoor: 0.4, indoor: 0.58 },
    gain: { local: 1.32, near: 1.4, far: 2.98 },
  },
  // 9 mm from a service pistol: a short pop in the mids, over at once.
  pistol: {
    seconds: 0.16,
    front: { ms: [0.3, 0.4], gain: 1.6 },
    snap: { hz: [2600, 3400], tau: [0.0015, 0.002], gain: 0.85 },
    crack: { hz: [3000, 3700], q: 0.9, tau: [0.004, 0.0055], gain: 0.65 },
    body: [
      { hz: [1100, 1400], q: 1.1, tau: [0.009, 0.012], gain: 1.1 },
      { hz: [1900, 2300], q: 1, tau: [0.007, 0.009], gain: 0.5 },
    ],
    low: { f0: [210, 235], f1: [110, 125], glide: 0.012, tau: 0.02, gain: 0.4, boomHz: 300, boomTau: 0.018, boom: 0.2 },
    sub: { f0: 100, f1: 70, tau: 0.03, gain: 0.08, carry: 0 },
    drive: 1.8,
    bodyLevel: 0.8,
    squash: 1,
    hp: 70,
    mech: { seconds: 0.11, draw: mechPistol, gain: 0.3 },
    tail: {
      outdoor: { seconds: 0.3, tau: 0.04, bright: [5000, 1200, 0.07], hp: 250, slaps: 2, window: [0.02, 0.09], slapGain: 0.5, slapHz: [2000, 4000], roll: 0.3 },
      indoor: { seconds: 0.36, tau: 0.045, bright: [6000, 1000, 0.08], hp: 130, slaps: 12, window: [0.003, 0.04], slapGain: 0.35, slapHz: [2500, 6000], boom: { hz: 320, gain: 0.35 }, roll: 0.15 },
    },
    tailGain: { outdoor: 0.38, indoor: 0.36 },
    gain: { local: 1.03, near: 1.03, far: 1.59 },
  },
};

const WEAPONS = Object.keys(RECIPES) as WeaponId[];

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** The dry shot: body and low end saturated together, then the crack laid over them as the peak. */
function renderCore(rng: Rng, sr: number, r: Recipe, local: boolean): Float32Array[] {
  const dry = buffer(sr, r.seconds);
  for (const b of r.body) {
    const tau = between(rng, b.tau);
    noiseBurst(dry, sr, rng, { at: 0, attack: 0.0004, tau, gain: b.gain, mode: 'bandpass', freq: between(rng, b.hz), q: b.q, length: Math.min(r.seconds, tau * 8) });
  }
  if (r.ring) thump(dry, sr, { at: 0, f0: between(rng, r.ring.f0), f1: between(rng, r.ring.f1), glideTau: 0.01, attack: 0.0005, tau: r.ring.tau, gain: r.ring.gain });
  thump(dry, sr, { at: 0.0005, f0: between(rng, r.low.f0), f1: between(rng, r.low.f1), glideTau: r.low.glide, attack: 0.0015, tau: r.low.tau * (local ? 1.25 : 1), gain: r.low.gain * (local ? 1.2 : 0.8) });
  noiseBurst(dry, sr, rng, { at: 0.001, attack: 0.003, tau: r.low.boomTau * (local ? 1.25 : 1), gain: r.low.boom * (local ? 1.2 : 0.8), mode: 'lowpass', freq: r.low.boomHz, steep: true, length: Math.min(r.seconds - 0.01, r.low.boomTau * 9) });
  const sub = r.sub.gain * (local ? 1 : r.sub.carry);
  if (sub > 0) thump(dry, sr, { at: 0.001, f0: r.sub.f0, f1: r.sub.f1, glideTau: 0.04, attack: 0.002, tau: r.sub.tau, gain: sub });
  // Glue: soft saturation packs the body into one dense event, held under the crack.
  saturate(dry, r.drive);
  for (let i = 0; i < dry.length; i++) dry[i] = (dry[i] ?? 0) * r.bodyLevel;

  // The crack: a snap of high-passed noise and the presence band, pressed against the ceiling with the body so the first milliseconds are dense.
  noiseBurst(dry, sr, rng, { at: 0, attack: 0.0001, tau: between(rng, r.snap.tau), gain: r.snap.gain, mode: 'highpass', freq: between(rng, r.snap.hz), steep: true, length: 0.02 });
  const crackTau = between(rng, r.crack.tau);
  noiseBurst(dry, sr, rng, { at: 0.0003, attack: 0.0002, tau: crackTau, gain: r.crack.gain, mode: 'bandpass', freq: between(rng, r.crack.hz), q: r.crack.q, length: crackTau * 8 });
  saturate(dry, r.squash);
  // The muzzle blast's N-wave on top of it all: instant rise, linear fall through zero. It is the shot's peak.
  const nN = Math.max(3, Math.round(between(rng, r.front.ms) * 0.001 * sr));
  // Someone else's shot reaches you through your ears' own filtering, which blunts so short a front: it starts taller.
  const front = r.front.gain * (local ? 1 : (r.front.away ?? AWAY_FRONT));
  for (let i = 0; i < nN; i++) dry[i] = (dry[i] ?? 0) + front * (1 - (2 * i) / nN);

  hp(dry, sr, r.hp);

  // The ground's reflection of the shot's first tenth of a second, darker; the lows are too long a wave to come back as a separate arrival.
  const refl = dry.slice(0, Math.min(dry.length, Math.round(0.12 * sr)));
  hp(lp(refl, sr, 3500), sr, 300);
  fadeEdges(refl, sr, 0, 0.02);
  const out: Float32Array[] = [];
  for (let c = 0; c < (local ? 2 : 1); c++) {
    const ch = Float32Array.from(dry);
    mix(ch, refl, sr, c === 0 ? 0.0046 : 0.0063, local ? 0.24 : 0.3);
    // Decorrelated air so the first-person shot has width without smearing the transient.
    if (local) noiseBurst(ch, sr, rng, { at: 0.002, attack: 0.002, tau: Math.min(0.03, r.seconds / 8), gain: 0.1, mode: 'bandpass', freq: rng.range(800, 1200), q: 0.6, length: Math.min(0.2, r.seconds * 0.8) });
    out.push(ch);
  }
  return finishChannels(out, sr, 0);
}

function renderMech(rng: Rng, sr: number, r: Recipe): Float32Array[] {
  const m = buffer(sr, r.mech.seconds);
  r.mech.draw(m, sr, rng);
  return finishChannels([m], sr, 200, 0.01);
}

/**
 * What the place gives back, in stereo: discrete reflections and a diffuse decay, each side
 * its own. Dull enough to render at half the rate and stretch.
 */
function renderTail(rng: Rng, fullRate: number, t: TailShape): Float32Array[] {
  const sr = fullRate / 2;
  const n = Math.round(t.seconds * sr);
  // The decay, once for both sides: a quick swell, then dying away (unevenly, as echoes do); the lows hang on a little longer.
  const rise = Math.min(0.05, t.window[0] + 0.01);
  const roll = wobble(rng, t.seconds, 0.06, t.roll);
  const decay = new Float32Array(n);
  const slow = new Float32Array(n);
  const k = Math.exp(-1 / (t.tau * sr));
  const kSlow = Math.exp(-1 / (t.tau * 1.2 * sr));
  for (let i = 0, e = 1, eSlow = 1; i < n; i++, e *= k, eSlow *= kSlow) {
    const s = i / sr;
    const up = Math.min(1, (s / rise) ** 2);
    decay[i] = up * e * roll(s);
    slow[i] = up * eSlow;
  }
  /** `band` of the side's noise under an envelope, at `gain` (of its own peak). */
  const layer = (out: Float32Array, band: Float32Array, envelope: Float32Array, gain: number): void => {
    let top = 0;
    for (let i = 0; i < n; i++) {
      const v = (band[i] ?? 0) * (envelope[i] ?? 0);
      band[i] = v;
      if (Math.abs(v) > top) top = Math.abs(v);
    }
    mix(out, band, sr, 0, gain / (top || 1));
  };
  const channels = [0, 1].map(() => {
    const out = new Float32Array(n);
    const noise = white(sr, t.seconds, rng).subarray(0, n);
    layer(out, lp(Float32Array.from(noise), sr, (s) => t.bright[1] + (t.bright[0] - t.bright[1]) * Math.exp(-s / t.bright[2]), 0.6), decay, 1);
    if (t.mid) layer(out, hp(lp(Float32Array.from(noise), sr, t.mid.hz * 1.5, 0.8), sr, t.mid.hz * 0.6, 0.8), decay, t.mid.gain);
    if (t.boom) layer(out, lp(lp(Float32Array.from(noise), sr, t.boom.hz, 0.8), sr, t.boom.hz, 0.7), slow, t.boom.gain);
    // The slaps: the shot coming back off a wall, smeared and darker the later it arrives.
    for (const at of scatter(rng, t.slaps, t.window[0], t.window[1], 1.3)) {
      const late = (at - t.window[0]) / Math.max(1e-6, t.window[1] - t.window[0]);
      const tau = 0.006 + 0.012 * late;
      noiseBurst(out, sr, rng, { at, attack: 0.001, tau, gain: t.slapGain * rng.range(0.5, 1) * Math.exp(-at / (t.tau * 2.5)), mode: 'bandpass', freq: between(rng, t.slapHz) * (1 - 0.5 * late), q: 0.6, length: 0.001 + tau * 5 });
    }
    return out;
  });
  return finishChannels(channels.map((ch) => upsample(ch, Math.round(t.seconds * fullRate))), fullRate, t.hp, Math.min(0.08, t.seconds * 0.2));
}

/**
 * A gun's family as heard from far off (ticket 72): what is left of each kind
 * of shot past ~60 m, so a fight can be told by ear. Rifles a dull thump with a
 * rolling echo; the sniper the supersonic crack arriving ahead of a deep boom
 * and a long echo off the hills; the shotgun a broad boom with no crack; the
 * light guns a flat pop that dies quickly.
 */
export type FarFamily = 'rifle' | 'sniper' | 'shotgun' | 'light';

export const FAR_FAMILY: Readonly<Record<WeaponId, FarFamily>> = { m4a1: 'rifle', sniper: 'sniper', shotgun: 'shotgun', smg: 'light', pistol: 'light' };

const FAR_SHAPE: Readonly<Record<FarFamily, { seconds: number; front: number; crack: number; band: number; bang: number; thump: number; roll: number; echoes: number; spread: number; dark: number }>> = {
  rifle: { seconds: 1.0, front: 0.8, crack: 0, band: 420, bang: 1, thump: 80, roll: 0.16, echoes: 4, spread: 0.35, dark: 2200 },
  sniper: { seconds: 1.4, front: 0.5, crack: 0.9, band: 330, bang: 1, thump: 62, roll: 0.24, echoes: 6, spread: 0.6, dark: 2000 },
  shotgun: { seconds: 1.1, front: 0.4, crack: 0, band: 300, bang: 1.2, thump: 58, roll: 0.2, echoes: 4, spread: 0.4, dark: 1500 },
  light: { seconds: 0.7, front: 0.7, crack: 0, band: 650, bang: 0.8, thump: 110, roll: 0.08, echoes: 3, spread: 0.18, dark: 2800 },
};

export function renderFar(rng: Rng, sr: number, family: FarFamily = 'rifle'): Float32Array[] {
  const f = FAR_SHAPE[family];
  const dry = buffer(sr, f.seconds);
  // A supersonic round's own crack outruns the muzzle's report: a sharp tick ahead of the boom.
  const lead = f.crack > 0 ? rng.range(0.06, 0.1) : 0;
  if (f.crack > 0) {
    const n = Math.round(0.0006 * sr);
    for (let i = 0; i < n; i++) dry[i] = (dry[i] ?? 0) + f.crack * (1 - (2 * i) / n);
    noiseBurst(dry, sr, rng, { at: 0, attack: 0.0001, tau: 0.002, gain: f.crack * 0.6, mode: 'highpass', freq: 2500, length: 0.02 });
  }
  const nN = Math.round(0.0013 * sr);
  const at0 = Math.round(lead * sr);
  for (let i = 0; i < nN; i++) dry[at0 + i] = (dry[at0 + i] ?? 0) + f.front * (1 - (2 * i) / nN);
  noiseBurst(dry, sr, rng, { at: lead, attack: 0.002, tau: rng.range(0.03, 0.04), gain: f.bang, mode: 'bandpass', freq: f.band * rng.range(0.85, 1.2), q: 0.7, length: 0.25 });
  thump(dry, sr, { at: lead + 0.001, f0: f.thump * rng.range(0.95, 1.1), f1: f.thump * 0.55, glideTau: 0.03, attack: 0.003, tau: 0.06, gain: 0.8 });
  noiseBurst(dry, sr, rng, { at: lead + 0.005, attack: 0.012, tau: f.roll * rng.range(0.9, 1.1), gain: 0.5, mode: 'lowpass', freq: 260, steep: true, length: f.seconds - lead - 0.05 });
  // The echoes off the island: darker, later and fainter each time.
  const echoes = Float32Array.from(dry);
  lp(echoes, sr, 1200);
  for (let i = 0; i < f.echoes; i++) mix(dry, echoes, sr, lead + rng.range(0.015, f.spread) * (1 + i * 0.4), rng.range(0.2, 0.36) / (1 + i * 0.35));
  lp(dry, sr, f.dark);
  saturate(dry, 1.4);
  return finishChannels([dry], sr, 30);
}

const FAR_START = 40;
const FAR_FULL = 110;
/**
 * Shots are sent to everyone within hearing range (400 m on the island) and no
 * farther, so the far shot fades out over its last stretch rather than
 * stopping dead at the edge.
 */
export const HEARD_EDGE = WIDE_MAP.relevance?.hearing ?? 400;
const EDGE_FADE = 80;

/** How much of a shot is left `distance` m off at the hearing range's edge: 1 well inside it, 0 at the edge. */
export function edgeFade(distance: number): number {
  return Math.min(1, Math.max(0, (HEARD_EDGE - distance) / EDGE_FADE));
}

const FAMILIES: readonly FarFamily[] = ['rifle', 'sniper', 'shotgun', 'light'];
const ENVIRONMENTS: readonly Environment[] = ['outdoor', 'indoor'];

const id = {
  local: (w: WeaponId) => `gunshot/${w}/local`,
  near: (w: WeaponId) => `gunshot/${w}/near`,
  mech: (w: WeaponId) => `gunshot/${w}/mech`,
  tail: (w: WeaponId, e: Environment) => `gunshot/${w}/tail/${e}`,
  far: (family: FarFamily) => `gunshot/far/${family}`,
};

const render = {
  local: (w: WeaponId) => (rng: Rng, sr: number) => renderCore(rng, sr, RECIPES[w], true),
  near: (w: WeaponId) => (rng: Rng, sr: number) => renderCore(rng, sr, RECIPES[w], false),
  mech: (w: WeaponId) => (rng: Rng, sr: number) => renderMech(rng, sr, RECIPES[w]),
  tail: (w: WeaponId, e: Environment) => (rng: Rng, sr: number) => renderTail(rng, sr, RECIPES[w].tail[e]),
  // What is left by then is dull: rendered at half the rate and stretched.
  far: (family: FarFamily) => (rng: Rng, sr: number) => renderFar(rng, sr / 2, family).map((ch) => upsample(ch, ch.length * 2)),
};

/** Someone else's shot is more of the place and less of the gun than your own: its tail is this much louder against it. */
const AWAY_TAIL = 1.25;
/** The slowest a shot is ever played: its jitter's low end. */
const SLOWEST = 0.98;
/** How long a near shot of `w` rings in `e` (s): the longest of its layers. */
const nearLength = (w: WeaponId, e: Environment): number => Math.max(RECIPES[w].seconds, RECIPES[w].mech.seconds, RECIPES[w].tail[e].seconds) / SLOWEST;

export function gunshotVoice(): Voice & VoiceExtras {
  return {
    /** The longest any shot rings: the .308's tail outdoors, or the far sniper's. */
    duration: Math.max(FAR_SHAPE.sniper.seconds / SLOWEST, ...WEAPONS.flatMap((w) => ENVIRONMENTS.map((e) => nearLength(w, e)))),
    /** A shot holds its slot for as long as its own tail rings: a pistol briefly, the .308 for well over a second. */
    lengthOf(p: VoiceParams) {
      const w = p.weapon ?? 'm4a1';
      const near = nearLength(w, p.environment === 'indoor' ? 'indoor' : 'outdoor');
      if (p.local === true || p.distance === undefined || p.distance <= FAR_START) return near;
      const far = FAR_SHAPE[FAR_FAMILY[w]].seconds / SLOWEST;
      return p.distance >= FAR_FULL ? far : Math.max(near, far);
    },
    warm(ctx: BaseAudioContext) {
      for (const task of this.warmTasks?.(ctx) ?? []) task();
    },
    /**
     * The first task is the one the sound system runs inside the press that unlocks it: your own shot with the
     * first gun, and no more than that, because with no worker's samples in hand each bank is rendered there and
     * then. The other guns' own shots come next, before anything else is warmed.
     */
    warmTasks(ctx: BaseAudioContext) {
      const kit = kitFor(ctx);
      const own = (w: WeaponId) => () => {
        kit.bank(id.local(w), LOCAL_VARIANTS, render.local(w));
        kit.bank(id.mech(w), MECH_VARIANTS, render.mech(w));
        for (const e of ENVIRONMENTS) kit.bank(id.tail(w, e), TAIL_VARIANTS, render.tail(w, e));
      };
      return [
        ...WEAPONS.map(own),
        ...WEAPONS.map((w) => () => void kit.bank(id.near(w), NEAR_VARIANTS, render.near(w))),
        ...FAMILIES.map((family) => () => void kit.bank(id.far(family), FAR_VARIANTS, render.far(family))),
      ];
    },
    play(ctx: AudioContext, out: AudioNode, params: SoundParams, startTime: number) {
      const p = params as VoiceParams;
      const kit = kitFor(ctx);
      const t = Math.max(startTime, ctx.currentTime);
      const w = p.weapon ?? 'm4a1';
      const r = RECIPES[w];
      const e: Environment = p.environment === 'indoor' ? 'indoor' : 'outdoor';
      // Per-shot jitter shared by every layer of this shot so they stay phase-locked.
      const rate = 1 + jit(0.02);
      const shotGain = dbToGain(jit(1));

      // One tone filter per shot: random high-shelf tilt so consecutive shots differ in colour.
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 2800;
      tone.gain.value = -1.75 + Math.random() * 3.5;
      const bus = ctx.createGain();
      bus.gain.value = shotGain;
      tone.connect(bus).connect(out);

      const layers: Array<{ buffer: AudioBuffer; gain: number; delay: number }> = [];
      const local = p.local === true || p.distance === undefined;
      if (local) {
        layers.push({ buffer: kit.pick(id.local(w), LOCAL_VARIANTS, render.local(w)), gain: r.gain.local, delay: 0 });
        layers.push({ buffer: kit.pick(id.mech(w), MECH_VARIANTS, render.mech(w)), gain: r.gain.local * r.mech.gain, delay: Math.random() * 0.003 });
        layers.push({ buffer: kit.pick(id.tail(w, e), TAIL_VARIANTS, render.tail(w, e)), gain: r.gain.local * r.tailGain[e], delay: 0 });
      } else {
        const d = p.distance ?? 0;
        const far = Math.min(1, Math.max(0, (d - FAR_START) / (FAR_FULL - FAR_START)));
        const nearGain = Math.cos((far * Math.PI) / 2);
        const farGain = Math.sin((far * Math.PI) / 2) * edgeFade(d);
        if (nearGain > 0.01) {
          layers.push({ buffer: kit.pick(id.near(w), NEAR_VARIANTS, render.near(w)), gain: r.gain.near * nearGain, delay: 0 });
          layers.push({ buffer: kit.pick(id.tail(w, e), TAIL_VARIANTS, render.tail(w, e)), gain: r.gain.near * r.tailGain[e] * AWAY_TAIL * nearGain, delay: 0 });
        }
        // The action is heard only from a shooter a few metres off.
        if (d < 12) layers.push({ buffer: kit.pick(id.mech(w), MECH_VARIANTS, render.mech(w)), gain: r.gain.near * r.mech.gain * 0.5 * (1 - d / 12), delay: 0 });
        const family = FAR_FAMILY[w];
        if (farGain > 0.01) layers.push({ buffer: kit.pick(id.far(family), FAR_VARIANTS, render.far(family)), gain: r.gain.far * farGain, delay: 0 });
      }

      let remaining = layers.length;
      const releaseBus = (): void => {
        remaining--;
        if (remaining <= 0) {
          tone.disconnect();
          bus.disconnect();
        }
      };
      for (const layer of layers) {
        const src = ctx.createBufferSource();
        src.buffer = layer.buffer;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = layer.gain;
        src.connect(g).connect(tone);
        cleanupOnEnd(src, [src, g]);
        const inner = src.onended;
        src.onended = (ev) => {
          inner?.call(src, ev);
          releaseBus();
        };
        src.start(t + layer.delay);
      }
      if (layers.length === 0) releaseBus();
    },
  };
}
