/** The end-of-match nuke: the town's air-raid siren and the blast that rolls in after the flash. */
import { buffer, finish, lp, noiseBurst, samples, saturate, shape, thump, white, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

const SIREN_SECONDS = 6.5;
const BLAST_SECONDS = 8;

/**
 * Linear interpolation up to `length` samples. The nuke's sounds are long
 * and carry little above a few kHz, so they are synthesised at a fraction
 * of the context's rate and stretched back up: a long render warming in
 * the background must not stall a frame.
 */
export function upsample(data: Float32Array, length: number): Float32Array {
  const out = new Float32Array(length);
  const step = (data.length - 1) / Math.max(1, length - 1);
  for (let i = 0; i < length; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const a = data[j] ?? 0;
    out[i] = a + ((data[j + 1] ?? a) - a) * (x - j);
  }
  return out;
}

/**
 * A mechanical air-raid siren: a rotor chopping air into a buzzy tone that
 * winds up from a growl to a wail, holds with a slow waver, then winds down.
 */
export function siren(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, SIREN_SECONDS);
  const windUp = 1.6;
  const windDown = 4.2;
  const pitch = (t: number) => {
    if (t < windUp) return 140 + 480 * (1 - Math.exp(-t / 0.55));
    const top = 140 + 480 * (1 - Math.exp(-windUp / 0.55));
    if (t < windDown) return top * (1 + 0.012 * Math.sin(2 * Math.PI * 0.45 * t));
    return 90 + (top - 90) * Math.exp(-(t - windDown) / 1.1);
  };
  let phase = 0;
  const wobble = rng.range(0, Math.PI * 2);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    phase += pitch(t) / sr;
    // The rotor's ports cut the air into a rounded square; a fifth above comes from the second rotor.
    const a = Math.tanh(3 * Math.sin(2 * Math.PI * phase));
    const b = Math.tanh(2 * Math.sin(2 * Math.PI * phase * 1.5 + wobble));
    out[i] = a * 0.7 + b * 0.3;
  }
  // Wind noise through the horn.
  const air = lp(white(sr, SIREN_SECONDS, rng), sr, 1800);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (air[i] ?? 0) * 0.08;
  lp(out, sr, 3500);
  shape(out, sr, (t) => Math.min(1, t / 0.4) * (t > SIREN_SECONDS - 0.6 ? Math.max(0, (SIREN_SECONDS - t) / 0.6) : 1));
  return finish(out, sr, 0.5, 70);
}

/**
 * A distant nuclear blast as it reaches the town: a hard crack, a chest-deep
 * thump, then seconds of rolling rumble as the shock passes and echoes back
 * off the desert.
 */
export function blast(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, BLAST_SECONDS);
  noiseBurst(out, sr, rng, { at: 0, attack: 0.002, tau: 0.08, gain: 1, mode: 'lowpass', freq: 2400, steep: true });
  thump(out, sr, { at: 0, f0: 70, f1: 28, glideTau: 0.4, attack: 0.01, tau: 0.9, gain: 1.3 });
  // The rumble: brown-ish noise, low-passed tighter as it goes, swelling with each echo.
  const rumble = white(sr, BLAST_SECONDS, rng);
  let y = 0;
  for (let i = 0; i < rumble.length; i++) {
    y = y * 0.995 + (rumble[i] ?? 0) * 0.05;
    rumble[i] = y;
  }
  lp(rumble, sr, (t) => 900 * Math.exp(-t / 1.6) + 120);
  const echoes = [0.9, 1.7, 2.9].map((at) => ({ at, gain: rng.range(0.35, 0.6) }));
  shape(rumble, sr, (t) => {
    let g = Math.min(1, t / 0.05) * Math.exp(-t / 2.2);
    for (const e of echoes) if (t > e.at) g += e.gain * Math.exp(-(t - e.at) / 1.2) * Math.min(1, (t - e.at) / 0.15);
    return g;
  });
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (rumble[i] ?? 0) * 3;
  saturate(out, 1.6);
  shape(out, sr, (t) => (t > BLAST_SECONDS - 1 ? Math.max(0, BLAST_SECONDS - t) : 1));
  return finish(out, sr, 0.9, 18);
}

export const nukeSirenVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'nukeSiren',
    variants: 1,
    keys: ['nukeSiren'],
    key: () => 'nukeSiren',
    render: (_key, rng, sr) => [upsample(siren(sr / 2, rng), samples(sr, SIREN_SECONDS))],
    gain: () => 0.55,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: SIREN_SECONDS,
  });

export const nukeBlastVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'nukeBlast',
    variants: 1,
    keys: ['nukeBlast'],
    key: () => 'nukeBlast',
    render: (_key, rng, sr) => [upsample(blast(sr / 4, rng), samples(sr, BLAST_SECONDS))],
    gain: () => 1,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: BLAST_SECONDS,
  });
