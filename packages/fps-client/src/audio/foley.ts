/** Body foley: footsteps per material and movement, jump, land, slide, mantle, prone, crouch. */
import { bp, buffer, crackle, finish, hp, lp, mix, modes, noiseBurst, normalize, scatter, shape, thump, white, wobble, type Rng } from './dsp';
import { cloth, rattle, thud } from './parts';
import { synthVoice, unit } from './synth-voice';
import type { SurfaceMaterial, Voice, VoiceExtras, VoiceParams } from './types';

const MATERIALS: readonly SurfaceMaterial[] = ['concrete', 'metal', 'wood', 'dirt', 'grass', 'glass', 'plaster'];

/** One foot contact (heel or toe) on a surface. `hard` = sprint strike, else walk/crouch. */
function contact(dst: Float32Array, sr: number, rng: Rng, at: number, material: SurfaceMaterial, hard: boolean, amp: number): void {
  const h = hard ? 1 : 0.6;
  switch (material) {
    case 'concrete': {
      noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.0012, gain: amp * 0.6 * h, mode: 'highpass', freq: 2200, length: 0.01 });
      noiseBurst(dst, sr, rng, { at, attack: 0.0005, tau: hard ? 0.01 : 0.013, gain: amp, mode: 'bandpass', freq: rng.range(350, 480), q: 1 });
      // Scuff / grit of the sole dragging.
      noiseBurst(dst, sr, rng, { at: at + 0.004, attack: 0.008, tau: hard ? 0.02 : 0.03, gain: amp * 0.25, mode: 'bandpass', freq: rng.range(2200, 3000), q: 0.6 });
      const g = crackle(sr, 0.08, rng, hard ? 500 : 250, (t) => Math.exp(-t / 0.025));
      hp(g, sr, 2500);
      normalize(g, 1);
      mix(dst, g, sr, at, amp * 0.18);
      break;
    }
    case 'metal': {
      noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.001, gain: amp * 0.5 * h, mode: 'highpass', freq: 3000, length: 0.008 });
      noiseBurst(dst, sr, rng, { at, attack: 0.0005, tau: 0.01, gain: amp * 0.8, mode: 'bandpass', freq: rng.range(260, 340), q: 1 });
      const b = rng.range(380, 460);
      modes(dst, sr, at, [b, b * 2.32, b * 3.8, b * 5.1, b * 6.9], [0.5, 0.35, 0.3, 0.2, 0.15], [0.12, 0.09, 0.06, 0.04, 0.03], amp * 0.6 * h);
      break;
    }
    case 'wood': {
      const b = rng.range(165, 200);
      modes(dst, sr, at, [b, b * 1.9, b * 2.7], [1, 0.5, 0.3], [0.03, 0.02, 0.015], amp * 0.7);
      noiseBurst(dst, sr, rng, { at, attack: 0.0003, tau: 0.008, gain: amp * 0.6, mode: 'bandpass', freq: rng.range(550, 700), q: 2 });
      thump(dst, sr, { at, f0: 130, f1: 105, glideTau: 0.01, attack: 0.001, tau: 0.025, gain: amp * 0.5 });
      noiseBurst(dst, sr, rng, { at, attack: 0.0001, tau: 0.0009, gain: amp * 0.35 * h, mode: 'highpass', freq: 2500, length: 0.008 });
      break;
    }
    case 'dirt':
    case 'grass': {
      const grass = material === 'grass';
      const c = crackle(sr, 0.14, rng, grass ? 1800 : 2600, (t) => (t < 0.005 ? t / 0.005 : Math.exp(-(t - 0.005) / (hard ? 0.03 : 0.04))));
      bp(c, sr, grass ? 3200 : rng.range(1500, 2600), 0.7);
      if (grass) lp(c, sr, 5000);
      normalize(c, 1);
      mix(dst, c, sr, at, amp * (grass ? 0.55 : 0.75));
      noiseBurst(dst, sr, rng, { at, attack: 0.002, tau: 0.015, gain: amp * 0.6, mode: 'lowpass', freq: 260, steep: true });
      if (grass) noiseBurst(dst, sr, rng, { at, attack: 0.015, tau: 0.04, gain: amp * 0.45, mode: 'bandpass', freq: 3500, q: 0.5 });
      break;
    }
    case 'glass': {
      noiseBurst(dst, sr, rng, { at, attack: 0.0005, tau: 0.01, gain: amp * 0.6, mode: 'bandpass', freq: 420, q: 1 });
      const c = crackle(sr, 0.12, rng, 3500, (t) => Math.exp(-t / 0.03));
      hp(c, sr, 3000);
      normalize(c, 1);
      mix(dst, c, sr, at, amp * 0.6);
      for (const t of scatter(rng, hard ? 7 : 4, 0, 0.06, 1.5)) {
        const f = rng.range(3000, 7000);
        modes(dst, sr, at + t, [f, f * 1.41, f * 2.03], [1, 0.5, 0.3], [rng.range(0.015, 0.04), 0.012, 0.008], amp * rng.range(0.1, 0.25));
      }
      break;
    }
    case 'plaster': {
      noiseBurst(dst, sr, rng, { at, attack: 0.0006, tau: 0.015, gain: amp, mode: 'bandpass', freq: rng.range(220, 290), q: 0.8 });
      noiseBurst(dst, sr, rng, { at, attack: 0.0003, tau: 0.003, gain: amp * 0.4 * h, mode: 'lowpass', freq: 1500 });
      const g = crackle(sr, 0.08, rng, 400, (t) => Math.exp(-t / 0.03));
      lp(g, sr, 2500);
      normalize(g, 1);
      mix(dst, g, sr, at, amp * 0.2);
      break;
    }
  }
}

