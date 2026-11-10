/** Weapon handling foley: dry fire, reload stages, raise, inspect, ADS, melee. */
import { buffer, finish, modes, noiseBurst, thump, type Rng } from './dsp';
import { clack, clink, cloth, rattle, scrape, thud, whoosh } from './parts';
import { synthVoice } from './synth-voice';
import type { WeaponId } from '@duty-shooter/fps-core';
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

type Draw = (dst: Float32Array, sr: number, rng: Rng) => void;
/** One gun's way of making a handling sound: how long it lasts, and how loud beside the others' (1 when absent). */
interface Take {
  readonly seconds: number;
  readonly level?: number;
  readonly draw: Draw;
}

/**
 * A handling sound each gun makes its own way: a take per weapon (params.weapon), the rifle's
 * standing in for a gun without one. A long steel bolt, a pistol's slide and a stick magazine
 * are different objects, so they are different recipes, not one recipe at different pitches.
 */
function perWeapon(
  id: string,
  takes: Readonly<Partial<Record<WeaponId, Take>>> & { readonly m4a1: Take },
  o: { local: number; remote: number; variants?: number; rateJitter?: number },
): Voice & VoiceExtras {
  const take = (key: string): Take => takes[key as WeaponId] ?? takes.m4a1;
  const keyOf = (p: VoiceParams): WeaponId => (p.weapon !== undefined && takes[p.weapon] ? p.weapon : 'm4a1');
  const rateJitter = o.rateJitter ?? 0.03;
  const voice = synthVoice({
    id,
    variants: o.variants ?? 2,
    keys: Object.keys(takes),
    key: keyOf,
    render(key, rng, sr) {
      const t = take(key);
      const dst = buffer(sr, t.seconds);
      t.draw(dst, sr, rng);
      return [finish(dst, sr, 0.5 * (t.level ?? 1), 60)];
    },
    gain: near(o.local, o.remote),
    rateJitter,
    gainJitterDb: 1,
    duration: Math.max(...Object.values(takes).map((t) => t.seconds)),
  });
  // A pistol's click frees its slot sooner than a rifle's bolt does.
  return { ...voice, lengthOf: (p) => take(keyOf(p as VoiceParams)).seconds / (1 - rateJitter) };
}

