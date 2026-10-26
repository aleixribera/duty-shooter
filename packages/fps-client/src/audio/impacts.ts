/** Bullet impacts per surface, shell casing bounces, and the supersonic crack of a passing bullet. */
import { bp, buffer, crackle, finish, hp, lp, mix, modes, noiseBurst, normalize, scatter, shape, thump, white, type Rng } from './dsp';
import { thud } from './parts';
import { synthVoice } from './synth-voice';
import { MATERIALS as ALL_MATERIALS } from '@duty-shooter/fps-core';
import type { SurfaceMaterial, Voice, VoiceExtras } from './types';

const MATERIALS: readonly SurfaceMaterial[] = ALL_MATERIALS;

function debris(dst: Float32Array, sr: number, rng: Rng, at: number, dur: number, rate: number, gain: number, f: { hp?: number; lp?: number }): void {
  const c = crackle(sr, dur, rng, rate, (t) => (t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) / (dur * 0.3))));
  if (f.hp) hp(c, sr, f.hp);
  if (f.lp) lp(c, sr, f.lp);
  normalize(c, 1);
  mix(dst, c, sr, at, gain);
}

function renderImpact(material: SurfaceMaterial, rng: Rng, sr: number, variant: number): Float32Array[] {
  const dst = buffer(sr, material === 'metal' || material === 'glass' || material === 'sheetMetal' ? 0.6 : 0.35);
  switch (material) {
    case 'concrete':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.001, gain: 1, mode: 'highpass', freq: 2500, length: 0.01 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0002, tau: 0.006, gain: 0.8, mode: 'bandpass', freq: rng.range(1500, 2100), q: 1.2 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0005, tau: 0.008, gain: 0.5, mode: 'bandpass', freq: 300, q: 1 });
      debris(dst, sr, rng, 0.008, 0.22, 1200, 0.35, { hp: 2000 });
      break;
    case 'metal': {
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.0008, gain: 1, mode: 'highpass', freq: 3000, length: 0.008 });
      const b = rng.range(1200, 2000);
      modes(dst, sr, 0, [b, b * 2.76, b * 5.4, b * 1.13], [1, 0.5, 0.25, 0.4], [0.08, 0.04, 0.02, 0.06], 0.7);
      if (variant % 2 === 1) {
        // Ricochet whine: a falling, slightly wobbling tone.
        const f0 = rng.range(3200, 4000);
        thump(dst, sr, { at: 0.01, f0, f1: f0 * 0.5, glideTau: 0.18, attack: 0.02, tau: 0.12, gain: 0.3, vibrato: { rate: rng.range(18, 30), depth: 0.015 } });
      }
      break;
    }
    case 'wood': {
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0002, tau: 0.01, gain: 1, mode: 'bandpass', freq: rng.range(450, 600), q: 1.4 });
      const b = rng.range(200, 250);
      modes(dst, sr, 0, [b, b * 2.1, b * 3.3], [1, 0.5, 0.3], [0.025, 0.018, 0.012], 0.6);
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.0015, gain: 0.5, mode: 'highpass', freq: 2000, length: 0.01 });
      debris(dst, sr, rng, 0.002, 0.08, 1500, 0.3, { hp: 1500 });
      break;
    }
    case 'dirt':
    case 'grass':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.002, tau: 0.025, gain: 1, mode: 'lowpass', freq: material === 'grass' ? 500 : 650 });
      thump(dst, sr, { at: 0, f0: 120, f1: 85, glideTau: 0.01, attack: 0.001, tau: 0.015, gain: 0.5 });
      debris(dst, sr, rng, 0.004, 0.25, material === 'grass' ? 600 : 1400, 0.4, { lp: 3000, hp: 500 });
      if (material === 'grass') noiseBurst(dst, sr, rng, { at: 0, attack: 0.01, tau: 0.04, gain: 0.3, mode: 'bandpass', freq: 3000, q: 0.5 });
      break;
    case 'glass':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.001, gain: 1, mode: 'highpass', freq: 3000, length: 0.01 });
      for (const t of scatter(rng, 26, 0, 0.22, 1.8)) {
        const f = rng.range(2500, 8000);
        modes(dst, sr, t, [f, f * 1.37, f * 2.11], [1, 0.5, 0.3], [rng.range(0.02, 0.08), 0.02, 0.01], rng.range(0.08, 0.3));
      }
      debris(dst, sr, rng, 0.003, 0.35, 3000, 0.5, { hp: 4000 });
      break;
    case 'brick':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.001, gain: 0.9, mode: 'highpass', freq: 2200, length: 0.01 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0002, tau: 0.008, gain: 0.9, mode: 'bandpass', freq: rng.range(1000, 1400), q: 1 });
      thud(dst, sr, rng, 0, { freq: 260, gain: 0.5, tau: 0.012 });
      debris(dst, sr, rng, 0.006, 0.3, 1600, 0.5, { hp: 1200, lp: 7000 });
      break;
    case 'asphalt':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.0012, gain: 0.8, mode: 'highpass', freq: 2000, length: 0.01 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0003, tau: 0.009, gain: 0.9, mode: 'bandpass', freq: rng.range(700, 1000), q: 0.9 });
      thump(dst, sr, { at: 0, f0: 140, f1: 90, glideTau: 0.01, attack: 0.001, tau: 0.012, gain: 0.4 });
      debris(dst, sr, rng, 0.005, 0.22, 1300, 0.35, { hp: 1500, lp: 5000 });
      break;
    case 'gravel':
      thump(dst, sr, { at: 0, f0: 130, f1: 80, glideTau: 0.01, attack: 0.001, tau: 0.018, gain: 0.6 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.002, gain: 0.7, mode: 'highpass', freq: 1800, length: 0.01 });
      for (const t of scatter(rng, 14, 0.005, 0.28, 1.6)) {
        const f = rng.range(1500, 4500);
        modes(dst, sr, t, [f, f * 1.7], [1, 0.4], [0.008, 0.005], rng.range(0.1, 0.3));
      }
      debris(dst, sr, rng, 0.003, 0.3, 2500, 0.45, { hp: 1200 });
      break;
    case 'sand':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.003, tau: 0.03, gain: 1, mode: 'lowpass', freq: 420 });
      thump(dst, sr, { at: 0, f0: 100, f1: 70, glideTau: 0.01, attack: 0.002, tau: 0.02, gain: 0.45 });
      debris(dst, sr, rng, 0.01, 0.35, 2600, 0.35, { lp: 2200, hp: 400 });
      break;
    case 'sheetMetal': {
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.0008, gain: 1, mode: 'highpass', freq: 3500, length: 0.008 });
      const b = rng.range(450, 800);
      modes(dst, sr, 0, [b, b * 1.52, b * 2.33, b * 3.7, b * 0.61], [1, 0.7, 0.5, 0.3, 0.6], [0.12, 0.09, 0.06, 0.04, 0.15], 0.6);
      // The panel buzzing against its fixings.
      debris(dst, sr, rng, 0.004, 0.12, 4000, 0.25, { hp: 2500 });
      break;
    }
    case 'plastic': {
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0002, tau: 0.007, gain: 1, mode: 'bandpass', freq: rng.range(900, 1300), q: 1.4 });
      const b = rng.range(1600, 2200);
      modes(dst, sr, 0, [b, b * 1.9], [1, 0.4], [0.015, 0.008], 0.4);
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.001, gain: 0.5, mode: 'highpass', freq: 3000, length: 0.008 });
      debris(dst, sr, rng, 0.002, 0.06, 2000, 0.2, { hp: 2000 });
      break;
    }
    case 'plaster':
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0003, tau: 0.012, gain: 1, mode: 'bandpass', freq: rng.range(600, 800), q: 0.8 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.0015, gain: 0.4, mode: 'lowpass', freq: 3000, length: 0.01 });
      thud(dst, sr, rng, 0, { freq: 350, gain: 0.4, tau: 0.01 });
      debris(dst, sr, rng, 0.006, 0.25, 900, 0.4, { lp: 2500 });
      break;
  }
  return [finish(dst, sr, 0.5, 60)];
}