function renderStep(material: SurfaceMaterial, hard: boolean, rng: Rng, sr: number): Float32Array[] {
  const dst = buffer(sr, material === 'metal' ? 0.5 : 0.3);
  const gap = hard ? rng.range(0.025, 0.04) : rng.range(0.045, 0.07);
  contact(dst, sr, rng, 0, material, hard, 1);
  contact(dst, sr, rng, gap, material, hard, rng.range(0.45, 0.7));
  if (hard) rattle(dst, sr, rng, 0.004, 0.05, 2, 0.06); // gear jostle on a sprint stride
  if (!hard) lp(dst, sr, 5500);
  return [finish(dst, sr)];
}

/** Prone crawl: a slow fabric drag with a little ground grit and gear clinks. */
function renderProneStep(rng: Rng, sr: number): Float32Array[] {
  const dur = 0.5;
  const dst = buffer(sr, dur + 0.05);
  const n = white(sr, dur, rng);
  bp(n, sr, (t) => 900 + 500 * Math.sin((t / dur) * Math.PI), 0.45);
  const wob = wobble(rng, dur, 0.06, 0.4);
  const scratch = wobble(rng, dur, 0.008, 0.7);
  shape(n, sr, (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.5 * wob(t) * Math.max(0, scratch(t)));
  normalize(n, 1);
  mix(dst, n, sr, 0, 1);
  const g = crackle(sr, dur, rng, 300, (t) => Math.sin(Math.PI * Math.min(1, t / dur)));
  bp(g, sr, 2200, 0.7);
  normalize(g, 1);
  mix(dst, g, sr, 0, 0.25);
  rattle(dst, sr, rng, 0.1, 0.3, 2, 0.12);
  return [finish(dst, sr)];
}

const FOOTSTEP_GAIN = {
  local: { walk: 0.16, sprint: 0.24, tacticalSprint: 0.28, crouch: 0.07, prone: 0.12 },
  remote: { walk: 0.55, sprint: 0.75, tacticalSprint: 0.85, crouch: 0.22, prone: 0.3 },
} as const;

export function footstepVoice(): Voice & VoiceExtras {
  const keys: string[] = ['prone'];
  for (const m of MATERIALS) keys.push(`${m}/hard`, `${m}/soft`);
  return synthVoice({
    id: 'footstep',
    variants: 5,
    keys,
    key(p: VoiceParams) {
      const mv = p.movement ?? 'walk';
      if (mv === 'prone') return 'prone';
      const hard = mv === 'sprint' || mv === 'tacticalSprint';
      return `${p.material ?? 'concrete'}/${hard ? 'hard' : 'soft'}`;
    },
    render(key, rng, sr) {
      if (key === 'prone') return renderProneStep(rng, sr);
      const [material, hardness] = key.split('/');
      return renderStep((material ?? 'concrete') as SurfaceMaterial, hardness === 'hard', rng, sr);
    },
    gain(p) {
      const mv = p.movement ?? 'walk';
      const table = p.local === true || p.position === undefined ? FOOTSTEP_GAIN.local : FOOTSTEP_GAIN.remote;
      return table[mv] * (p.intensity === undefined ? 1 : 0.5 + unit(p.intensity, 1) * 0.5);
    },
    rate(p) {
      return p.movement === 'tacticalSprint' ? 1.04 : p.movement === 'crouch' ? 0.96 : 1;
    },
    lowpass(p) {
      return p.movement === 'crouch' ? 2500 : undefined;
    },
    rateJitter: 0.05,
    gainJitterDb: 1.5,
    duration: 0.55,
  });
}

export function jumpVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'jump',
    variants: 4,
    keys: ['jump'],
    key: () => 'jump',
    render(_key, rng, sr) {
      const dst = buffer(sr, 0.35);
      cloth(dst, sr, rng, 0, 0.22, 1, 1500);
      rattle(dst, sr, rng, 0.01, 0.13, 4, 0.35);
      thud(dst, sr, rng, 0, { freq: 300, gain: 0.45, tau: 0.01 });
      return [finish(dst, sr)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.22 : 0.5),
    rateJitter: 0.04,
    gainJitterDb: 1,
    duration: 0.35,
  });
}