/** Pulling the trigger on nothing: what falls, and on what, is the gun's own. */
export const dryFireVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'dryFire',
    {
      m4a1: {
        seconds: 0.1,
        draw(dst, sr, rng) {
          // Trigger break, then the hammer falling on an empty chamber.
          clink(dst, sr, rng, 0, rng.range(2800, 3300), 0.5, 0.004);
          clack(dst, sr, rng, rng.range(0.007, 0.01), { noiseFreq: 2500, base: rng.range(1700, 1950), gain: 1, tau: 0.008 });
        },
      },
      smg: {
        seconds: 0.09,
        level: 0.9,
        draw(dst, sr, rng) {
          // A light hammer in a sheet-steel receiver: thinner, and the cover buzzes with it.
          clink(dst, sr, rng, 0, rng.range(3300, 3800), 0.45, 0.003);
          clack(dst, sr, rng, rng.range(0.005, 0.008), { noiseFreq: 3200, base: rng.range(2300, 2600), gain: 1, tau: 0.006 });
          const buzz = rng.range(1150, 1300);
          thump(dst, sr, { at: 0.008, f0: buzz, f1: buzz, glideTau: 1, attack: 0.001, tau: 0.012, gain: 0.15, vibrato: { rate: 90, depth: 0.03 } });
        },
      },
      pistol: {
        seconds: 0.07,
        level: 0.75,
        draw(dst, sr, rng) {
          // A striker let go inside a polymer frame: one dry tick and a small knock.
          clink(dst, sr, rng, 0, rng.range(3900, 4500), 0.9, 0.0035);
          thud(dst, sr, rng, 0.001, { freq: 700, gain: 0.3, tau: 0.004 });
        },
      },
      shotgun: {
        seconds: 0.14,
        level: 1.1,
        draw(dst, sr, rng) {
          // The hammer inside a steel receiver, the empty tube under it ringing hollow.
          clink(dst, sr, rng, 0, rng.range(2300, 2700), 0.4, 0.005);
          clack(dst, sr, rng, rng.range(0.008, 0.012), { noiseFreq: 1700, base: rng.range(1150, 1350), gain: 1, tau: 0.014, body: 210 });
          const tube = rng.range(420, 480);
          thump(dst, sr, { at: 0.012, f0: tube, f1: tube, glideTau: 1, attack: 0.002, tau: 0.03, gain: 0.2 });
        },
      },
      sniper: {
        seconds: 0.14,
        level: 1.15,
        draw(dst, sr, rng) {
          // A long striker thrown by a heavy spring: a hard snap, and the spring singing after it.
          clink(dst, sr, rng, 0, rng.range(2500, 2900), 0.35, 0.004);
          const t = rng.range(0.006, 0.009);
          clack(dst, sr, rng, t, { noiseFreq: 2100, base: rng.range(1450, 1650), gain: 1, tau: 0.012, body: 260 });
          const spring = rng.range(820, 900);
          thump(dst, sr, { at: t, f0: spring, f1: spring, glideTau: 1, attack: 0.002, tau: 0.035, gain: 0.16, vibrato: { rate: 34, depth: 0.025 } });
        },
      },
      lmg: {
        seconds: 0.16,
        level: 1.2,
        draw(dst, sr, rng) {
          // An open bolt let go on an empty tray: the whole heavy carrier runs forward and stops on nothing.
          clink(dst, sr, rng, 0, rng.range(2100, 2400), 0.3, 0.005);
          scrape(dst, sr, rng, 0.004, 0.024, 0.35, 1900, 1200);
          clack(dst, sr, rng, rng.range(0.028, 0.034), { noiseFreq: 1400, base: rng.range(820, 940), gain: 1, tau: 0.022, body: 190 });
        },
      },
      dmr: {
        seconds: 0.12,
        level: 1.05,
        draw(dst, sr, rng) {
          // A two-stage trigger breaking, and a hammer on a long firing pin in a steel receiver set in wood.
          clink(dst, sr, rng, 0, rng.range(2600, 3000), 0.4, 0.004);
          clack(dst, sr, rng, rng.range(0.008, 0.011), { noiseFreq: 2200, base: rng.range(1500, 1700), gain: 1, tau: 0.01, body: 240 });
          thud(dst, sr, rng, 0.011, { freq: 480, gain: 0.25, tau: 0.006 });
        },
      },
      burst: {
        seconds: 0.09,
        level: 0.9,
        draw(dst, sr, rng) {
          // The hammer is a long linkage away from the trigger, inside the stock: a click and a hollow knock.
          clink(dst, sr, rng, 0, rng.range(3200, 3700), 0.5, 0.003);
          clack(dst, sr, rng, rng.range(0.006, 0.009), { noiseFreq: 2700, base: rng.range(1900, 2150), gain: 0.9, tau: 0.006 });
          const shell = rng.range(640, 720);
          thump(dst, sr, { at: 0.008, f0: shell, f1: shell * 0.94, glideTau: 0.01, attack: 0.0006, tau: 0.012, gain: 0.3 });
        },
      },
      revolver: {
        seconds: 0.12,
        level: 0.95,
        draw(dst, sr, rng) {
          // The cylinder turns to a spent case, the bolt drops into its notch, and the hammer falls on a dead primer.
          clink(dst, sr, rng, 0, rng.range(3000, 3400), 0.45, 0.004);
          clink(dst, sr, rng, rng.range(0.018, 0.024), rng.range(2400, 2700), 0.4, 0.005);
          clack(dst, sr, rng, rng.range(0.036, 0.042), { noiseFreq: 2400, base: rng.range(1550, 1750), gain: 1, tau: 0.012, body: 300 });
        },
      },
    },
    { local: 0.32, remote: 0.4, variants: 3 },
  );

