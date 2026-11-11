/**
 * A Battle Royale's Preparation: a low drone that swells in overlapping
 * segments, and a heartbeat that quickens toward the drop. Neither is placed
 * in the world: they are the moment's, not the island's.
 */
import { buffer, finish, lp, mix, shape, thump, white, wobble, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** One drone segment, and how much segments overlap so they join without a seam. */
export const DRONE_SECONDS = 4;
export const DRONE_OVERLAP = 0.6;
const BEAT_SECONDS = 0.6;

/** The drone: a low fifth beating against itself, with a dark rumble under it and a slow swell. */
export function prepDrone(sr: number, rng: Rng): Float32Array {
  const seconds = DRONE_SECONDS;
  const out = buffer(sr, seconds);
  const swell = wobble(rng, seconds, 0.8, 0.25);
  const tone = buffer(sr, seconds);
  for (const [f, g] of [[41.2, 1], [41.6, 0.8], [61.7, 0.45], [82.4, 0.3], [123.5, 0.12]] as const) {
    let phase = rng.next();
    for (let i = 0; i < tone.length; i++) {
      phase += f / sr;
      tone[i] = (tone[i] ?? 0) + Math.sin(2 * Math.PI * phase) * g;
    }
  }
  shape(tone, sr, swell);
  mix(out, tone, sr, 0, 0.4);
  const rumble = white(sr, seconds, rng);
  lp(rumble, sr, 90);
  mix(out, rumble, sr, 0, 1.4);
  finish(out, sr, 0.55, 25);
  shape(out, sr, (t) => Math.min(1, t / DRONE_OVERLAP, (seconds - t) / DRONE_OVERLAP));
  return out;
}

/** One beat: lub, then a softer dub. */
export function heartbeat(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, BEAT_SECONDS);
  const tilt = 1 + (rng.next() - 0.5) * 0.06;
  thump(out, sr, { at: 0.005, f0: 70 * tilt, f1: 42, glideTau: 0.03, attack: 0.008, tau: 0.045, gain: 1 });
  thump(out, sr, { at: 0.2, f0: 62 * tilt, f1: 40, glideTau: 0.03, attack: 0.008, tau: 0.04, gain: 0.65 });
  // The knock of each: an octave and more above the thump, short, so the beat is still there on a laptop or a phone, which play next to nothing under 100 Hz.
  thump(out, sr, { at: 0.005, f0: 190 * tilt, f1: 118, glideTau: 0.02, attack: 0.004, tau: 0.022, gain: 0.6 });
  thump(out, sr, { at: 0.2, f0: 170 * tilt, f1: 108, glideTau: 0.02, attack: 0.004, tau: 0.02, gain: 0.4 });
  lp(out, sr, 260);
  return finish(out, sr, 0.7, 25);
}

/** How loud each plays at full tension. */
const PREP_GAIN = { drone: 0.5, beat: 0.75 } as const;

export const prepDroneVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'prepDrone',
    variants: 3,
    keys: ['drone'],
    key: () => 'drone',
    render: (_k, rng, sr) => [prepDrone(sr, rng)],
    gain: (p) => PREP_GAIN.drone * (p.intensity ?? 1),
    rateJitter: 0,
    gainJitterDb: 0.5,
    duration: DRONE_SECONDS,
  });

export const heartbeatVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'heartbeat',
    variants: 3,
    keys: ['beat'],
    key: () => 'beat',
    render: (_k, rng, sr) => [heartbeat(sr, rng)],
    gain: (p) => PREP_GAIN.beat * (p.intensity ?? 1),
    rateJitter: 0.02,
    gainJitterDb: 0.5,
    duration: BEAT_SECONDS,
  });