export function landVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'land',
    variants: 4,
    keys: ['soft', 'hard'],
    key: (p) => (unit(p.intensity, 0.5) < 0.45 ? 'soft' : 'hard'),
    render(key, rng, sr) {
      const hard = key === 'hard';
      const dst = buffer(sr, 0.45);
      thud(dst, sr, rng, 0, { freq: hard ? 160 : 220, gain: 1, tau: hard ? 0.05 : 0.03, pitch: hard ? 55 : 75 });
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.0002, tau: 0.004, gain: 0.35, mode: 'bandpass', freq: 1500, q: 0.8 });
      noiseBurst(dst, sr, rng, { at: 0.012, attack: 0.002, tau: 0.02, gain: 0.3, mode: 'bandpass', freq: 2600, q: 0.6 });
      rattle(dst, sr, rng, 0.005, hard ? 0.2 : 0.12, hard ? 7 : 4, hard ? 0.4 : 0.3);
      cloth(dst, sr, rng, 0, 0.18, 0.35, 1300);
      return [finish(dst, sr)];
    },
    gain(p) {
      const i = unit(p.intensity, 0.5);
      return (p.local === true || p.position === undefined ? 0.2 : 0.55) * (0.45 + 0.55 * i);
    },
    rate: (p) => 1.05 - 0.1 * unit(p.intensity, 0.5),
    rateJitter: 0.03,
    gainJitterDb: 1,
    duration: 0.5,
  });
}

export function slideVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'slide',
    variants: 3,
    keys: ['slide'],
    key: () => 'slide',
    render(_key, rng, sr) {
      const dur = 0.65;
      const dst = buffer(sr, dur + 0.1);
      // Friction swoosh: band sweeps down as the slide slows.
      const n = white(sr, dur, rng);
      bp(n, sr, (t) => 900 + 1700 * Math.exp(-t / 0.25), 0.6);
      const wob = wobble(rng, dur, 0.01, 0.35);
      shape(n, sr, (t) => (t < 0.04 ? t / 0.04 : Math.max(0, 1 - ((t - 0.04) / (dur - 0.04)) ** 1.6)) * wob(t));
      normalize(n, 1);
      mix(dst, n, sr, 0, 1);
      // Ground grit, thinning out.
      const g = crackle(sr, dur, rng, 1800, (t) => Math.max(0, 1 - t / dur));
      lp(g, sr, 4000);
      hp(g, sr, 700);
      normalize(g, 1);
      mix(dst, g, sr, 0, 0.35);
      // Body rumble and the initial drop.
      noiseBurst(dst, sr, rng, { at: 0, attack: 0.03, tau: 0.25, gain: 0.35, mode: 'lowpass', freq: 200, steep: true, length: dur });
      thud(dst, sr, rng, 0, { freq: 220, gain: 0.5, tau: 0.025 });
      rattle(dst, sr, rng, 0.005, 0.15, 4, 0.25);
      cloth(dst, sr, rng, 0, 0.3, 0.4, 1600);
      return [finish(dst, sr)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.3 : 0.65),
    rateJitter: 0.04,
    gainJitterDb: 1,
    duration: 0.75,
  });
}

export function mantleVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'mantle',
    variants: 3,
    keys: ['mantle'],
    key: () => 'mantle',
    render(_key, rng, sr) {
      const dst = buffer(sr, 0.45);
      const slap = (at: number, g: number): void => {
        noiseBurst(dst, sr, rng, { at, attack: 0.0002, tau: 0.006, gain: g, mode: 'bandpass', freq: rng.range(1000, 1400), q: 0.7 });
        thump(dst, sr, { at, f0: 230, f1: 190, glideTau: 0.01, attack: 0.0008, tau: 0.01, gain: g * 0.6 });
      };
      slap(0, 1);
      slap(rng.range(0.07, 0.11), 0.7);
      cloth(dst, sr, rng, 0.02, 0.3, 0.6, 1400);
      rattle(dst, sr, rng, 0.08, 0.2, 4, 0.3);
      return [finish(dst, sr)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.25 : 0.55),
    rateJitter: 0.04,
    gainJitterDb: 1,
    duration: 0.45,
  });
}

export function proneVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'prone',
    variants: 3,
    keys: ['prone'],
    key: () => 'prone',
    render(_key, rng, sr) {
      const dst = buffer(sr, 0.55);
      thud(dst, sr, rng, 0, { freq: 180, gain: 1, tau: 0.04, pitch: 60 });
      thud(dst, sr, rng, rng.range(0.1, 0.14), { freq: 260, gain: 0.5, tau: 0.02 });
      cloth(dst, sr, rng, 0, 0.42, 0.55, 1200);
      rattle(dst, sr, rng, 0.01, 0.25, 6, 0.35);
      return [finish(dst, sr)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.25 : 0.5),
    rateJitter: 0.03,
    gainJitterDb: 1,
    duration: 0.55,
  });
}

export function crouchVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'crouch',
    variants: 4,
    keys: ['crouch'],
    key: () => 'crouch',
    render(_key, rng, sr) {
      const dst = buffer(sr, 0.25);
      cloth(dst, sr, rng, 0, 0.18, 1, 1300);
      rattle(dst, sr, rng, 0.03, 0.1, 2, 0.25);
      return [finish(dst, sr)];
    },
    gain: (p) => (p.local === true || p.position === undefined ? 0.12 : 0.3),
    rateJitter: 0.05,
    gainJitterDb: 1.5,
    duration: 0.25,
  });
}
