/** Weapon handling foley: dry fire, reload stages, raise, inspect, ADS, melee. */
import { buffer, finish, modes, noiseBurst, thump, type Rng } from './dsp';
import { clack, clink, cloth, rattle, scrape, thud, whoosh } from './parts';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras, VoiceParams } from './types';

/** Handling sounds are louder when they are your own gun in your hands. */
const near = (localGain: number, remoteGain: number) => (p: VoiceParams) =>
  p.local === true || p.position === undefined ? localGain : remoteGain;

export function oneShot(
  id: string,
  seconds: number,
  draw: (dst: Float32Array, sr: number, rng: Rng) => void,
  o: { local: number; remote: number; variants?: number; rateJitter?: number; gainJitterDb?: number },
): Voice & VoiceExtras {
  return synthVoice({
    id,
    variants: o.variants ?? 3,
    keys: [id],
    key: () => id,
    render(_key, rng, sr) {
      const dst = buffer(sr, seconds);
      draw(dst, sr, rng);
      return [finish(dst, sr, 0.5, 60)];
    },
    gain: near(o.local, o.remote),
    rateJitter: o.rateJitter ?? 0.03,
    gainJitterDb: o.gainJitterDb ?? 1,
    duration: seconds,
  });
}

export const dryFireVoice = (): Voice & VoiceExtras =>
  oneShot(
    'dryFire',
    0.1,
    (dst, sr, rng) => {
      // Trigger break, then the hammer falling on an empty chamber.
      clink(dst, sr, rng, 0, rng.range(2800, 3300), 0.5, 0.004);
      clack(dst, sr, rng, rng.range(0.007, 0.01), { noiseFreq: 2500, base: rng.range(1700, 1950), gain: 1, tau: 0.008 });
    },
    { local: 0.32, remote: 0.4, variants: 4 },
  );

export const magOutVoice = (): Voice & VoiceExtras =>
  oneShot(
    'reloadMagOut',
    0.38,
    (dst, sr, rng) => {
      // Mag release latch click.
      clack(dst, sr, rng, 0, { noiseFreq: 4000, base: rng.range(2600, 3000), gain: 0.8, tau: 0.006 });
      // Mag sliding out of the well.
      scrape(dst, sr, rng, 0.012, 0.16, 0.55, 1800, 1200);
      // Leaving the well: a loose clink as it clears.
      clink(dst, sr, rng, rng.range(0.17, 0.2), rng.range(1400, 1700), 0.5, 0.015);
      cloth(dst, sr, rng, 0.05, 0.25, 0.2, 1200);
    },
    { local: 0.35, remote: 0.5 },
  );

export const magInVoice = (): Voice & VoiceExtras =>
  oneShot(
    'reloadMagIn',
    0.35,
    (dst, sr, rng) => {
      scrape(dst, sr, rng, 0, 0.065, 0.4, 1300, 1700);
      // Solid insert clack.
      const t = rng.range(0.065, 0.075);
      clack(dst, sr, rng, t, { noiseFreq: 1500, base: rng.range(850, 950), gain: 1, tau: 0.025, body: 260 });
      thud(dst, sr, rng, t, { freq: 300, gain: 0.45, tau: 0.008 });
      // Mag catch engaging.
      clack(dst, sr, rng, t + rng.range(0.022, 0.03), { noiseFreq: 4200, base: rng.range(3000, 3400), gain: 0.55, tau: 0.006 });
    },
    { local: 0.4, remote: 0.55 },
  );

export const boltReleaseVoice = (): Voice & VoiceExtras =>
  oneShot(
    'reloadBoltRelease',
    0.38,
    (dst, sr, rng) => {
      // Thumb on the bolt catch, then the carrier slamming home under spring load.
      clink(dst, sr, rng, 0, rng.range(2900, 3300), 0.35, 0.004);
      const t = rng.range(0.011, 0.015);
      noiseBurst(dst, sr, rng, { at: t, attack: 0.0001, tau: 0.0025, gain: 1.2, mode: 'bandpass', freq: rng.range(2000, 2400), q: 0.8, length: 0.03 });
      const b = rng.range(1050, 1200);
      modes(dst, sr, t, [b, b * 1.47, b * 2.09, b * 2.56, b * 3.3, b * 4.2], [1, 0.7, 0.5, 0.35, 0.25, 0.15], [0.04, 0.03, 0.02, 0.014, 0.01, 0.008], 0.55);
      thump(dst, sr, { at: t, f0: 280, f1: 235, glideTau: 0.01, attack: 0.0003, tau: 0.015, gain: 0.5 });
      // Buffer spring ring-out.
      const spring = rng.range(650, 720);
      thump(dst, sr, { at: t, f0: spring, f1: spring, glideTau: 1, attack: 0.004, tau: 0.06, gain: 0.12, vibrato: { rate: 28, depth: 0.02 } });
    },
    { local: 0.45, remote: 0.6 },
  );