export function impactVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'impact',
    variants: 4,
    keys: MATERIALS,
    key: (p) => p.material ?? 'concrete',
    render: (key, rng, sr, v) => renderImpact(key as SurfaceMaterial, rng, sr, v),
    gain: (p) => (p.position === undefined ? 0.35 : 0.75),
    rateJitter: 0.06,
    gainJitterDb: 1.5,
    duration: 0.6,
  });
}

/** Brass casing bouncing: each bounce rings the thin tube's modes; the surface sets damping. */
function renderCasing(material: SurfaceMaterial, rng: Rng, sr: number): Float32Array[] {
  const dst = buffer(sr, 0.45);
  const soft = material === 'dirt' || material === 'grass' || material === 'sand' || material === 'gravel';
  const dull = material === 'wood' || material === 'plaster' || material === 'plastic' || material === 'asphalt';
  const bounces = soft ? 1 : rng.bool(0.5) ? 3 : 4;
  let t = 0;
  let gap = rng.range(0.08, 0.11);
  let amp = 1;
  const base = rng.range(3900, 4600);
  for (let b = 0; b < bounces; b++) {
    const tau = soft ? 0.004 : dull ? 0.012 : 0.025;
    modes(dst, sr, t, [base, base * 1.5, base * 2.25, base * 3.6], [1, 0.7, 0.45, 0.25], [tau, tau * 0.8, tau * 0.6, tau * 0.4], amp * 0.6);
    noiseBurst(dst, sr, rng, { at: t, attack: 0.0001, tau: 0.0006, gain: amp * 0.5, mode: 'highpass', freq: soft ? 1500 : 4000, length: 0.005 });
    if (material === 'metal' || material === 'sheetMetal') modes(dst, sr, t, [rng.range(1600, 2000), 2900], [1, 0.4], [0.03, 0.015], amp * 0.25);
    if (material === 'wood') noiseBurst(dst, sr, rng, { at: t, attack: 0.0002, tau: 0.005, gain: amp * 0.35, mode: 'bandpass', freq: 700, q: 1.5 });
    t += gap;
    gap *= rng.range(0.55, 0.7);
    amp *= rng.range(0.45, 0.6);
  }
  if (soft) lp(dst, sr, 1600);
  if (dull) lp(dst, sr, 5000);
  return [finish(dst, sr, 0.5, 300)];
}