/** The magazine leaving the gun: an alloy rifle magazine, a long thin stick, a pistol's dropping from the grip, a steel box off its lever, a belt box off its hook. */
export const magOutVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'reloadMagOut',
    {
      m4a1: {
        seconds: 0.38,
        draw(dst, sr, rng) {
          // Mag release latch click.
          clack(dst, sr, rng, 0, { noiseFreq: 4000, base: rng.range(2600, 3000), gain: 0.8, tau: 0.006 });
          // Mag sliding out of the well.
          scrape(dst, sr, rng, 0.012, 0.16, 0.55, 1800, 1200);
          // Leaving the well: a loose clink as it clears.
          clink(dst, sr, rng, rng.range(0.17, 0.2), rng.range(1400, 1700), 0.5, 0.015);
          cloth(dst, sr, rng, 0.05, 0.25, 0.2, 1200);
        },
      },
      smg: {
        seconds: 0.36,
        level: 0.9,
        draw(dst, sr, rng) {
          // A paddle catch, then a long thin stick drawn down out of the grip, its rounds chattering.
          clack(dst, sr, rng, 0, { noiseFreq: 3000, base: rng.range(2000, 2300), gain: 0.7, tau: 0.008 });
          scrape(dst, sr, rng, 0.01, 0.2, 0.6, 2600, 1700);
          rattle(dst, sr, rng, 0.03, 0.18, 5, 0.3, 2600, 4200);
          clink(dst, sr, rng, rng.range(0.21, 0.24), rng.range(2000, 2400), 0.4, 0.01);
          cloth(dst, sr, rng, 0.06, 0.22, 0.18, 1400);
        },
      },
      pistol: {
        seconds: 0.26,
        level: 0.75,
        draw(dst, sr, rng) {
          // A thumb on the button, and the magazine falls out of the grip into the hand.
          clink(dst, sr, rng, 0, rng.range(3500, 4000), 0.7, 0.004);
          scrape(dst, sr, rng, 0.008, 0.07, 0.5, 2800, 2100);
          thud(dst, sr, rng, rng.range(0.1, 0.12), { freq: 520, gain: 0.4, tau: 0.007 });
          cloth(dst, sr, rng, 0.08, 0.14, 0.25, 1500);
        },
      },
      sniper: {
        seconds: 0.42,
        level: 1.1,
        draw(dst, sr, rng) {
          // A lever ahead of the trigger guard, and a steel box rocking down off its lug.
          clack(dst, sr, rng, 0, { noiseFreq: 2200, base: rng.range(1450, 1650), gain: 0.9, tau: 0.012, body: 230 });
          scrape(dst, sr, rng, 0.02, 0.09, 0.4, 1000, 750);
          const t = rng.range(0.12, 0.14);
          clack(dst, sr, rng, t, { noiseFreq: 1400, base: rng.range(900, 1050), gain: 0.6, tau: 0.03 });
          thud(dst, sr, rng, t, { freq: 260, gain: 0.3, tau: 0.01 });
          cloth(dst, sr, rng, 0.08, 0.3, 0.2, 1000);
        },
      },
      lmg: {
        seconds: 0.5,
        level: 1.15,
        draw(dst, sr, rng) {
          // A hundred-round box off its hook: sheet steel, half a belt of loose links in it, drawn out to the side.
          clack(dst, sr, rng, 0, { noiseFreq: 1700, base: rng.range(900, 1050), gain: 0.8, tau: 0.02, body: 200 });
          scrape(dst, sr, rng, 0.02, 0.14, 0.5, 900, 650);
          rattle(dst, sr, rng, 0.03, 0.3, 9, 0.4, 3600, 6200);
          thud(dst, sr, rng, rng.range(0.2, 0.24), { freq: 240, gain: 0.35, tau: 0.012 });
          cloth(dst, sr, rng, 0.1, 0.3, 0.2, 1000);
        },
      },
      dmr: {
        seconds: 0.4,
        level: 1.05,
        draw(dst, sr, rng) {
          // The paddle pushed forward and a steel magazine rocked off its rear latch, forward and down.
          clack(dst, sr, rng, 0, { noiseFreq: 2400, base: rng.range(1600, 1800), gain: 0.85, tau: 0.01, body: 240 });
          scrape(dst, sr, rng, 0.02, 0.07, 0.4, 1200, 850);
          const t = rng.range(0.1, 0.12);
          clack(dst, sr, rng, t, { noiseFreq: 1600, base: rng.range(1000, 1150), gain: 0.55, tau: 0.022 });
          clink(dst, sr, rng, t + rng.range(0.03, 0.05), rng.range(1500, 1800), 0.3, 0.012);
          cloth(dst, sr, rng, 0.08, 0.26, 0.2, 1100);
        },
      },
      burst: {
        seconds: 0.36,
        level: 0.95,
        draw(dst, sr, rng) {
          // A lever behind the well, and a polymer magazine drawn down out of the stock: a duller slide, no ring to it.
          clack(dst, sr, rng, 0, { noiseFreq: 3000, base: rng.range(2100, 2400), gain: 0.7, tau: 0.005 });
          scrape(dst, sr, rng, 0.012, 0.15, 0.6, 1300, 900);
          thud(dst, sr, rng, rng.range(0.16, 0.19), { freq: 520, gain: 0.35, tau: 0.008 });
          cloth(dst, sr, rng, 0.03, 0.26, 0.3, 1250);
        },
      },
    },
    { local: 0.35, remote: 0.5 },
  );

