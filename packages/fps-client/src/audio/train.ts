/**
 * Switchyard's end-of-match freight train: its five-chime air horn, the
 * roar of the locos and the wagons going by, and the double clack of each
 * bogie over a rail joint. The horn's chord also sounds, far off and soft,
 * in the yard's ambience.
 */
import { buffer, finish, hp, lp, mix, modes, noiseBurst, samples, saturate, shape, thump, white, wobble, type Rng } from './dsp';
import { upsample } from './nuke';
import { synthVoice, unit } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** The horn's two long blasts, the rumble's segment and a clack, in seconds. */
export const HORN_SECONDS = 3.6;
export const RUMBLE_SECONDS = 2;
export const CLACK_SECONDS = 0.5;
/** Rumble segments overlap by this much, so they join without a seam. */
export const RUMBLE_OVERLAP = 0.25;

/** The horn's chimes (Hz): a C sharp sixth chord, as freight horns are voiced. */
const CHIMES = [277.2, 329.6, 415.3, 493.9, 554.4];

/**
 * One blast of the horn into `out`: every chime a reedy buzz (a sawtooth's
 * harmonics) with its own drift, beating against the others, swelling in
 * and dying away as the air valve opens and shuts.
 */
function blast(out: Float32Array, sr: number, rng: Rng, at: number, length: number, gain: number): void {
  const start = Math.round(at * sr);
  const count = Math.min(Math.round((length + 0.25) * sr), out.length - start);
  // These envelopes are identical for all five chimes.
  const pitchEnvelope = new Float64Array(count);
  const amplitude = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / sr;
    pitchEnvelope[i] = 1 - 0.03 * Math.exp(-t / 0.06);
    amplitude[i] = Math.min(1, t / 0.07) * (t > length ? Math.exp(-(t - length) / 0.04) : 1);
  }
  for (const f of CHIMES) {
    const detune = rng.range(0.996, 1.004);
    const drift = rng.range(0.7, 1.4);
    let phase = rng.next();
    for (let i = 0; i < count; i++) {
      const t = i / sr;
      // The pitch sags a little as the valve opens, then holds with a slow waver.
      const fi = f * detune * pitchEnvelope[i]! * (1 + 0.002 * Math.sin(2 * Math.PI * drift * t));
      phase += fi / sr;
      // Generate the same seven sine harmonics by recurrence, avoiding six
      // additional transcendental calls for every sample of every chime.
      const angle = 2 * Math.PI * phase;
      const twiceCos = 2 * Math.cos(angle);
      let previous = 0;
      let harmonic = Math.sin(angle);
      let s = 0;
      for (let k = 1; k <= 7; k++) {
        s += harmonic / k;
        const next = twiceCos * harmonic - previous;
        previous = harmonic;
        harmonic = next;
      }
      out[start + i] = (out[start + i] ?? 0) + s * amplitude[i]! * gain;
    }
  }
}

/** The horn: two long blasts, as for a crossing. */
export function horn(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, HORN_SECONDS);
  blast(out, sr, rng, 0.02, 1.5, 0.2);
  blast(out, sr, rng, 1.85, 1.45, 0.2);
  // The bell of each horn rings round 1-2 kHz; the hiss of the air rides on top.
  saturate(out, 1.4);
  lp(out, sr, 3800);
  const air = white(sr, HORN_SECONDS, rng);
  lp(hp(air, sr, 1500), sr, 5000);
  shape(air, sr, (t) => ((t > 0.02 && t < 1.55) || (t > 1.87 && t < 3.3) ? 1 : 0));
  mix(out, air, sr, 0, 0.02);
  return finish(out, sr, 0.5, 120);
}

/**
 * The horn of a train out on the plain: the same chord, dulled by the miles
 * of air, with its echo coming back off the hills.
 */
export function farHorn(sr: number, rng: Rng): Float32Array {
  const dry = horn(sr, rng);
  lp(dry, sr, 900);
  lp(dry, sr, 1400);
  const out = buffer(sr, HORN_SECONDS + 1.6);
  mix(out, dry, sr, 0, 1);
  const echo = lp(dry.slice(), sr, 600);
  mix(out, echo, sr, 0.6, 0.35);
  mix(out, echo, sr, 1.3, 0.15);
  return finish(out, sr, 0.5, 90);
}