export function casingVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'casing',
    variants: 5,
    keys: MATERIALS,
    key: (p) => p.material ?? 'concrete',
    render: (key, rng, sr) => renderCasing(key as SurfaceMaterial, rng, sr),
    gain: (p) => (p.local === true || p.position === undefined ? 0.12 : 0.3),
    rateJitter: 0.06,
    gainJitterDb: 2,
    duration: 0.45,
  });
}

export function bulletCrackVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'bulletCrack',
    variants: 5,
    keys: ['crack'],
    key: () => 'crack',
    render(_key, rng, sr) {
      const dst = buffer(sr, 0.2);
      // The bullet's shock wave: a very short N-wave.
      const nN = Math.max(2, Math.round(rng.range(0.00025, 0.0004) * sr));
      for (let i = 0; i < nN; i++) dst[i] = (dst[i] ?? 0) + (1 - (2 * i) / nN);
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: 0.001, gain: 0.7, mode: 'highpass', freq: 3000, steep: true, length: 0.01 });
      // Whiz trailing off after the snap.
      const w = white(sr, 0.15, rng);
      bp(w, sr, (t) => 4000 - 2500 * Math.min(1, t / 0.12), 2.5);
      shape(w, sr, (t) => (t < 0.005 ? t / 0.005 : Math.exp(-(t - 0.005) / 0.04)));
      normalize(w, 1);
      mix(dst, w, sr, 0.002, 0.22);
      return [finish(dst, sr, 0.5, 150)];
    },
    gain: () => 0.7,
    rateJitter: 0.05,
    gainJitterDb: 1.5,
    duration: 0.2,
  });
}
