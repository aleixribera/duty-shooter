/**
 * The last minute's own sounds: an air-raid siren far off at the map's edge, winding up and
 * holding, and a Geiger counter's ticks. The siren is the town's (nuke.ts) heard from a long
 * way off: the same rotor, slower to wind up, held on its top note in overlapping segments and
 * wound down when the clock runs out.
 */
import { buffer, finish, lp, modes, noiseBurst, samples, shape, white, type Rng } from './dsp';
import type { Render } from './kit';
import { upsample } from './nuke';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

export const SIREN_RISE_SECONDS = 9;
export const SIREN_HOLD_SECONDS = 4;
export const SIREN_FALL_SECONDS = 7;
/** How much one segment overlaps the next, fading across (s). */
export const SIREN_OVERLAP = 0.9;

/** The rotor's growl at rest and its top note (Hz), and how slowly it gets there (s). */
const GROWL = 130;
const TOP = 520;
const WIND_UP = 1.7;

/** The siren's tone for a pitch curve: a rotor chopping air into a rounded square, a second rotor a fifth above, wind in the horn. */
function rotor(sr: number, seconds: number, rng: Rng, pitch: (t: number) => number, gain: (t: number) => number): Float32Array {
  const out = buffer(sr, seconds);
  let phase = 0;
  const offset = rng.range(0, Math.PI * 2);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    phase += pitch(t) / sr;
    const a = Math.tanh(3 * Math.sin(2 * Math.PI * phase));
    const b = Math.tanh(2 * Math.sin(2 * Math.PI * phase * 1.5 + offset));
    out[i] = a * 0.7 + b * 0.3;
  }
  const air = lp(white(sr, seconds, rng), sr, 1800);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (air[i] ?? 0) * 0.08;
  lp(out, sr, 3500);
  shape(out, sr, gain);
  return out;
}

/** The slow waver of a siren held at speed. */
const waver = (t: number): number => 1 + 0.011 * Math.sin(2 * Math.PI * 0.42 * t);
/** A segment's fade across the overlap at each end. */
const cross = (seconds: number, fadeIn: number) => (t: number) => Math.min(1, t / fadeIn, (seconds - t) / SIREN_OVERLAP);

/** The wind-up: from a growl to the top note over some five seconds, then held. */
function sirenRise(sr: number, rng: Rng): Float32Array {
  const s = SIREN_RISE_SECONDS;
  return finish(rotor(sr, s, rng, (t) => (GROWL + (TOP - GROWL) * (1 - Math.exp(-t / WIND_UP))) * (t > 5 ? waver(t) : 1), cross(s, 1.2)), sr, 0.5, 70);
}

/** Held at the top, wavering. */
function sirenHold(sr: number, rng: Rng): Float32Array {
  const s = SIREN_HOLD_SECONDS;
  const at = rng.range(0, 3);
  return finish(rotor(sr, s, rng, (t) => TOP * waver(t + at), cross(s, SIREN_OVERLAP)), sr, 0.5, 70);
}

/** The wind-down: the rotor coasting, the note sagging to a growl and dying away. */
function sirenFall(sr: number, rng: Rng): Float32Array {
  const s = SIREN_FALL_SECONDS;
  return finish(rotor(sr, s, rng, (t) => 85 + (TOP - 85) * Math.exp(-t / 1.9), (t) => Math.min(1, t / SIREN_OVERLAP) * Math.exp(-t / 2.6) * Math.min(1, (s - t) / 0.8)), sr, 0.5, 60);
}

/** The siren's parts are long and dull: rendered at half rate and stretched, like the nuke's. */
const half = (render: (sr: number, rng: Rng) => Float32Array, seconds: number): ((rng: Rng, sr: number) => Float32Array[]) => (rng, sr) => [upsample(render(sr / 2, rng), samples(sr, seconds))];

function sirenVoice(id: string, seconds: number, render: (sr: number, rng: Rng) => Float32Array, variants: number): Voice & VoiceExtras {
  return synthVoice({
    id,
    variants,
    keys: [id],
    key: () => id,
    render: (_key, rng, sr) => half(render, seconds)(rng, sr),
    gain: (p) => 0.6 * (p.intensity ?? 1),
    rateJitter: 0,
    gainJitterDb: 0,
    duration: seconds,
  });
}

export const sirenRiseVoice = (): Voice & VoiceExtras => sirenVoice('countdownSirenRise', SIREN_RISE_SECONDS, sirenRise, 1);
export const sirenHoldVoice = (): Voice & VoiceExtras => sirenVoice('countdownSirenHold', SIREN_HOLD_SECONDS, sirenHold, 2);
export const sirenFallVoice = (): Voice & VoiceExtras => sirenVoice('countdownSirenFall', SIREN_FALL_SECONDS, sirenFall, 1);

const TICK_SECONDS = 0.03;
export const GEIGER_BANK = 'geigerTick/tick';
export const GEIGER_VARIANTS = 5;

/** One count: the tube's discharge through a small speaker, a sharp click with a papery body. */
export const geigerTick: Render = (rng, sr) => {
  const out = buffer(sr, TICK_SECONDS);
  noiseBurst(out, sr, rng, { at: 0, attack: 0.00005, tau: 0.0006, gain: 1, mode: 'highpass', freq: 2500, length: 0.006 });
  const f = rng.range(2700, 3300);
  modes(out, sr, 0, [f, f * 1.62, f * 0.47], [1, 0.4, 0.5], [0.0022, 0.0012, 0.004], 0.7, 0.0001);
  return [finish(out, sr, 0.5, 300)];
};

export const geigerTickVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'geigerTick',
    variants: GEIGER_VARIANTS,
    keys: ['tick'],
    key: () => 'tick',
    render: (_key, rng, sr, v) => geigerTick(rng, sr, v),
    gain: (p) => 0.5 * (0.5 + 0.5 * (p.intensity ?? 1)),
    rateJitter: 0.06,
    gainJitterDb: 2,
    duration: TICK_SECONDS,
  });