/**
 * The roar of the train going by: the locos' diesel drone and the wagons'
 * steel-on-steel roar, mixed by `engine` (1 at the locos, 0 down the
 * wagons). Rendered at a quarter rate: it is all lows and mids.
 */
export function rumble(sr: number, rng: Rng, engine: number): Float32Array {
  const out = buffer(sr, RUMBLE_SECONDS);
  // The wagons: brown noise through the rails' resonance, swelling and easing.
  const roar = white(sr, RUMBLE_SECONDS, rng);
  let y = 0;
  for (let i = 0; i < roar.length; i++) {
    y = y * 0.97 + (roar[i] ?? 0) * 0.2;
    roar[i] = y;
  }
  const swell = wobble(rng, RUMBLE_SECONDS, 0.4, 0.3);
  lp(roar, sr, 520);
  hp(roar, sr, 35);
  shape(roar, sr, swell);
  mix(out, roar, sr, 0, 1 - 0.5 * engine);
  // The diesels: a firing note near 30 Hz and its harmonics, chuffing.
  if (engine > 0) {
    const f = rng.range(28, 34);
    const drone = buffer(sr, RUMBLE_SECONDS);
    for (const [k, a] of [[1, 1], [2, 0.6], [3, 0.4], [5, 0.2]] as const) thump(drone, sr, { at: 0, f0: f * k, f1: f * k, glideTau: 1, attack: 0.02, tau: 100, gain: a });
    shape(drone, sr, (t) => 0.75 + 0.25 * Math.sin(2 * Math.PI * f * 0.5 * t));
    saturate(drone, 2);
    mix(out, drone, sr, 0, 0.9 * engine);
  }
  shape(out, sr, (t) => Math.min(1, t / RUMBLE_OVERLAP, (RUMBLE_SECONDS - t) / RUMBLE_OVERLAP));
  return finish(out, sr, 0.5, 30);
}

/**
 * One bogie over a rail joint: two wheelsets a beat apart (`gap` s), each a
 * knock of the wheel dropping into the joint and the ring of the rail.
 */
export function clack(sr: number, rng: Rng, gap: number): Float32Array {
  const out = buffer(sr, CLACK_SECONDS);
  for (const at of [0.005, 0.005 + gap]) {
    const g = rng.range(0.8, 1);
    noiseBurst(out, sr, rng, { at, attack: 0.0005, tau: 0.012, gain: 0.7 * g, mode: 'lowpass', freq: 1800 });
    thump(out, sr, { at, f0: 140, f1: 70, glideTau: 0.02, attack: 0.001, tau: 0.03, gain: 0.8 * g });
    modes(out, sr, at, [rng.range(780, 860), rng.range(1900, 2100), 3300], [1, 0.5, 0.25], [0.05, 0.03, 0.02], 0.2 * g);
  }
  return finish(out, sr, 0.5, 40);
}

/** How loud each of the train's sounds plays (before distance): it is meant to be loud. */
export const TRAIN_GAIN = { horn: 0.9, rumble: 0.8, clack: 0.55 } as const;

export const trainHornVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trainHorn',
    variants: 1,
    keys: ['horn'],
    key: () => 'horn',
    render: (_k, rng, sr) => [upsample(horn(sr / 2, rng), samples(sr, HORN_SECONDS))],
    gain: () => TRAIN_GAIN.horn,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: HORN_SECONDS,
  });

export const trainRumbleVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trainRumble',
    variants: 3,
    keys: ['locos', 'wagons'],
    // Near the locos the diesels drown the wagons.
    key: (p) => (unit(p.intensity, 0) > 0.5 ? 'locos' : 'wagons'),
    render: (k, rng, sr) => [upsample(rumble(sr / 4, rng, k === 'locos' ? 1 : 0), samples(sr, RUMBLE_SECONDS))],
    gain: () => TRAIN_GAIN.rumble,
    rateJitter: 0.04,
    gainJitterDb: 1,
    duration: RUMBLE_SECONDS,
  });

export const trainClackVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trainClack',
    variants: 6,
    keys: ['clack'],
    key: () => 'clack',
    // The wheelsets of a bogie 1.7 m apart, at the train's speed.
    render: (_k, rng, sr) => [clack(sr, rng, 0.065)],
    gain: () => TRAIN_GAIN.clack,
    rateJitter: 0.05,
    gainJitterDb: 2,
    duration: CLACK_SECONDS,
  });
