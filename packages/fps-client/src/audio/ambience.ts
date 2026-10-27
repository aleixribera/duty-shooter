/**
 * The maps' ambience: wind, distant birds, a sign creaking on its chains, a
 * faint radio; and in the rail yard, couplings clanking out of sight,
 * sodium lamps humming and a train's horn far out on the plain. All of it
 * is quiet on purpose: it sits well under footsteps and gunfire (see the
 * loudness test), so it never hides an enemy.
 */
import { bp, buffer, finish, hp, lp, mix, modes, noiseBurst, samples, saturate, shape, thump, white, wobble, type Rng } from './dsp';
import { upsample } from './nuke';
import { HORN_SECONDS, farHorn } from './train';
import { synthVoice, unit } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** How long one wind segment and one radio segment run; the scheduler overlaps them by OVERLAP. */
export const WIND_SECONDS = 8;
export const RADIO_SECONDS = 8;
export const OVERLAP = 0.25;
/** How long one segment of a lamp's hum runs (overlapped like the radio's). */
export const HUM_SECONDS = 4;
const COUPLINGS_SECONDS = 4;

/** Slow fades at both ends, so overlapping segments join without a seam. */
function crossfade(data: Float32Array, sr: number, seconds: number): Float32Array {
  const n = Math.min(samples(sr, seconds), Math.floor(data.length / 2));
  for (let i = 0; i < n; i++) {
    const g = Math.sin((Math.PI / 2) * (i / n)) ** 2;
    data[i] = (data[i] ?? 0) * g;
    data[data.length - 1 - i] = (data[data.length - 1 - i] ?? 0) * g;
  }
  return data;
}

/** Wind over open desert: a low roar with slow gusts and a whistle that rises with them. */
export function wind(sr: number, rng: Rng): Float32Array {
  // Gust strength 0..1, drifting every second and a half or so.
  const drift = wobble(rng, WIND_SECONDS, 1.6, 0.45);
  const gust = (t: number) => (drift(t) - 0.55) / 0.9;
  const roar = white(sr, WIND_SECONDS, rng);
  let y = 0;
  for (let i = 0; i < roar.length; i++) {
    y = y * 0.985 + (roar[i] ?? 0) * 0.12;
    roar[i] = y;
  }
  lp(roar, sr, (t) => 380 + 260 * gust(t));
  hp(roar, sr, 40);
  shape(roar, sr, (t) => 0.55 + 0.45 * gust(t));
  const whistle = white(sr, WIND_SECONDS, rng);
  bp(whistle, sr, (t) => 700 + 500 * gust(t), 3);
  shape(whistle, sr, (t) => (Math.max(0, gust(t) - 0.5) * 2) ** 2);
  const out = buffer(sr, WIND_SECONDS);
  mix(out, roar, sr, 0, 1);
  mix(out, whistle, sr, 0, 0.6);
  finish(out, sr, 0.5, 30);
  return crossfade(out, sr, 1.2);
}

/** A distant songbird: a phrase of three to six quick, falling or rising whistles. */
export function birds(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, 1.4);
  const notes = 3 + Math.floor(rng.next() * 4);
  const base = rng.range(2600, 4200);
  let at = 0.02;
  for (let n = 0; n < notes; n++) {
    const len = rng.range(0.05, 0.12);
    const f0 = base * rng.range(0.85, 1.2);
    const f1 = f0 * rng.range(0.7, 1.35);
    let phase = 0;
    const start = Math.round(at * sr);
    const count = Math.round(len * sr);
    for (let i = 0; i < count && start + i < out.length; i++) {
      const u = i / count;
      phase += (f0 + (f1 - f0) * u) / sr;
      const env = Math.sin(Math.PI * u) ** 1.5;
      out[start + i] = (out[start + i] ?? 0) + Math.sin(2 * Math.PI * phase + 0.6 * Math.sin(2 * Math.PI * phase * 2)) * env;
    }
    at += len + rng.range(0.03, 0.12);
  }
  return finish(out, sr, 0.5, 1500);
}

