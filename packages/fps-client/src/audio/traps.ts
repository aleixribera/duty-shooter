/**
 * The island's sound traps (ticket 72): what gives away someone running past.
 * Each is one short pooled sound at the trap's spot, rendered ahead of time
 * like the rest, so a trap costs a buffer source when it goes off.
 *
 *   birds  = a flock bursting out of a canopy: a flurry of wingbeats and alarm calls
 *   metal  = loose sheet metal knocked and rattling on its nails
 *   gravel = loose stones sliding and skittering down a slope
 */
import { bp, buffer, crackle, finish, hp, lp, mix, modes, noiseBurst, scatter, shape, wobble, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

const BIRDS_SECONDS = 2.2;
const METAL_SECONDS = 1.6;
const GRAVEL_SECONDS = 1.5;

/** A flock flushing: wingbeats thick at first and thinning as the birds climb away, under sharp alarm calls. */
export function birdsFlush(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, BIRDS_SECONDS);
  // Wingbeats: soft broadband flaps, a dozen birds beating at 8-14 Hz, fewer and fainter as they go.
  const birds = 6 + Math.floor(rng.next() * 6);
  for (let b = 0; b < birds; b++) {
    const rate = rng.range(8, 14);
    const start = rng.range(0, 0.25);
    const away = rng.range(0.6, 1.6);
    for (let t = start; t < Math.min(BIRDS_SECONDS - 0.1, start + away); t += 1 / rate) {
      const fade = 1 - (t - start) / away;
      noiseBurst(out, sr, rng, { at: t, attack: 0.008, tau: 0.018, gain: 0.18 * fade * rng.range(0.6, 1), mode: 'bandpass', freq: rng.range(500, 1100), q: 0.7, length: 0.08 });
    }
  }
  // Leaves and twigs shaken as they burst out.
  const shaken = crackle(sr, BIRDS_SECONDS, rng, 600, (t) => Math.exp(-t / 0.25));
  hp(shaken, sr, 2500);
  mix(out, shaken, sr, 0, 0.35);
  // Alarm calls: short harsh chips, a few birds calling over each other.
  for (const at of scatter(rng, 5 + Math.floor(rng.next() * 5), 0.03, 1.4, 1.6)) {
    const f0 = rng.range(2800, 4200);
    const len = rng.range(0.04, 0.09);
    const start = Math.round(at * sr);
    const count = Math.round(len * sr);
    let phase = 0;
    for (let i = 0; i < count && start + i < out.length; i++) {
      const u = i / count;
      phase += (f0 * (1 - 0.25 * u)) / sr;
      const env = Math.sin(Math.PI * u) ** 0.8;
      // A rough edge on the tone: the scold of an alarm call, not a song.
      const s = Math.sin(2 * Math.PI * phase + 1.4 * Math.sin(2 * Math.PI * phase * 0.5));
      out[start + i] = (out[start + i] ?? 0) + 0.45 * s * env * (1 - at / 2);
    }
  }
  return finish(out, sr, 0.5, 250);
}

/** Sheet metal knocked: a bang through the panel's modes, then the panel rattling against its frame. */
export function metalRattle(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, METAL_SECONDS);
  const panel = [rng.range(170, 230), rng.range(410, 480), rng.range(690, 760), rng.range(1150, 1300), rng.range(2100, 2500)];
  // The knock.
  noiseBurst(out, sr, rng, { at: 0.002, attack: 0.0005, tau: 0.01, gain: 0.6, mode: 'bandpass', freq: 1400, q: 0.8 });
  modes(out, sr, 0.002, panel, [1, 0.8, 0.6, 0.45, 0.3], [0.35, 0.22, 0.16, 0.1, 0.06], 0.5);
  // The rattle: the loose edge slapping the frame, quick at first and dying away unevenly.
  const loose = wobble(rng, METAL_SECONDS, 0.12, 0.5);
  let t = 0.06;
  let rate = rng.range(22, 30);
  while (t < METAL_SECONDS - 0.2) {
    const fade = Math.exp(-t / 0.35) * loose(t);
    if (fade < 0.03) break;
    noiseBurst(out, sr, rng, { at: t, attack: 0.0003, tau: 0.004, gain: 0.35 * fade, mode: 'bandpass', freq: rng.range(1800, 3200), q: 1.4, length: 0.03 });
    modes(out, sr, t, [panel[1]! * rng.range(0.97, 1.03), panel[3]! * rng.range(0.97, 1.03)], [1, 0.6], [0.05, 0.03], 0.18 * fade);
    t += 1 / rate;
    rate *= 0.97;
  }
  return finish(out, sr, 0.5, 90);
}

/** Loose gravel giving way: a scrape, then stones skittering and settling down a slope. */
export function gravelSlide(sr: number, rng: Rng): Float32Array {
  const out = buffer(sr, GRAVEL_SECONDS);
  const slide = (t: number): number => Math.min(1, t / 0.04) * Math.exp(-t / 0.45);
  // The slide's hiss: grinding noise in the low mids.
  const grind = buffer(sr, GRAVEL_SECONDS);
  noiseBurst(grind, sr, rng, { at: 0, attack: 0.03, tau: 0.35, gain: 1, mode: 'bandpass', freq: (x) => 900 - 300 * Math.min(1, x), q: 0.6, length: GRAVEL_SECONDS });
  mix(out, grind, sr, 0, 0.35);
  // The stones: dense sharp ticks, bright and dry.
  const stones = crackle(sr, GRAVEL_SECONDS, rng, 1400, slide);
  bp(stones, sr, 3200, 0.6);
  mix(out, stones, sr, 0, 0.9);
  // A few larger stones knocking as they roll on.
  for (const at of scatter(rng, 6, 0.1, 1.1, 1.4)) {
    modes(out, sr, at, [rng.range(900, 1400), rng.range(2200, 3000)], [1, 0.5], [0.012, 0.007], 0.35 * slide(at) + 0.08);
  }
  shape(out, sr, (x) => Math.min(1, (GRAVEL_SECONDS - x) / 0.3));
  lp(out, sr, 9000);
  return finish(out, sr, 0.5, 120);
}

/** How loud each plays before distance: under a gunshot, over footsteps, so a trap is heard well past its runner's steps. */
export const TRAP_GAIN = { birds: 0.75, metal: 0.7, gravel: 0.6 } as const;

export const trapBirdsVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trapBirds',
    variants: 3,
    keys: ['flush'],
    key: () => 'flush',
    render: (_k, rng, sr) => [birdsFlush(sr, rng)],
    gain: () => TRAP_GAIN.birds,
    rateJitter: 0.06,
    gainJitterDb: 1.5,
    duration: BIRDS_SECONDS,
  });

export const trapMetalVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trapMetal',
    variants: 3,
    keys: ['rattle'],
    key: () => 'rattle',
    render: (_k, rng, sr) => [metalRattle(sr, rng)],
    gain: () => TRAP_GAIN.metal,
    rateJitter: 0.08,
    gainJitterDb: 1.5,
    duration: METAL_SECONDS,
  });

export const trapGravelVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'trapGravel',
    variants: 3,
    keys: ['slide'],
    key: () => 'slide',
    render: (_k, rng, sr) => [gravelSlide(sr, rng)],
    gain: () => TRAP_GAIN.gravel,
    rateJitter: 0.08,
    gainJitterDb: 1.5,
    duration: GRAVEL_SECONDS,
  });
