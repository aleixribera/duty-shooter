/** Handling sounds of the v2 weapons and the frag: pump, bolt, shells, the pin, the throw, bounces and the blast. */
import { buffer, finish, lp, noiseBurst, saturate, shape, thump, white } from './dsp';
import { clack, clink, cloth, scrape, thud, whoosh } from './parts';
import { synthVoice } from './synth-voice';
import { oneShot } from './weapon';
import type { Voice, VoiceExtras } from './types';

export const pumpRackVoice = (): Voice & VoiceExtras =>
  oneShot(
    'pumpRack',
    0.42,
    (dst, sr, rng) => {
      // Forend back: the action unlocks, slides, the empty hull flips out; forward: it slams home.
      clack(dst, sr, rng, 0, { noiseFreq: 1700, base: rng.range(900, 1050), gain: 0.7, tau: 0.02, body: 200 });
      scrape(dst, sr, rng, 0.01, 0.1, 0.55, 900, 1600);
      clack(dst, sr, rng, rng.range(0.11, 0.12), { noiseFreq: 1500, base: rng.range(800, 900), gain: 0.8, tau: 0.025, body: 180 });
      scrape(dst, sr, rng, 0.2, 0.08, 0.45, 1600, 1000);
      clack(dst, sr, rng, rng.range(0.28, 0.3), { noiseFreq: 2000, base: rng.range(1000, 1150), gain: 1, tau: 0.03, body: 220 });
    },
    { local: 0.5, remote: 0.65 },
  );

export const boltOpenVoice = (): Voice & VoiceExtras =>
  oneShot(
    'boltOpen',
    0.3,
    (dst, sr, rng) => {
      // Handle up off its lug, then the bolt drawn back to the stop.
      clack(dst, sr, rng, 0, { noiseFreq: 2600, base: rng.range(1700, 1900), gain: 0.6, tau: 0.012 });
      scrape(dst, sr, rng, 0.05, 0.14, 0.6, 1200, 2600);
      clack(dst, sr, rng, rng.range(0.19, 0.2), { noiseFreq: 2200, base: rng.range(1300, 1450), gain: 0.7, tau: 0.018 });
    },
    { local: 0.45, remote: 0.6 },
  );

export const boltCloseVoice = (): Voice & VoiceExtras =>
  oneShot(
    'boltClose',
    0.3,
    (dst, sr, rng) => {
      // Forward, stripping a round, and the handle locking down.
      scrape(dst, sr, rng, 0, 0.1, 0.55, 2400, 1300);
      clack(dst, sr, rng, rng.range(0.1, 0.11), { noiseFreq: 2000, base: rng.range(1100, 1250), gain: 0.85, tau: 0.025, body: 230 });
      clack(dst, sr, rng, rng.range(0.17, 0.19), { noiseFreq: 3000, base: rng.range(1900, 2100), gain: 0.6, tau: 0.01 });
    },
    { local: 0.45, remote: 0.6 },
  );

export const shellInsertVoice = (): Voice & VoiceExtras =>
  oneShot(
    'shellInsert',
    0.2,
    (dst, sr, rng) => {
      // The thumb pushes a shell past the carrier into the tube.
      scrape(dst, sr, rng, 0, 0.05, 0.4, 1100, 1800);
      clack(dst, sr, rng, rng.range(0.05, 0.06), { noiseFreq: 1400, base: rng.range(700, 820), gain: 0.65, tau: 0.02 });
      clink(dst, sr, rng, rng.range(0.07, 0.08), rng.range(2400, 2800), 0.25, 0.006);
    },
    { local: 0.4, remote: 0.55, variants: 4 },
  );

export const grenadePinVoice = (): Voice & VoiceExtras =>
  oneShot(
    'grenadePin',
    0.3,
    (dst, sr, rng) => {
      // The ring pulled, the pin scraping out, a little ting.
      scrape(dst, sr, rng, 0, 0.06, 0.45, 2800, 3800);
      clink(dst, sr, rng, rng.range(0.06, 0.07), rng.range(3800, 4400), 0.5, 0.03);
      cloth(dst, sr, rng, 0.02, 0.15, 0.15, 1300);
    },
    { local: 0.4, remote: 0.55 },
  );

export const grenadeThrowVoice = (): Voice & VoiceExtras =>
  oneShot(
    'grenadeThrow',
    0.4,
    (dst, sr, rng) => {
      // The spoon flying off and the arm through the air.
      clink(dst, sr, rng, 0, rng.range(3000, 3500), 0.55, 0.012);
      whoosh(dst, sr, rng, 0.02, 0.3, 0.6, 300, 1400);
      cloth(dst, sr, rng, 0.0, 0.25, 0.25, 1100);
    },
    { local: 0.4, remote: 0.5 },
  );

export const grenadeBounceVoice = (): Voice & VoiceExtras =>
  oneShot(
    'grenadeBounce',
    0.25,
    (dst, sr, rng) => {
      // A heavy little lump of steel landing: a dull knock with some ring.
      thud(dst, sr, rng, 0, { freq: rng.range(700, 900), gain: 0.8, tau: 0.018 });
      clack(dst, sr, rng, 0.001, { noiseFreq: 1800, base: rng.range(1300, 1600), gain: 0.4, tau: 0.03 });
    },
    { local: 0.6, remote: 0.8, variants: 5 },
  );

const BLAST_SECONDS = 2.6;

/** A frag going off: a hard crack, a chest-thumping boom, fragments and dirt falling, the echo rolling off. */
export const explosionVoice = (): Voice & VoiceExtras =>
  synthVoice({
    id: 'explosion',
    variants: 3,
    keys: ['explosion'],
    key: () => 'explosion',
    render(_key, rng, sr) {
      const out = buffer(sr, BLAST_SECONDS);
      noiseBurst(out, sr, rng, { at: 0, attack: 0.0001, tau: 0.004, gain: 1.4, mode: 'highpass', freq: 1200, length: 0.03 });
      noiseBurst(out, sr, rng, { at: 0, attack: 0.0005, tau: 0.06, gain: 1.6, mode: 'bandpass', freq: rng.range(300, 450), q: 0.7, length: 0.5 });
      thump(out, sr, { at: 0.001, f0: rng.range(80, 95), f1: 32, glideTau: 0.06, attack: 0.002, tau: 0.22, gain: 1.4 });
      noiseBurst(out, sr, rng, { at: 0.002, attack: 0.004, tau: 0.35, gain: 0.9, mode: 'lowpass', freq: 260, steep: true, length: 1.6 });
      // Fragments and grit pattering down.
      const grit = white(sr, BLAST_SECONDS, rng);
      lp(grit, sr, 4500);
      shape(grit, sr, (t) => (t < 0.15 ? 0 : Math.exp(-(t - 0.15) / 0.5) * 0.18 * (0.5 + 0.5 * Math.sin(t * 90 + rng.next() * 6))));
      for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (grit[i] ?? 0);
      // The echo off the surroundings.
      noiseBurst(out, sr, rng, { at: rng.range(0.25, 0.4), attack: 0.03, tau: 0.5, gain: 0.35, mode: 'lowpass', freq: 500, length: 1.8 });
      saturate(out, 1.6);
      return [finish(out, sr, 0.6, 25)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.9 : 1),
    rateJitter: 0.04,
    gainJitterDb: 1,
    duration: BLAST_SECONDS,
  });