/** The fresh magazine going home. */
export const magInVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'reloadMagIn',
    {
      m4a1: {
        seconds: 0.35,
        draw(dst, sr, rng) {
          scrape(dst, sr, rng, 0, 0.065, 0.4, 1300, 1700);
          // Solid insert clack.
          const t = rng.range(0.065, 0.075);
          clack(dst, sr, rng, t, { noiseFreq: 1500, base: rng.range(850, 950), gain: 1, tau: 0.025, body: 260 });
          thud(dst, sr, rng, t, { freq: 300, gain: 0.45, tau: 0.008 });
          // Mag catch engaging.
          clack(dst, sr, rng, t + rng.range(0.022, 0.03), { noiseFreq: 4200, base: rng.range(3000, 3400), gain: 0.55, tau: 0.006 });
        },
      },
      smg: {
        seconds: 0.32,
        level: 0.9,
        draw(dst, sr, rng) {
          // The stick runs a long way up the grip before it meets the catch: more slide, a lighter stop.
          scrape(dst, sr, rng, 0, 0.11, 0.55, 1700, 2600);
          const t = rng.range(0.11, 0.12);
          clack(dst, sr, rng, t, { noiseFreq: 2300, base: rng.range(1350, 1550), gain: 1, tau: 0.014, body: 340 });
          clack(dst, sr, rng, t + rng.range(0.014, 0.02), { noiseFreq: 3600, base: rng.range(2500, 2900), gain: 0.5, tau: 0.006 });
        },
      },
      pistol: {
        seconds: 0.24,
        level: 0.8,
        draw(dst, sr, rng) {
          // Into the grip and slapped home with the heel of the hand: a small, quick stop with the palm under it.
          scrape(dst, sr, rng, 0, 0.04, 0.35, 2000, 2700);
          const t = rng.range(0.04, 0.048);
          thud(dst, sr, rng, t, { freq: 640, gain: 0.4, tau: 0.006 });
          clack(dst, sr, rng, t + 0.002, { noiseFreq: 2800, base: rng.range(1750, 1950), gain: 0.9, tau: 0.01 });
          clink(dst, sr, rng, t + rng.range(0.01, 0.014), rng.range(3800, 4300), 0.35, 0.004);
        },
      },
      sniper: {
        seconds: 0.45,
        level: 1.1,
        draw(dst, sr, rng) {
          // Front lug hooked in first, then the box rocked back until the lever takes it: two stops, the second the heavy one.
          clack(dst, sr, rng, 0, { noiseFreq: 1900, base: rng.range(1150, 1300), gain: 0.5, tau: 0.014 });
          scrape(dst, sr, rng, 0.015, 0.08, 0.3, 800, 1100);
          const t = rng.range(0.1, 0.115);
          clack(dst, sr, rng, t, { noiseFreq: 1100, base: rng.range(620, 700), gain: 1, tau: 0.035, body: 190 });
          thud(dst, sr, rng, t, { freq: 220, gain: 0.55, tau: 0.012 });
          clack(dst, sr, rng, t + rng.range(0.03, 0.04), { noiseFreq: 2600, base: rng.range(1700, 1900), gain: 0.45, tau: 0.009 });
        },
      },
      lmg: {
        seconds: 0.6,
        level: 1.15,
        draw(dst, sr, rng) {
          // A full box hung on its hook, and the first links of the belt laid across the feed tray.
          scrape(dst, sr, rng, 0, 0.09, 0.4, 700, 950);
          const t = rng.range(0.09, 0.105);
          clack(dst, sr, rng, t, { noiseFreq: 1300, base: rng.range(700, 800), gain: 1, tau: 0.03, body: 180 });
          thud(dst, sr, rng, t, { freq: 210, gain: 0.5, tau: 0.014 });
          rattle(dst, sr, rng, t + 0.1, 0.3, 8, 0.45, 3800, 6400);
          clink(dst, sr, rng, t + rng.range(0.36, 0.42), rng.range(2900, 3300), 0.4, 0.008);
        },
      },
      dmr: {
        seconds: 0.45,
        level: 1.05,
        draw(dst, sr, rng) {
          // The front lip hooked in, then the magazine rocked back until the latch snaps over it.
          clack(dst, sr, rng, 0, { noiseFreq: 2000, base: rng.range(1250, 1400), gain: 0.5, tau: 0.012 });
          scrape(dst, sr, rng, 0.015, 0.07, 0.3, 900, 1300);
          const t = rng.range(0.085, 0.1);
          clack(dst, sr, rng, t, { noiseFreq: 1300, base: rng.range(760, 860), gain: 1, tau: 0.028, body: 210 });
          thud(dst, sr, rng, t, { freq: 260, gain: 0.45, tau: 0.01 });
          clack(dst, sr, rng, t + rng.range(0.018, 0.026), { noiseFreq: 3000, base: rng.range(2000, 2300), gain: 0.5, tau: 0.008 });
        },
      },
      burst: {
        seconds: 0.32,
        level: 0.95,
        draw(dst, sr, rng) {
          // Up into the stock behind the hand and home with a palm: polymer in polymer, a flat knock and a small catch.
          scrape(dst, sr, rng, 0, 0.075, 0.5, 1000, 1500);
          const t = rng.range(0.075, 0.085);
          thud(dst, sr, rng, t, { freq: 560, gain: 0.5, tau: 0.008 });
          clack(dst, sr, rng, t + 0.002, { noiseFreq: 1900, base: rng.range(1200, 1350), gain: 0.8, tau: 0.01 });
          clack(dst, sr, rng, t + rng.range(0.016, 0.022), { noiseFreq: 3400, base: rng.range(2400, 2700), gain: 0.45, tau: 0.005 });
        },
      },
    },
    { local: 0.4, remote: 0.55 },
  );

