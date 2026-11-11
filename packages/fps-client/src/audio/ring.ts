/**
 * The Battle Royale's Ring: the wall's hum, heard from its nearest point, a
 * snap of discharge now and then near the listener, and the warning when it
 * starts to close. A mains-like drone under a dry electric buzz and a spit of
 * sparks, so it reads as power rather than wind or machinery.
 */
import { bp, buffer, crackle, finish, hp, lp, mix, noiseBurst, shape, thump, white, wobble, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** One hum segment, and how much segments overlap so they join without a seam. */
export const RING_HUM_SECONDS = 3;
export const RING_OVERLAP = 0.3;
const CRACKLE_SECONDS = 0.9;
const SHIFT_SECONDS = 1.4;

/** The hum: a 50 Hz drone and its buzzing harmonics, a hiss of corona and sparks spitting in bursts. */
export function ringHum(sr: number, rng: Rng): Float32Array {
  const seconds = RING_HUM_SECONDS;
  const out = buffer(sr, seconds);
  const swell = wobble(rng, seconds, 0.5, 0.35);
  // The drone: a buzzy wave at 50 Hz with a slow beat against a second one a hair off.
  const drone = buffer(sr, seconds);
  for (const [f, g] of [[50, 1], [50.6, 0.7], [100, 0.5], [150, 0.35], [250, 0.15]] as const) {
    let phase = rng.next();
    for (let i = 0; i < drone.length; i++) {
      phase += f / sr;
      // A clipped sine: the hard edges are the buzz of a transformer.
      const s = Math.max(-0.6, Math.min(0.6, Math.sin(2 * Math.PI * phase))) / 0.6;
      drone[i] = (drone[i] ?? 0) + s * g;
    }
  }
  lp(drone, sr, 900);
  shape(drone, sr, swell);
  mix(out, drone, sr, 0, 0.32);
  // Corona: noise in the upper mids, pulsing with the mains.
  const corona = white(sr, seconds, rng);
  bp(corona, sr, 2400, 1.2);
  shape(corona, sr, (t) => (0.45 + 0.55 * Math.abs(Math.sin(2 * Math.PI * 50 * t))) * swell(t));
  mix(out, corona, sr, 0, 0.35);
  // Sparks: sparse impulses through a bright band, coming in bursts.
  const burst = wobble(rng, seconds, 0.25, 1);
  const sparks = crackle(sr, seconds, rng, 260, (t) => Math.max(0, burst(t) - 0.6) * 2.5);
  hp(sparks, sr, 1500);
  mix(out, sparks, sr, 0, 0.6);
  // A low roar under it all, the size of the thing.
  const roar = white(sr, seconds, rng);
  lp(roar, sr, 160);
  mix(out, roar, sr, 0, 0.8);
  finish(out, sr, 0.45, 35);
  shape(out, sr, (t) => Math.min(1, t / RING_OVERLAP, (seconds - t) / RING_OVERLAP));
  return out;
}

/** A discharge: a sharp crack, the arc spitting as it dies, and a dull thud in the ground. */
export function ringCrackle(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, CRACKLE_SECONDS);
  noiseBurst(out, sr, rng, { at: 0.002, attack: 0.0004, tau: 0.018, gain: 1, mode: 'highpass', freq: 1800 });
  const spit = crackle(sr, CRACKLE_SECONDS, rng, 900, (t) => Math.exp(-t / 0.12));
  hp(spit, sr, 2500);
  mix(out, spit, sr, 0, 0.7);
  thump(out, sr, { at: 0.003, f0: 120, f1: 45, glideTau: 0.04, attack: 0.002, tau: 0.08, gain: 0.6 });
  return finish(out, sr, 0.6, 40);
}

/** The warning as the wall starts to close: two rising tones with a hard tremolo, dry. */
export function ringShift(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, SHIFT_SECONDS);
  for (const [at, f0] of [[0, 220], [0.55, 294]] as const) {
    let phase = rng.next() * 0.1;
    const start = Math.round(at * sr);
    const count = Math.round(0.6 * sr);
    for (let i = 0; i < count && start + i < out.length; i++) {
      const t = i / sr;
      const f = f0 * (1 + 0.5 * Math.min(1, t / 0.45));
      phase += f / sr;
      const env = Math.min(1, t / 0.02) * Math.min(1, (0.6 - t) / 0.08);
      const trem = 0.6 + 0.4 * Math.sign(Math.sin(2 * Math.PI * 14 * t));
      out[start + i] = (out[start + i] ?? 0) + (Math.sin(2 * Math.PI * phase) + 0.3 * Math.sin(4 * Math.PI * phase)) * env * trem;
    }
  }
  lp(out, sr, 3000);
  return finish(out, sr, 0.4, 80);
}

/** How loud each plays before distance. */
const RING_GAIN = { hum: 0.7, crackle: 0.55, shift: 0.4 } as const;

export const ringHumVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ringHum',
    variants: 3,
    keys: ['hum'],
    key: () => 'hum',
    render: (_k, rng, sr) => [ringHum(sr, rng)],
    gain: () => RING_GAIN.hum,
    rateJitter: 0,
    gainJitterDb: 1,
    duration: RING_HUM_SECONDS,
  });

export const ringCrackleVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ringCrackle',
    variants: 5,
    keys: ['snap'],
    key: () => 'snap',
    render: (_k, rng, sr) => [ringCrackle(sr, rng)],
    gain: () => RING_GAIN.crackle,
    rateJitter: 0.12,
    gainJitterDb: 3,
    duration: CRACKLE_SECONDS,
  });

export const ringShiftVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ringShift',
    variants: 1,
    keys: ['shift'],
    key: () => 'shift',
    render: (_k, rng, sr) => [ringShift(sr, rng)],
    gain: () => RING_GAIN.shift,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: SHIFT_SECONDS,
  });
