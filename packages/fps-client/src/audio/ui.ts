/** Non-positional UI feedback: hit / kill / headshot markers, the kill confirm and its Medal, Rank and Challenge stings, and the damage-taken thump. */
import { buffer, finish, lp, modes, noiseBurst, thump, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** The crisp, dry MW-style hit "tick": a high click with a tiny tonal body, ~30 ms. */
function tick(dst: Float32Array, sr: number, rng: Rng, heavy: boolean): void {
  noiseBurst(dst, sr, rng, { at: 0, attack: 0.0001, tau: heavy ? 0.002 : 0.0012, gain: 1, mode: heavy ? 'bandpass' : 'highpass', freq: heavy ? 2500 : 3500, q: 0.9, length: 0.015 });
  const f = heavy ? rng.range(1450, 1550) : rng.range(2650, 2750);
  modes(dst, sr, 0, [f, f * 2], [1, 0.4], [heavy ? 0.008 : 0.006, 0.003], 0.7, 0.0002);
  if (heavy) thump(dst, sr, { at: 0, f0: 180, f1: 120, glideTau: 0.01, attack: 0.0005, tau: 0.015, gain: 0.8 });
}

function marker(id: string, seconds: number, gain: number, draw: (dst: Float32Array, sr: number, rng: Rng) => void): Voice & VoiceExtras {
  return synthVoice({
    id,
    variants: 3,
    keys: [id],
    key: () => id,
    render(_key, rng, sr) {
      const dst = buffer(sr, seconds);
      draw(dst, sr, rng);
      return [finish(dst, sr, 0.5, 80)];
    },
    gain: () => gain,
    // UI feedback must be consistent: almost no jitter.
    rateJitter: 0.01,
    gainJitterDb: 0.3,
    duration: seconds,
  });
}

export const hitMarkerVoice = (): Voice & VoiceExtras => marker('hitMarker', 0.035, 0.32, (d, sr, rng) => tick(d, sr, rng, false));

/**
 * The kill confirm, in two parts: the heavy tick the moment the shot lands,
 * then a short bright ping a few hundredths later that says it was a kill.
 * Dry and brief, so a second kill's confirm is heard apart from the first's.
 */
export const killMarkerVoice = (): Voice & VoiceExtras =>
  marker('killMarker', 0.3, 0.42, (d, sr, rng) => {
    tick(d, sr, rng, true);
    const f = rng.range(1740, 1780);
    modes(d, sr, 0.045, [f, f * 2, f * 3.01], [1, 0.32, 0.1], [0.07, 0.04, 0.02], 0.5, 0.0006);
  });

/**
 * A kill through the head: the same two parts a fifth higher, the tick the
 * light one, and the ping a struck bar with a crisp top over it.
 */
export const headshotKillVoice = (): Voice & VoiceExtras =>
  marker('headshotKill', 0.45, 0.42, (d, sr, rng) => {
    tick(d, sr, rng, false);
    const b = rng.range(2610, 2660);
    // The top: a breath of air above 7 kHz on the ping's attack.
    noiseBurst(d, sr, rng, { at: 0.04, attack: 0.0002, tau: 0.006, gain: 0.5, mode: 'highpass', freq: 7000, length: 0.03 });
    modes(d, sr, 0.04, [b, b * 1.006, b * 2.76, b * 5.4], [1, 0.55, 0.35, 0.16], [0.16, 0.13, 0.07, 0.03], 0.55, 0.0004);
  });

/** A Medal earned: three quick notes rising through a major chord, the last one left to ring. */
export const medalVoice = (): Voice & VoiceExtras =>
  marker('medal', 0.75, 0.36, (d, sr) => {
    modes(d, sr, 0, [880, 1760], [1, 0.3], [0.06, 0.03], 0.7, 0.001);
    modes(d, sr, 0.07, [1108.7, 2217.5], [1, 0.3], [0.06, 0.03], 0.7, 0.001);
    modes(d, sr, 0.14, [1318.5, 2637, 3955.5], [1, 0.35, 0.12], [0.2, 0.1, 0.05], 0.8, 0.001);
  });

/** A Rank crossed: four notes up an octave and a half, landing on an open fifth that holds. */
export const rankUpVoice = (): Voice & VoiceExtras =>
  marker('rankUp', 1.5, 0.4, (d, sr) => {
    const notes = [587.3, 784, 880, 1174.7];
    notes.forEach((f, i) => modes(d, sr, i * 0.09, [f, f * 2], [1, 0.3], [0.09, 0.04], 0.6, 0.002));
    modes(d, sr, 0.38, [1174.7, 1760, 2349.3, 3520], [1, 0.7, 0.3, 0.12], [0.42, 0.36, 0.2, 0.1], 0.75, 0.003);
  });

/** A Challenge completed: two notes a fourth apart, low then high, like a box being ticked. */
export const challengeDoneVoice = (): Voice & VoiceExtras =>
  marker('challengeDone', 0.6, 0.34, (d, sr) => {
    modes(d, sr, 0, [1174.7, 2349.3], [1, 0.25], [0.08, 0.03], 0.7, 0.002);
    modes(d, sr, 0.11, [1568, 3136], [1, 0.25], [0.18, 0.06], 0.8, 0.002);
  });

export const headshotMarkerVoice = (): Voice & VoiceExtras =>
  marker('headshotMarker', 0.4, 0.4, (d, sr, rng) => {
    tick(d, sr, rng, false);
    // Metallic "clink": free-bar modes plus a slightly detuned twin for a helmet-like shimmer.
    const b = rng.range(3050, 3150);
    modes(d, sr, 0.002, [b, b * 1.006, b * 2.76, b * 5.4, b * 8.93], [1, 0.6, 0.4, 0.25, 0.1], [0.22, 0.18, 0.12, 0.06, 0.03], 0.55);
  });

/** A ping: two soft rising notes, a fifth apart, like a radio's call tone. */
export const pingVoice = (): Voice & VoiceExtras =>
  marker('ping', 0.4, 0.3, (d, sr) => {
    modes(d, sr, 0, [1320, 2640], [1, 0.25], [0.07, 0.03], 0.8, 0.002);
    modes(d, sr, 0.09, [1980, 3960], [1, 0.2], [0.12, 0.04], 0.8, 0.002);
  });

/** An enemy pinged: the same call, quicker and a step down, then once more: urgent without being an alarm. */
export const pingEnemyVoice = (): Voice & VoiceExtras =>
  marker('pingEnemy', 0.35, 0.34, (d, sr) => {
    modes(d, sr, 0, [1760, 3520], [1, 0.3], [0.05, 0.02], 0.8, 0.001);
    modes(d, sr, 0.07, [1320, 2640], [1, 0.3], [0.05, 0.02], 0.8, 0.001);
    modes(d, sr, 0.14, [1760, 3520], [1, 0.3], [0.08, 0.03], 0.8, 0.001);
  });

export const damageTakenVoice = (): Voice & VoiceExtras =>
  marker('damageTaken', 0.35, 0.5, (d, sr, rng) => {
    noiseBurst(d, sr, rng, { at: 0, attack: 0.002, tau: 0.04, gain: 1, mode: 'lowpass', freq: 200, steep: true });
    thump(d, sr, { at: 0, f0: 85, f1: 50, glideTau: 0.02, attack: 0.002, tau: 0.06, gain: 0.9 });
    noiseBurst(d, sr, rng, { at: 0, attack: 0.001, tau: 0.01, gain: 0.4, mode: 'bandpass', freq: 500, q: 1 });
    lp(d, sr, 800);
  });