/** What lets the action run forward on a fresh magazine: the rifle's bolt catch, the pistol's slide stop, a handle let go. */
export const boltReleaseVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'reloadBoltRelease',
    {
      m4a1: {
        seconds: 0.38,
        draw(dst, sr, rng) {
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
      },
      pistol: {
        seconds: 0.24,
        level: 0.85,
        draw(dst, sr, rng) {
          // The slide stop thumbed down, and a short slide snapping shut on its barrel: lighter and higher than a rifle's carrier, with no buffer behind it.
          clink(dst, sr, rng, 0, rng.range(3600, 4100), 0.4, 0.003);
          const t = rng.range(0.008, 0.011);
          scrape(dst, sr, rng, t, 0.018, 0.4, 3200, 2200);
          const shut = t + 0.018;
          noiseBurst(dst, sr, rng, { at: shut, attack: 0.0001, tau: 0.002, gain: 1.1, mode: 'bandpass', freq: rng.range(3000, 3500), q: 0.8, length: 0.02 });
          const b = rng.range(1750, 1950);
          modes(dst, sr, shut, [b, b * 1.41, b * 2.2, b * 2.9, b * 3.7], [1, 0.6, 0.45, 0.3, 0.18], [0.02, 0.014, 0.01, 0.007, 0.005], 0.5);
          thump(dst, sr, { at: shut, f0: 420, f1: 350, glideTau: 0.006, attack: 0.0003, tau: 0.008, gain: 0.35 });
          const spring = rng.range(1150, 1300);
          thump(dst, sr, { at: shut, f0: spring, f1: spring, glideTau: 1, attack: 0.002, tau: 0.025, gain: 0.08, vibrato: { rate: 45, depth: 0.02 } });
        },
      },
      dmr: {
        seconds: 0.4,
        level: 1.1,
        draw(dst, sr, rng) {
          // The handle drawn the last of the way and let go: a long bolt and its rod thrown home by a spring under the barrel.
          scrape(dst, sr, rng, 0, 0.03, 0.4, 1400, 2000);
          const t = rng.range(0.034, 0.04);
          scrape(dst, sr, rng, t, 0.03, 0.4, 2200, 1300);
          const shut = t + 0.03;
          noiseBurst(dst, sr, rng, { at: shut, attack: 0.0001, tau: 0.0028, gain: 1.2, mode: 'bandpass', freq: rng.range(1600, 1900), q: 0.8, length: 0.03 });
          const b = rng.range(880, 1000);
          modes(dst, sr, shut, [b, b * 1.5, b * 2.26, b * 3.0, b * 3.9], [1, 0.65, 0.45, 0.3, 0.18], [0.045, 0.032, 0.022, 0.014, 0.01], 0.55);
          thump(dst, sr, { at: shut, f0: 250, f1: 200, glideTau: 0.012, attack: 0.0004, tau: 0.018, gain: 0.5 });
          const rod = rng.range(2500, 2900);
          modes(dst, sr, shut, [rod, rod * 2.76], [1, 0.4], [0.06, 0.03], 0.1);
        },
      },
      burst: {
        seconds: 0.3,
        level: 0.95,
        draw(dst, sr, rng) {
          // The knob on the left tapped off its notch: a short carrier shut inside the shell, a knock more than a ring.
          clink(dst, sr, rng, 0, rng.range(3200, 3600), 0.35, 0.003);
          const t = rng.range(0.01, 0.014);
          scrape(dst, sr, rng, t, 0.02, 0.35, 2600, 1700);
          const shut = t + 0.02;
          noiseBurst(dst, sr, rng, { at: shut, attack: 0.0001, tau: 0.002, gain: 1.1, mode: 'bandpass', freq: rng.range(2300, 2700), q: 0.8, length: 0.022 });
          const b = rng.range(1400, 1600);
          modes(dst, sr, shut, [b, b * 1.5, b * 2.2, b * 2.9], [1, 0.55, 0.35, 0.2], [0.014, 0.01, 0.007, 0.005], 0.45);
          const shell = rng.range(620, 700);
          modes(dst, sr, shut, [shell, shell * 1.62], [1, 0.5], [0.02, 0.012], 0.4);
        },
      },
    },
    { local: 0.45, remote: 0.6 },
  );

