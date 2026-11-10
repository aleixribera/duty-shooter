/** Handling sounds of the v2 weapons and the frag: pump, bolt, shells, a feed cover, a cylinder, the pin, the throw, bounces and the blast. */
import { buffer, finish, lp, modes, noiseBurst, saturate, shape, thump, white } from './dsp';
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

/** A belt-fed gun's feed cover: both latches squeezed, and the cover lifted on its hinge until it stands. */
export const coverOpenVoice = (): Voice & VoiceExtras =>
  oneShot(
    'coverOpen',
    0.5,
    (dst, sr, rng) => {
      clack(dst, sr, rng, 0, { noiseFreq: 2600, base: rng.range(1700, 1900), gain: 0.8, tau: 0.008 });
      clack(dst, sr, rng, rng.range(0.012, 0.02), { noiseFreq: 2400, base: rng.range(1500, 1700), gain: 0.6, tau: 0.008 });
      scrape(dst, sr, rng, 0.05, 0.2, 0.3, 1100, 1700);
      // The spent belt's last links fall off the tray as it comes up.
      for (let i = 0; i < 3; i++) clink(dst, sr, rng, rng.range(0.1, 0.3), rng.range(4200, 6000), rng.range(0.15, 0.3), 0.006);
      clack(dst, sr, rng, rng.range(0.3, 0.33), { noiseFreq: 1500, base: rng.range(900, 1000), gain: 0.5, tau: 0.02, body: 220 });
    },
    { local: 0.4, remote: 0.55 },
  );

/** The feed cover slapped down on the belt: a pressed-steel lid on a receiver, and both latches catching. */
export const coverShutVoice = (): Voice & VoiceExtras =>
  oneShot(
    'coverShut',
    0.34,
    (dst, sr, rng) => {
      const t = rng.range(0.085, 0.095);
      cloth(dst, sr, rng, 0, 0.09, 0.3, 1100);
      noiseBurst(dst, sr, rng, { at: t, attack: 0.0001, tau: 0.003, gain: 1.1, mode: 'bandpass', freq: rng.range(1300, 1600), q: 0.8, length: 0.03 });
      clack(dst, sr, rng, t, { noiseFreq: 1500, base: rng.range(760, 860), gain: 1, tau: 0.035, body: 170 });
      thud(dst, sr, rng, t, { freq: 230, gain: 0.6, tau: 0.014 });
      clack(dst, sr, rng, t + rng.range(0.012, 0.018), { noiseFreq: 3000, base: rng.range(2000, 2300), gain: 0.55, tau: 0.008 });
      for (let i = 0; i < 2; i++) clink(dst, sr, rng, t + rng.range(0.02, 0.08), rng.range(4400, 5800), 0.15, 0.006);
    },
    { local: 0.5, remote: 0.65 },
  );

/** A revolver's cylinder: the latch thumbed, the cylinder swung out on its crane, and the ejector rod struck, six cases falling on the ground. */
export const cylinderOpenVoice = (): Voice & VoiceExtras =>
  oneShot(
    'cylinderOpen',
    1.0,
    (dst, sr, rng) => {
      clink(dst, sr, rng, 0, rng.range(3000, 3400), 0.6, 0.004);
      const swing = rng.range(0.05, 0.07);
      scrape(dst, sr, rng, 0.02, swing, 0.25, 1800, 2400);
      clack(dst, sr, rng, swing + 0.03, { noiseFreq: 2200, base: rng.range(1400, 1550), gain: 0.6, tau: 0.012 });
      // The rod, about four tenths of a second after the latch (see cylinderReloadTrack), and the brass.
      const rod = rng.range(0.44, 0.47);
      scrape(dst, sr, rng, rod, 0.035, 0.5, 2600, 3600);
      clack(dst, sr, rng, rod + 0.035, { noiseFreq: 2800, base: rng.range(1900, 2100), gain: 0.8, tau: 0.008 });
      for (let i = 0; i < 6; i++) {
        const at = rod + rng.range(0.2, 0.42);
        const brass = rng.range(3300, 4400);
        modes(dst, sr, at, [brass, brass * 1.6, brass * 2.7], [1, 0.6, 0.3], [0.02, 0.012, 0.008], rng.range(0.14, 0.26));
        if (rng.next() < 0.6) modes(dst, sr, at + rng.range(0.05, 0.11), [brass * 1.04, brass * 1.66], [1, 0.5], [0.014, 0.009], rng.range(0.06, 0.12));
      }
    },
    { local: 0.4, remote: 0.55 },
  );

/** Six rounds off a speedloader: lined up on the chambers, the knob turned, and they drop home together. */
export const cylinderLoadVoice = (): Voice & VoiceExtras =>
  oneShot(
    'cylinderLoad',
    0.4,
    (dst, sr, rng) => {
      for (let i = 0; i < 3; i++) clink(dst, sr, rng, rng.range(0, 0.05), rng.range(3400, 4200), rng.range(0.2, 0.35), 0.005);
      scrape(dst, sr, rng, 0.03, 0.08, 0.35, 2400, 3100);
      const drop = rng.range(0.14, 0.16);
      clack(dst, sr, rng, drop - 0.02, { noiseFreq: 3200, base: rng.range(2300, 2600), gain: 0.5, tau: 0.005 });
      for (let i = 0; i < 6; i++) {
        const brass = rng.range(2600, 3200);
        modes(dst, sr, drop + rng.range(0, 0.018), [brass, brass * 1.55], [1, 0.5], [0.007, 0.004], rng.range(0.3, 0.5));
      }
      thud(dst, sr, rng, drop + 0.006, { freq: 700, gain: 0.3, tau: 0.005 });
      cloth(dst, sr, rng, 0.2, 0.16, 0.2, 1400);
    },
    { local: 0.4, remote: 0.55 },
  );

/** The cylinder pushed shut: the crane meeting the frame and the latch pin snapping into the recoil shield. */
export const cylinderShutVoice = (): Voice & VoiceExtras =>
  oneShot(
    'cylinderShut',
    0.22,
    (dst, sr, rng) => {
      const t = rng.range(0.03, 0.04);
      scrape(dst, sr, rng, 0, t, 0.25, 2300, 1700);
      clack(dst, sr, rng, t, { noiseFreq: 2300, base: rng.range(1450, 1650), gain: 1, tau: 0.016, body: 320 });
      clink(dst, sr, rng, t + rng.range(0.008, 0.012), rng.range(3100, 3500), 0.5, 0.005);
      const frame = rng.range(1500, 1700);
      modes(dst, sr, t, [frame, frame * 1.58, frame * 2.41], [1, 0.5, 0.3], [0.03, 0.02, 0.012], 0.18);
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
