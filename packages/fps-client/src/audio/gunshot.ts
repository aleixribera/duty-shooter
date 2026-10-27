/**
 * The M4A1 gunshot. Rendered offline per AudioContext into round-robin banks, then layered per
 * shot. The environment tail (layer 4) is not in these buffers: the sound system sends the dry
 * shot into a shared ConvolverNode (outdoor or indoor impulse response), so 13 shots a second
 * cost one buffer source per layer, not a convolver each.
 *
 *   core  = (1) transient crack: N-wave front + high-passed noise snap (~3 ms) + sizzle
 *           + mid "bang" (band-passed noise ~20 ms) + handguard resonance
 *           + (2) low body: falling sine 120 -> 45 Hz (~100 ms) + low-passed noise boom (+ sub for
 *           the local gun), all glued with tanh saturation like a hot recording,
 *           plus a ground reflection (and L/R decorrelated air for the stereo local version)
 *   mech  = (3) bolt carrier: unlock clack (~8 ms), lock clack (~50 ms), buffer spring ring,
 *           receiver ring. Only audible for the local gun and very close shooters.
 *   far   = what a shot sounds like past ~60 m: smeared front, dull pop, rumble, terrain echoes.
 */
import {
  buffer,
  fadeEdges,
  hp,
  lp,
  mix,
  modes,
  noiseBurst,
  peak,
  saturate,
  thump,
  type Rng,
} from './dsp';
import { kitFor } from './kit';
import { dbToGain, jit, cleanupOnEnd } from './synth-voice';
import type { WeaponId } from '@duty-shooter/fps-core';
import type { SoundParams, Voice, VoiceExtras, VoiceParams } from './types';

const LOCAL = 'gunshot/local';
const NEAR = 'gunshot/near';
const FAR = 'gunshot/far';
const MECH = 'gunshot/mech';
const LOCAL_VARIANTS = 8;
const NEAR_VARIANTS = 6;
const FAR_VARIANTS = 4;
const MECH_VARIANTS = 6;

/** Peak target of every rendered layer: -6 dBFS. */
const PEAK = 0.5;

function finishChannels(chs: Float32Array[], sr: number, hpHz: number): Float32Array[] {
  let m = 0;
  for (const ch of chs) {
    hp(ch, sr, hpHz);
    fadeEdges(ch, sr, 0, 0.04);
    m = Math.max(m, peak(ch));
  }
  if (m > 1e-9) for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] ?? 0) * (PEAK / m);
  return chs;
}

function renderCore(rng: Rng, sr: number, local: boolean): Float32Array[] {
  const len = 0.42;
  const dry = buffer(sr, len);

  // (1) Transient. The muzzle blast's N-wave: instant rise, linear fall through zero, ~0.8 ms.
  const nN = Math.round(rng.range(0.0006, 0.0009) * sr);
  for (let i = 0; i < nN; i++) dry[i] = (dry[i] ?? 0) + 1.1 * (1 - (2 * i) / nN);
  // Snap: very short, steep high-passed noise.
  noiseBurst(dry, sr, rng, { at: 0, attack: 0.0001, tau: rng.range(0.0018, 0.0028), gain: 0.9, mode: 'highpass', freq: rng.range(1600, 2200), steep: true, length: 0.02 });
  // Sizzle on top of the snap.
  noiseBurst(dry, sr, rng, { at: 0.0005, attack: 0.0003, tau: rng.range(0.005, 0.008), gain: 0.35, mode: 'bandpass', freq: rng.range(4500, 6000), q: 0.9, length: 0.05 });
  // Mid bang: where a real gunshot recording carries most of its energy.
  noiseBurst(dry, sr, rng, { at: 0, attack: 0.0004, tau: rng.range(0.018, 0.026), gain: 1.15, mode: 'bandpass', freq: rng.range(550, 850), q: 0.8, length: 0.16 });
  noiseBurst(dry, sr, rng, { at: 0, attack: 0.0002, tau: rng.range(0.009, 0.013), gain: 0.55, mode: 'bandpass', freq: rng.range(1500, 2100), q: 1.0, length: 0.08 });
  // Handguard / barrel resonance.
  thump(dry, sr, { at: 0, f0: rng.range(240, 280), f1: rng.range(170, 200), glideTau: 0.01, attack: 0.0005, tau: 0.018, gain: 0.3 });

  // (2) Body: pitched-down boom with a fast pitch drop.
  thump(dry, sr, {
    at: 0.0005,
    f0: rng.range(110, 128),
    f1: rng.range(44, 52),
    glideTau: rng.range(0.02, 0.03),
    attack: 0.0015,
    tau: local ? 0.055 : 0.042,
    gain: local ? 0.85 : 0.7,
  });
  noiseBurst(dry, sr, rng, { at: 0.001, attack: 0.003, tau: local ? 0.07 : 0.055, gain: local ? 0.55 : 0.45, mode: 'lowpass', freq: 170, steep: true, length: 0.35 });
  if (local) thump(dry, sr, { at: 0.001, f0: 62, f1: 36, glideTau: 0.04, attack: 0.002, tau: 0.09, gain: 0.35 });

  // Glue: soft saturation compresses the layers into one dense, loud event.
  saturate(dry, 2.2);

  const channels = local ? 2 : 1;
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = Float32Array.from(dry);
    // Ground reflection a few ms later, darker.
    const refl = Float32Array.from(dry);
    lp(refl, sr, 3500);
    mix(ch, refl, sr, c === 0 ? 0.0046 : 0.0063, local ? 0.28 : 0.32);
    if (local) {
      // Decorrelated air so the first-person shot has width without smearing the transient.
      noiseBurst(ch, sr, rng, { at: 0.002, attack: 0.002, tau: 0.03, gain: 0.12, mode: 'bandpass', freq: rng.range(800, 1200), q: 0.6, length: 0.2 });
    }
    out.push(ch);
  }
  return finishChannels(out, sr, 28);
}

