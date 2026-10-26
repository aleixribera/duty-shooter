/** Non-positional UI feedback: hit / kill / headshot markers and the damage-taken thump. */
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

export const killMarkerVoice = (): Voice & VoiceExtras => marker('killMarker', 0.07, 0.42, (d, sr, rng) => tick(d, sr, rng, true));

export const headshotMarkerVoice = (): Voice & VoiceExtras =>
  marker('headshotMarker', 0.4, 0.4, (d, sr, rng) => {
    tick(d, sr, rng, false);
    // Metallic "clink": free-bar modes plus a slightly detuned twin for a helmet-like shimmer.
    const b = rng.range(3050, 3150);
    modes(d, sr, 0.002, [b, b * 1.006, b * 2.76, b * 5.4, b * 8.93], [1, 0.6, 0.4, 0.25, 0.1], [0.22, 0.18, 0.12, 0.06, 0.03], 0.55);
  });

export const damageTakenVoice = (): Voice & VoiceExtras =>
  marker('damageTaken', 0.35, 0.5, (d, sr, rng) => {
    noiseBurst(d, sr, rng, { at: 0, attack: 0.002, tau: 0.04, gain: 1, mode: 'lowpass', freq: 200, steep: true });
    thump(d, sr, { at: 0, f0: 85, f1: 50, glideTau: 0.02, attack: 0.002, tau: 0.06, gain: 0.9 });
    noiseBurst(d, sr, rng, { at: 0, attack: 0.001, tau: 0.01, gain: 0.4, mode: 'bandpass', freq: 500, q: 1 });
    lp(d, sr, 800);
  });