/** A hanging sign swinging in the wind: a slow stick-slip creak through the board's resonances. */
export function creak(sr: number, rng: Rng): Float32Array {
  const seconds = 1.6;
  const out = buffer(sr, seconds);
  const len = rng.range(0.6, 1.1);
  // The friction catches and lets go faster in the middle of the swing.
  let t = 0.05;
  while (t < 0.05 + len) {
    const u = (t - 0.05) / len;
    const rate = 35 + 90 * Math.sin(Math.PI * u);
    const amp = Math.sin(Math.PI * u) ** 0.7 * rng.range(0.6, 1);
    modes(out, sr, t, [rng.range(380, 420), rng.range(780, 860), 1650], [1, 0.6, 0.25], [0.012, 0.008, 0.005], amp * 0.25);
    noiseBurst(out, sr, rng, { at: t, attack: 0.0003, tau: 0.002, gain: amp * 0.15, mode: 'bandpass', freq: 2400, q: 2 });
    t += 1 / rate;
  }
  // A chain link knocks as the swing turns.
  modes(out, sr, 0.05 + len, [rng.range(2300, 2700), 4100], [1, 0.4], [0.03, 0.015], 0.12);
  return finish(out, sr, 0.5, 120);
}

/**
 * A small radio across the room: an easy 1950s-style tune (a I-vi-IV-V
 * walk with a made-up melody over it) through a tinny speaker, with a bit
 * of AM hiss and crackle.
 */
export function radio(sr: number, rng: Rng, variant: number): Float32Array {
  const out = buffer(sr, RADIO_SECONDS);
  const beat = 0.5;
  const root = 196; // G3
  const semis = (n: number) => root * 2 ** (n / 12);
  // Each chord lasts four beats; the second half of the loop moves to the other ending.
  const chords = variant % 2 === 0 ? [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]] : [[0, 4, 7], [9, 12, 16], [2, 5, 9], [7, 11, 14]];
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const tone = (at: number, f: number, len: number, gain: number, bright: number) => {
    const start = Math.round(at * sr);
    const count = Math.round(len * sr);
    let phase = 0;
    for (let i = 0; i < count && start + i < out.length; i++) {
      const u = i / sr;
      phase += f / sr;
      const env = Math.min(1, u / 0.01) * Math.exp(-u / (len * 0.6));
      const s = Math.sin(2 * Math.PI * phase) + bright * Math.sin(4 * Math.PI * phase) + bright * 0.5 * Math.sin(6 * Math.PI * phase);
      out[start + i] = (out[start + i] ?? 0) + s * env * gain;
    }
  };
  chords.forEach((chord, c) => {
    for (let b = 0; b < 4; b++) {
      const at = (c * 4 + b) * beat;
      // Bass on the beat, the chord on the off-beat.
      tone(at, semis((chord[0] ?? 0) - 12), beat * 0.9, 0.5, 0.2);
      for (const n of chord) tone(at + beat / 2, semis(n), beat * 0.4, 0.16, 0.5);
      // The melody: one or two notes a beat, from the chord's scale.
      const pick = () => semis(12 + (scale[Math.floor(rng.next() * scale.length)] ?? 0));
      if (rng.bool(0.4)) {
        tone(at, pick(), beat / 2, 0.3, 0.3);
        tone(at + beat / 2, pick(), beat / 2, 0.3, 0.3);
      } else {
        tone(at, pick(), beat * 0.95, 0.32, 0.3);
      }
    }
  });
  // The speaker: no lows, no highs, a little cone rattle.
  hp(out, sr, 350);
  lp(out, sr, 2800);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh((out[i] ?? 0) * 1.8);
  const hiss = white(sr, RADIO_SECONDS, rng);
  bp(hiss, sr, 3000, 0.5);
  mix(out, hiss, sr, 0, 0.03);
  for (let k = 0; k < 14; k++) noiseBurst(out, sr, rng, { at: rng.range(0, RADIO_SECONDS), attack: 0.0001, tau: 0.0015, gain: 0.15, mode: 'highpass', freq: 2000, length: 0.01 });
  finish(out, sr, 0.5, 300);
  return crossfade(out, sr, OVERLAP);
}

/**
 * A cut of wagons being shunted somewhere out of sight: the bang of the
 * buffers meeting, then the slack running in down the cut, coupling after
 * coupling, each a little softer and further off.
 */
export function couplings(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, COUPLINGS_SECONDS);
  const count = 3 + Math.floor(rng.next() * 4);
  let at = 0.05;
  for (let k = 0; k < count && at < COUPLINGS_SECONDS - 1; k++) {
    const g = 0.9 ** k * rng.range(0.75, 1);
    noiseBurst(out, sr, rng, { at, attack: 0.001, tau: 0.03, gain: 0.6 * g, mode: 'lowpass', freq: 1600 });
    thump(out, sr, { at, f0: 95, f1: 55, glideTau: 0.05, attack: 0.002, tau: 0.12, gain: 0.8 * g });
    // The wagons' steel rings on after the knock.
    modes(out, sr, at, [rng.range(170, 200), rng.range(330, 380), rng.range(610, 680), 1150], [1, 0.7, 0.45, 0.2], [0.35, 0.25, 0.18, 0.1], 0.3 * g);
    at += k === 0 ? rng.range(0.5, 0.9) : rng.range(0.25, 0.5);
  }
  // From across the yard: the highs gone.
  lp(out, sr, 2200);
  return finish(out, sr, 0.5, 40);
}