function renderFar(rng: Rng, sr: number): Float32Array[] {
  const dry = buffer(sr, 0.65);
  const nN = Math.round(0.0013 * sr);
  for (let i = 0; i < nN; i++) dry[i] = (dry[i] ?? 0) + 0.8 * (1 - (2 * i) / nN);
  noiseBurst(dry, sr, rng, { at: 0, attack: 0.002, tau: rng.range(0.03, 0.04), gain: 1, mode: 'bandpass', freq: rng.range(350, 500), q: 0.7, length: 0.25 });
  thump(dry, sr, { at: 0.001, f0: rng.range(80, 92), f1: 45, glideTau: 0.03, attack: 0.003, tau: 0.06, gain: 0.8 });
  noiseBurst(dry, sr, rng, { at: 0.005, attack: 0.012, tau: rng.range(0.14, 0.18), gain: 0.5, mode: 'lowpass', freq: 260, steep: true, length: 0.6 });
  const echoes = Float32Array.from(dry);
  lp(echoes, sr, 1200);
  for (let i = 0; i < 3; i++) mix(dry, echoes, sr, rng.range(0.015, 0.07), rng.range(0.2, 0.38));
  lp(dry, sr, 2200);
  saturate(dry, 1.4);
  return finishChannels([dry], sr, 30);
}

function renderMech(rng: Rng, sr: number): Float32Array[] {
  const m = buffer(sr, 0.16);
  // Bolt unlock / carrier rearward.
  const t1 = rng.range(0.006, 0.01);
  noiseBurst(m, sr, rng, { at: t1, attack: 0.0001, tau: 0.0012, gain: 0.8, mode: 'bandpass', freq: rng.range(2800, 3600), q: 1.2, length: 0.012 });
  const b1 = rng.range(2100, 2600);
  modes(m, sr, t1, [b1, b1 * 1.47, b1 * 2.09, b1 * 2.56, b1 * 3.3], [1, 0.6, 0.5, 0.35, 0.25], [0.01, 0.007, 0.006, 0.004, 0.003], 0.45);
  // Bolt forward and locking: heavier.
  const t2 = rng.range(0.048, 0.058);
  noiseBurst(m, sr, rng, { at: t2, attack: 0.0001, tau: 0.002, gain: 1, mode: 'bandpass', freq: rng.range(1600, 2000), q: 0.9, length: 0.02 });
  const b2 = rng.range(1250, 1550);
  modes(m, sr, t2, [b2, b2 * 1.52, b2 * 2.21, b2 * 3.07], [1, 0.55, 0.4, 0.25], [0.014, 0.009, 0.006, 0.004], 0.5);
  thump(m, sr, { at: t2, f0: 340, f1: 300, glideTau: 0.01, attack: 0.0003, tau: 0.006, gain: 0.35 });
  // AR buffer spring "boing" and receiver ring.
  const spring = rng.range(680, 760);
  thump(m, sr, { at: t1, f0: spring, f1: spring, glideTau: 1, attack: 0.004, tau: 0.028, gain: 0.12, vibrato: { rate: 33, depth: 0.025 } });
  const b3 = rng.range(2800, 3200);
  modes(m, sr, 0, [b3, b3 * 1.37, b3 * 1.93], [1, 0.6, 0.4], [0.035, 0.025, 0.015], 0.12);
  return finishChannels([m], sr, 200);
}

const render = {
  local: (rng: Rng, sr: number) => renderCore(rng, sr, true),
  near: (rng: Rng, sr: number) => renderCore(rng, sr, false),
  far: (rng: Rng, sr: number) => renderFar(rng, sr),
  mech: (rng: Rng, sr: number) => renderMech(rng, sr),
};

/** Distance (m) where the near/far banks cross-fade. */
/**
 * How each gun differs from the M4A1's recording: its pitch and length
 * (playback rate), loudness, brightness, how much of the action is heard,
 * and extra low end for the big bores.
 */