/** Racking the action by hand: the rifle's charging handle, the SMG's light bolt on its side handle. */
export const chargingHandleVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'reloadChargingHandle',
    {
      m4a1: {
        seconds: 0.5,
        draw(dst, sr, rng) {
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
      },
      smg: {
        seconds: 0.34,
        level: 0.9,
        draw(dst, sr, rng) {
          // A short, light bolt on a side handle: a quick pull against a stiff spring, and it flies home with a slap and a zing.
          scrape(dst, sr, rng, 0, 0.07, 0.6, 1700, 3400);
          clack(dst, sr, rng, rng.range(0.07, 0.078), { noiseFreq: 2600, base: rng.range(1900, 2150), gain: 0.7, tau: 0.009 });
          const r = rng.range(0.13, 0.15);
          scrape(dst, sr, rng, r, 0.02, 0.3, 3000, 2000);
          clack(dst, sr, rng, r + 0.02, { noiseFreq: 2700, base: rng.range(1500, 1700), gain: 1, tau: 0.016, body: 320 });
          const spring = rng.range(950, 1050);
          thump(dst, sr, { at: r + 0.02, f0: spring, f1: spring, glideTau: 1, attack: 0.003, tau: 0.04, gain: 0.12, vibrato: { rate: 38, depth: 0.03 } });
        },
      },
      lmg: {
        seconds: 0.62,
        level: 1.2,
        draw(dst, sr, rng) {
          // A long pull against two springs until the sear takes the bolt, then the handle shoved forward again.
          clink(dst, sr, rng, 0, rng.range(2000, 2300), 0.4, 0.006);
          scrape(dst, sr, rng, 0.006, 0.18, 0.65, 700, 1700);
          clack(dst, sr, rng, rng.range(0.185, 0.2), { noiseFreq: 1300, base: rng.range(760, 860), gain: 1, tau: 0.03, body: 180 });
          const r = rng.range(0.3, 0.33);
          scrape(dst, sr, rng, r, 0.09, 0.4, 1500, 900);
          clack(dst, sr, rng, r + 0.095, { noiseFreq: 1900, base: rng.range(1200, 1350), gain: 0.75, tau: 0.016 });
        },
      },
    },
    { local: 0.45, remote: 0.6 },
  );