export const chargingHandleVoice = (): Voice & VoiceExtras =>
  oneShot(
    'reloadChargingHandle',
    0.5,
    (dst, sr, rng) => {
      // Latch, pull travel, carrier hitting the rear.
      clink(dst, sr, rng, 0, rng.range(2500, 2900), 0.5, 0.005);
      scrape(dst, sr, rng, 0.005, 0.12, 0.6, 1000, 2500);
      clack(dst, sr, rng, rng.range(0.12, 0.13), { noiseFreq: 1800, base: rng.range(1300, 1500), gain: 0.75, tau: 0.015 });
      // Release: carrier runs forward and locks, handle snaps back.
      const r = rng.range(0.22, 0.24);
      scrape(dst, sr, rng, r, 0.03, 0.35, 2200, 1500);
      clack(dst, sr, rng, r + 0.03, { noiseFreq: 2100, base: rng.range(1050, 1200), gain: 1, tau: 0.03, body: 240 });
      clack(dst, sr, rng, r + rng.range(0.05, 0.06), { noiseFreq: 3800, base: rng.range(2700, 3100), gain: 0.5, tau: 0.007 });
    },
    { local: 0.45, remote: 0.6 },
  );

export const weaponRaiseVoice = (): Voice & VoiceExtras =>
  oneShot(
    'weaponRaise',
    0.42,
    (dst, sr, rng) => {
      cloth(dst, sr, rng, 0, 0.3, 0.8, 1300);
      rattle(dst, sr, rng, 0.01, 0.25, 6, 0.45, 1800, 3500);
      thud(dst, sr, rng, rng.range(0.18, 0.22), { freq: 400, gain: 0.35, tau: 0.008 });
    },
    { local: 0.25, remote: 0.4 },
  );

export const inspectRattleVoice = (): Voice & VoiceExtras =>
  oneShot(
    'inspectRattle',
    0.65,
    (dst, sr, rng) => {
      cloth(dst, sr, rng, 0, 0.5, 0.5, 1200);
      rattle(dst, sr, rng, 0.02, 0.5, 11, 0.5, 1600, 3600);
      for (let i = 0; i < 3; i++) {
        clack(dst, sr, rng, rng.range(0.05, 0.5), { noiseFreq: 1600, base: rng.range(850, 1000), gain: rng.range(0.25, 0.45), tau: 0.012 });
      }
    },
    { local: 0.25, remote: 0.35 },
  );

export const adsInVoice = (): Voice & VoiceExtras =>
  oneShot(
    'adsIn',
    0.25,
    (dst, sr, rng) => {
      cloth(dst, sr, rng, 0, 0.2, 1, 1300);
      clink(dst, sr, rng, rng.range(0.06, 0.1), rng.range(1700, 2200), 0.25, 0.006);
      thud(dst, sr, rng, rng.range(0.1, 0.14), { freq: 500, gain: 0.2, tau: 0.006 });
    },
    { local: 0.16, remote: 0.25, variants: 4, rateJitter: 0.05 },
  );

export const adsOutVoice = (): Voice & VoiceExtras =>
  oneShot(
    'adsOut',
    0.22,
    (dst, sr, rng) => {
      cloth(dst, sr, rng, 0, 0.17, 1, 950);
      clink(dst, sr, rng, rng.range(0.02, 0.05), rng.range(1500, 1900), 0.2, 0.006);
    },
    { local: 0.13, remote: 0.22, variants: 4, rateJitter: 0.05 },
  );

export const meleeSwingVoice = (): Voice & VoiceExtras =>
  oneShot(
    'meleeSwing',
    0.38,
    (dst, sr, rng) => {
      whoosh(dst, sr, rng, 0, 0.32, 1, rng.range(350, 450), rng.range(1400, 1800));
      cloth(dst, sr, rng, 0, 0.2, 0.3, 1400);
      rattle(dst, sr, rng, 0.05, 0.15, 3, 0.2);
    },
    { local: 0.35, remote: 0.5, variants: 4 },
  );

export const meleeHitVoice = (): Voice & VoiceExtras =>
  oneShot(
    'meleeHit',
    0.32,
    (dst, sr, rng) => {
      thud(dst, sr, rng, 0, { freq: 250, gain: 1, tau: 0.02, pitch: 65 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0003, tau: 0.006, gain: 0.5, mode: 'bandpass', freq: rng.range(800, 1000), q: 0.8 });
      thump(dst, sr, { at: 0.001, f0: 110, f1: 60, glideTau: 0.015, attack: 0.001, tau: 0.03, gain: 0.6 });
      rattle(dst, sr, rng, 0.01, 0.12, 3, 0.2);
    },
    { local: 0.5, remote: 0.6, variants: 4 },
  );