const CHARACTER: Readonly<Record<WeaponId, { rate: number; gain: number; tone: number; mech: number; boom: number }>> = {
  m4a1: { rate: 1, gain: 1, tone: 0, mech: 1, boom: 0 },
  smg: { rate: 1.22, gain: 0.72, tone: 1.5, mech: 1.3, boom: 0 },
  pistol: { rate: 1.3, gain: 0.68, tone: 2, mech: 0.6, boom: 0 },
  shotgun: { rate: 0.74, gain: 1.15, tone: -3, mech: 0.4, boom: 0.6 },
  sniper: { rate: 0.8, gain: 1.25, tone: -1, mech: 0.3, boom: 0.4 },
};

const FAR_START = 40;
const FAR_FULL = 110;

export function gunshotVoice(): Voice & VoiceExtras {
  return {
    duration: 0.75,
    warm(ctx: BaseAudioContext) {
      for (const task of this.warmTasks?.(ctx) ?? []) task();
    },
    /** First task (your own gun) is the one the sound system runs synchronously at unlock. */
    warmTasks(ctx: BaseAudioContext) {
      const kit = kitFor(ctx);
      return [
        () => {
          kit.bank(LOCAL, LOCAL_VARIANTS, render.local);
          kit.bank(MECH, MECH_VARIANTS, render.mech);
        },
        () => void kit.bank(NEAR, NEAR_VARIANTS, render.near),
        () => void kit.bank(FAR, FAR_VARIANTS, render.far),
      ];
    },
    play(ctx: AudioContext, out: AudioNode, params: SoundParams, startTime: number) {
      const p = params as VoiceParams;
      const kit = kitFor(ctx);
      const t = Math.max(startTime, ctx.currentTime);
      // Per-shot jitter shared by every layer of this shot so they stay phase-locked.
      const character = CHARACTER[p.weapon ?? 'm4a1'];
      const rate = character.rate * (1 + jit(0.02));
      const shotGain = dbToGain(jit(1)) * character.gain;

      // One tone filter per shot: random high-shelf tilt so consecutive shots differ in colour.
      const tone = ctx.createBiquadFilter();
      tone.type = 'highshelf';
      tone.frequency.value = 2800;
      tone.gain.value = -2.5 + Math.random() * 3.5 + character.tone;
      const bus = ctx.createGain();
      bus.gain.value = shotGain;
      tone.connect(bus).connect(out);

      const layers: Array<{ buffer: AudioBuffer; gain: number; delay: number; rate?: number }> = [];
      const local = p.local === true || p.distance === undefined;
      if (local) {
        layers.push({ buffer: kit.pick(LOCAL, LOCAL_VARIANTS, render.local), gain: 1, delay: 0 });
        layers.push({ buffer: kit.pick(MECH, MECH_VARIANTS, render.mech), gain: 0.3 * character.mech, delay: Math.random() * 0.003 });
        // The big bores: the same shot an octave down under it.
        if (character.boom > 0) layers.push({ buffer: kit.pick(LOCAL, LOCAL_VARIANTS, render.local), gain: character.boom, delay: 0, rate: 0.5 });
      } else {
        const d = p.distance ?? 0;
        const w = Math.min(1, Math.max(0, (d - FAR_START) / (FAR_FULL - FAR_START)));
        const nearGain = Math.cos((w * Math.PI) / 2);
        const farGain = Math.sin((w * Math.PI) / 2);
        if (nearGain > 0.01) layers.push({ buffer: kit.pick(NEAR, NEAR_VARIANTS, render.near), gain: 0.85 * nearGain, delay: 0 });
        if (farGain > 0.01) layers.push({ buffer: kit.pick(FAR, FAR_VARIANTS, render.far), gain: 0.85 * farGain, delay: 0 });
        if (d < 12) layers.push({ buffer: kit.pick(MECH, MECH_VARIANTS, render.mech), gain: 0.14 * (1 - d / 12) * character.mech, delay: 0 });
        if (character.boom > 0 && nearGain > 0.01) layers.push({ buffer: kit.pick(NEAR, NEAR_VARIANTS, render.near), gain: character.boom * nearGain * 0.8, delay: 0, rate: 0.5 });
      }

      let remaining = layers.length;
      const releaseBus = (): void => {
        remaining--;
        if (remaining <= 0) {
          tone.disconnect();
          bus.disconnect();
        }
      };
      for (const layer of layers) {
        const src = ctx.createBufferSource();
        src.buffer = layer.buffer;
        src.playbackRate.value = rate * (layer.rate ?? 1);
        const g = ctx.createGain();
        g.gain.value = layer.gain;
        src.connect(g).connect(tone);
        cleanupOnEnd(src, [src, g]);
        const inner = src.onended;
        src.onended = (ev) => {
          inner?.call(src, ev);
          releaseBus();
        };
        src.start(t + layer.delay);
      }
      if (layers.length === 0) releaseBus();
    },
  };
}