/** Bringing the gun up: its weight and what hangs off it. */
export const weaponRaiseVoice = (): Voice & VoiceExtras =>
  perWeapon(
    'weaponRaise',
    {
      m4a1: {
        seconds: 0.42,
        draw(dst, sr, rng) {
          cloth(dst, sr, rng, 0, 0.3, 0.8, 1300);
          rattle(dst, sr, rng, 0.01, 0.25, 6, 0.45, 1800, 3500);
          thud(dst, sr, rng, rng.range(0.18, 0.22), { freq: 400, gain: 0.35, tau: 0.008 });
        },
      },
      smg: {
        seconds: 0.32,
        level: 0.85,
        draw(dst, sr, rng) {
          // Small and light: up quickly, a thin rattle, hardly a thud.
          cloth(dst, sr, rng, 0, 0.22, 0.8, 1500);
          rattle(dst, sr, rng, 0.01, 0.17, 5, 0.4, 2400, 4400);
          thud(dst, sr, rng, rng.range(0.12, 0.15), { freq: 560, gain: 0.22, tau: 0.006 });
        },
      },
      pistol: {
        seconds: 0.26,
        level: 0.7,
        draw(dst, sr, rng) {
          // Out of a holster: the retention letting go, the slide dragging along the shell, a hand closing on the grip.
          clack(dst, sr, rng, 0, { noiseFreq: 2400, base: rng.range(1500, 1700), gain: 0.5, tau: 0.006 });
          scrape(dst, sr, rng, 0.01, 0.09, 0.6, 1500, 2700);
          cloth(dst, sr, rng, 0.03, 0.16, 0.5, 1600);
          thud(dst, sr, rng, rng.range(0.13, 0.16), { freq: 600, gain: 0.2, tau: 0.005 });
        },
      },
      shotgun: {
        seconds: 0.46,
        level: 1.05,
        draw(dst, sr, rng) {
          // A long gun with a loose fore-end: it knocks on its rails as it comes up, and lands heavy in the shoulder.
          cloth(dst, sr, rng, 0, 0.34, 0.8, 1050);
          rattle(dst, sr, rng, 0.02, 0.24, 3, 0.35, 1300, 2400);
          clack(dst, sr, rng, rng.range(0.09, 0.13), { noiseFreq: 1300, base: rng.range(760, 860), gain: 0.4, tau: 0.018 });
          thud(dst, sr, rng, rng.range(0.22, 0.26), { freq: 300, gain: 0.55, tau: 0.011 });
        },
      },
      sniper: {
        seconds: 0.55,
        level: 1.1,
        draw(dst, sr, rng) {
          // The heaviest thing carried: slow up, the sling swivels ticking, and a deep settle against the shoulder.
          cloth(dst, sr, rng, 0, 0.44, 0.8, 900);
          rattle(dst, sr, rng, 0.03, 0.34, 5, 0.4, 1400, 2600);
          thud(dst, sr, rng, rng.range(0.28, 0.33), { freq: 240, gain: 0.6, tau: 0.014 });
          clink(dst, sr, rng, rng.range(0.36, 0.4), rng.range(1100, 1300), 0.2, 0.012);
        },
      },
      lmg: {
        seconds: 0.7,
        level: 1.2,
        draw(dst, sr, rng) {
          // Ten kilos and a belt: hauled up slowly, the links chattering in the box, the bipod knocking, a heavy settle.
          cloth(dst, sr, rng, 0, 0.55, 0.8, 850);
          rattle(dst, sr, rng, 0.04, 0.45, 10, 0.45, 3600, 6200);
          clack(dst, sr, rng, rng.range(0.14, 0.2), { noiseFreq: 1200, base: rng.range(640, 720), gain: 0.45, tau: 0.02 });
          thud(dst, sr, rng, rng.range(0.4, 0.46), { freq: 210, gain: 0.7, tau: 0.016 });
          clink(dst, sr, rng, rng.range(0.5, 0.55), rng.range(1000, 1200), 0.2, 0.014);
        },
      },
      dmr: {
        seconds: 0.5,
        level: 1.05,
        draw(dst, sr, rng) {
          // A long rifle in wood: little to rattle but the sling swivels, and a dull knock as the stock finds the shoulder.
          cloth(dst, sr, rng, 0, 0.38, 0.8, 950);
          rattle(dst, sr, rng, 0.04, 0.26, 3, 0.35, 1300, 2200);
          thud(dst, sr, rng, rng.range(0.25, 0.3), { freq: 270, gain: 0.6, tau: 0.013 });
          thud(dst, sr, rng, rng.range(0.32, 0.36), { freq: 520, gain: 0.2, tau: 0.006 });
        },
      },
      burst: {
        seconds: 0.36,
        level: 0.9,
        draw(dst, sr, rng) {
          // Short and all of a piece: turned in against the chest, a hollow tap on the shell, nothing loose.
          cloth(dst, sr, rng, 0, 0.26, 0.85, 1350);
          rattle(dst, sr, rng, 0.02, 0.16, 2, 0.25, 2000, 3200);
          const shell = rng.range(600, 680);
          thump(dst, sr, { at: rng.range(0.15, 0.19), f0: shell, f1: shell * 0.9, glideTau: 0.012, attack: 0.001, tau: 0.016, gain: 0.3 });
          thud(dst, sr, rng, rng.range(0.2, 0.23), { freq: 430, gain: 0.3, tau: 0.008 });
        },
      },
      revolver: {
        seconds: 0.3,
        level: 0.8,
        draw(dst, sr, rng) {
          // Out of leather: a strap thumbed off, a long barrel dragged clear, and the cylinder ticking a little on its hand.
          clack(dst, sr, rng, 0, { noiseFreq: 1800, base: rng.range(1100, 1250), gain: 0.4, tau: 0.006 });
          scrape(dst, sr, rng, 0.012, 0.11, 0.6, 900, 1700);
          cloth(dst, sr, rng, 0.02, 0.18, 0.5, 1100);
          clink(dst, sr, rng, rng.range(0.14, 0.17), rng.range(2500, 2800), 0.25, 0.005);
          thud(dst, sr, rng, rng.range(0.17, 0.2), { freq: 520, gain: 0.25, tau: 0.006 });
        },
      },
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