/**
 * A sodium lamp's ballast humming: twice the mains frequency and its
 * harmonics, buzzy, with the arc fizzing now and then.
 */
export function hum(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, HUM_SECONDS);
  const f = 100 * rng.range(0.998, 1.002);
  const level = wobble(rng, HUM_SECONDS, 0.7, 0.15);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const w = 2 * Math.PI * f * t;
    out[i] = (Math.sin(w) * 0.5 + Math.sin(2 * w) * 0.35 + Math.sin(3 * w + 0.4) * 0.25 + Math.sin(5 * w) * 0.12) * level(t);
  }
  saturate(out, 2.5);
  const fizz = white(sr, HUM_SECONDS, rng);
  bp(fizz, sr, 4000, 1);
  const flicker = wobble(rng, HUM_SECONDS, 0.25, 1);
  shape(fizz, sr, (t) => Math.max(0, flicker(t) - 0.7) * 2);
  mix(out, fizz, sr, 0, 0.15);
  finish(out, sr, 0.5, 60);
  return crossfade(out, sr, OVERLAP);
}

/** How loud each ambient voice plays (before distance): the loudness test holds these under footsteps and gunfire. */
export const AMBIENT_GAIN = { wind: 0.019, birds: 0.011, creak: 0.018, radio: 0.021, horn: 0.012, couplings: 0.015, hum: 0.012 } as const;

export const windVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientWind',
    variants: 3,
    keys: ['wind'],
    key: () => 'wind',
    // Wind is all lows: a quarter-rate render is plenty.
    render: (_k, rng, sr) => [upsample(wind(sr / 4, rng), samples(sr, WIND_SECONDS))],
    // Indoors the walls take most of it.
    gain: (p) => AMBIENT_GAIN.wind * unit(p.intensity, 1),
    rateJitter: 0.03,
    gainJitterDb: 1,
    duration: WIND_SECONDS,
  });

export const birdsVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientBirds',
    variants: 6,
    keys: ['birds'],
    key: () => 'birds',
    render: (_k, rng, sr) => [birds(sr, rng)],
    gain: () => AMBIENT_GAIN.birds,
    rateJitter: 0.08,
    gainJitterDb: 3,
    duration: 1.4,
  });

export const creakVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientCreak',
    variants: 4,
    keys: ['creak'],
    key: () => 'creak',
    render: (_k, rng, sr) => [creak(sr, rng)],
    gain: (p) => AMBIENT_GAIN.creak * (0.4 + 0.6 * unit(p.intensity, 1)),
    rateJitter: 0.06,
    gainJitterDb: 2,
    duration: 1.6,
  });

export const radioVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientRadio',
    variants: 2,
    keys: ['radio'],
    // The two segments alternate (see Ambience), so the tune has a turnaround.
    key: () => 'radio',
    render: (_k, rng, sr, v) => [upsample(radio(sr / 2, rng, v), samples(sr, RADIO_SECONDS))],
    gain: () => AMBIENT_GAIN.radio,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: RADIO_SECONDS,
  });

export const hornVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientHorn',
    variants: 2,
    keys: ['horn'],
    key: () => 'horn',
    render: (_k, rng, sr) => [upsample(farHorn(sr / 2, rng), samples(sr, HORN_SECONDS + 1.6))],
    gain: () => AMBIENT_GAIN.horn,
    rateJitter: 0.03,
    gainJitterDb: 2,
    duration: HORN_SECONDS + 1.6,
  });

export const couplingsVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientCouplings',
    variants: 4,
    keys: ['couplings'],
    key: () => 'couplings',
    render: (_k, rng, sr) => [upsample(couplings(sr / 2, rng), samples(sr, COUPLINGS_SECONDS))],
    gain: () => AMBIENT_GAIN.couplings,
    rateJitter: 0.05,
    gainJitterDb: 2,
    duration: COUPLINGS_SECONDS,
  });

export const humVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'ambientHum',
    variants: 2,
    keys: ['hum'],
    key: () => 'hum',
    render: (_k, rng, sr) => [hum(sr, rng)],
    gain: () => AMBIENT_GAIN.hum,
    rateJitter: 0,
    gainJitterDb: 0,
    duration: HUM_SECONDS,
  });
