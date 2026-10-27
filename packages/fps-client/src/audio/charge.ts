/**
 * Charge's sounds: the keypad tapped as the charge is planted, its chirp
 * once armed, the beep that quickens as the fuse runs down, the tools
 * working while it is defused and the falling tones when it is disarmed.
 * The beep is a cue to play by: it carries across a site.
 */
import { buffer, finish, hp, lp, modes, noiseBurst, type Rng } from './dsp';
import { synthVoice, unit } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** A small speaker's tone into `out`: a soft square wave with clean edges. */
function tone(out: Float32Array, sr: number, at: number, f: number, length: number, gain: number): void {
  const start = Math.round(at * sr);
  const count = Math.round(length * sr);
  const edge = Math.max(1, Math.round(0.003 * sr));
  for (let i = 0; i < count && start + i < out.length; i++) {
    const t = i / sr;
    const w = 2 * Math.PI * f * t;
    const s = Math.sin(w) + Math.sin(3 * w) / 3 + Math.sin(5 * w) / 5;
    const env = Math.min(1, i / edge, (count - i) / edge);
    out[start + i] = (out[start + i] ?? 0) + s * env * gain;
  }
}

/** A plastic key pressed: the click of the switch and the keypad's short blip, its pitch by `key` (0..1). */
export function keyPress(sr: number, rng: Rng, key: number): Float32Array {
  const out = buffer(sr, 0.15);
  noiseBurst(out, sr, rng, { at: 0.002, attack: 0.0002, tau: 0.003, gain: 0.5, mode: 'bandpass', freq: 3500, q: 2 });
  modes(out, sr, 0.002, [rng.range(1900, 2300), 4200], [1, 0.4], [0.008, 0.004], 0.25);
  tone(out, sr, 0.01, 1100 + 500 * key, 0.07, 0.35);
  return finish(out, sr, 0.5, 200);
}

/** The charge arming: a rising pair of tones and a relay clicking shut. */
export function armed(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, 0.6);
  tone(out, sr, 0.01, 1480, 0.12, 0.4);
  tone(out, sr, 0.16, 1980, 0.22, 0.4);
  noiseBurst(out, sr, rng, { at: 0.42, attack: 0.0002, tau: 0.004, gain: 0.4, mode: 'highpass', freq: 1500 });
  return finish(out, sr, 0.5, 200);
}

/** One beep of the fuse: short, high and piercing. */
export function beep(sr: number): Float32Array {
  const out = buffer(sr, 0.12);
  tone(out, sr, 0.002, 2350, 0.075, 0.5);
  return finish(out, sr, 0.5, 300);
}

/** The defuser at work: a cutter snipping a wire or a driver turning a screw, by `which` (0..1). */
export function toolClick(sr: number, rng: Rng, which: number): Float32Array {
  const out = buffer(sr, 0.25);
  if (which < 0.5) {
    // Snip: the blades meet and the wire springs.
    noiseBurst(out, sr, rng, { at: 0.003, attack: 0.0002, tau: 0.004, gain: 0.6, mode: 'highpass', freq: 2500 });
    modes(out, sr, 0.003, [rng.range(3800, 4600), rng.range(6500, 7500)], [1, 0.5], [0.02, 0.01], 0.25);
  } else {
    // A screw: ratchet clicks.
    for (let k = 0; k < 4; k++) noiseBurst(out, sr, rng, { at: 0.005 + k * rng.range(0.03, 0.045), attack: 0.0002, tau: 0.003, gain: 0.35, mode: 'bandpass', freq: 2800, q: 3 });
  }
  hp(out, sr, 300);
  return finish(out, sr, 0.5, 300);
}

/** The charge disarmed: three falling tones, then the speaker goes quiet with a click. */
export function disarmed(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, 0.9);
  tone(out, sr, 0.01, 1980, 0.15, 0.4);
  tone(out, sr, 0.2, 1480, 0.15, 0.4);
  tone(out, sr, 0.39, 990, 0.32, 0.4);
  noiseBurst(out, sr, rng, { at: 0.75, attack: 0.0002, tau: 0.004, gain: 0.3, mode: 'bandpass', freq: 1200 });
  lp(out, sr, 9000);
  return finish(out, sr, 0.5, 200);
}

/** How loud each Charge sound plays (before distance). */
export const CHARGE_GAIN = { key: 0.25, armed: 0.5, beep: 0.6, tool: 0.3, disarmed: 0.5 } as const;

export const chargeKeyVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'chargeKey',
    variants: 6,
    keys: ['key'],
    key: () => 'key',
    render: (_k, rng, sr, v) => [keyPress(sr, rng, (v * 0.37) % 1)],
    gain: () => CHARGE_GAIN.key,
    rateJitter: 0.02,
    gainJitterDb: 1.5,
    duration: 0.15,
  });

export const chargeArmedVoice = (): Voice & VoiceExtras =>
  synthVoice({ id: 'chargeArmed', variants: 1, keys: ['armed'], key: () => 'armed', render: (_k, rng, sr) => [armed(sr, rng)], gain: () => CHARGE_GAIN.armed, rateJitter: 0, gainJitterDb: 0, duration: 0.6 });

export const chargeBeepVoice = (): Voice & VoiceExtras =>
  synthVoice({ id: 'chargeBeep', variants: 1, keys: ['beep'], key: () => 'beep', render: (_k, _rng, sr) => [beep(sr)], gain: () => CHARGE_GAIN.beep, rateJitter: 0, gainJitterDb: 0, duration: 0.12 });

export const chargeToolVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'chargeTool',
    variants: 2,
    keys: ['snip', 'screw'],
    key: (p) => (unit(p.intensity, 0) < 0.5 ? 'snip' : 'screw'),
    render: (k, rng, sr) => [toolClick(sr, rng, k === 'snip' ? 0 : 1)],
    gain: () => CHARGE_GAIN.tool,
    rateJitter: 0.04,
    gainJitterDb: 2,
    duration: 0.25,
  });

export const chargeDisarmedVoice = (): Voice & VoiceExtras =>
  synthVoice({ id: 'chargeDisarmed', variants: 1, keys: ['disarmed'], key: () => 'disarmed', render: (_k, rng, sr) => [disarmed(sr, rng)], gain: () => CHARGE_GAIN.disarmed, rateJitter: 0, gainJitterDb: 0, duration: 0.9 });
