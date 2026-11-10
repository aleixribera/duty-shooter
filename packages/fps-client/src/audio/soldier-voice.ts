/**
 * A soldier's own voice (next-level ticket 16): the grunt of a hit taken and the breath a body
 * lets go as it dies. Not speech: a throat's pulse and its breath through three formants, the
 * way a vowel is made, kept short and breathy so it reads as a body and not as a word.
 */
import { buffer, bp, finish, lp, mix, shape, white, type Rng } from './dsp';
import { synthVoice } from './synth-voice';
import type { Voice, VoiceExtras } from './types';

/** A vowel's first three formants (Hz) at the start and the end of the sound. */
interface Vowel {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
}

interface Utterance {
  readonly seconds: number;
  /** The throat's pitch (Hz) at the start and the end, and how fast it gets from one to the other (time constant, s). */
  readonly pitch: readonly [number, number];
  readonly glide: number;
  readonly vowel: Vowel;
  /** How much of the sound is breath rather than voice (0..1). */
  readonly breath: number;
  /** How far through the sound (0..1 of it) the voice lasts; the breath goes on without it. */
  readonly voiced: number;
  /** Loudness over the sound's length (0..1 of it): attack, then how it dies away. */
  readonly attack: number;
  readonly decay: number;
}

/** How much of a period the folds take to open, and to shut: the quicker they shut, the brighter the voice. */
const OPEN = 0.62;
const SHUT = 0.09;

/**
 * A throat's pulse: the air let through as the folds open and shut, once a period. They open
 * slowly and shut fast, which is what gives a voice its buzz; a little of every period's
 * length and height is left to chance, because a throat under strain is not steady.
 */
function pulse(sr: number, u: Utterance, rng: Rng): Float32Array {
  const out = buffer(sr, u.seconds);
  let phase = 0;
  let wander = 1;
  let height = 1;
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f0 = (u.pitch[1] + (u.pitch[0] - u.pitch[1]) * Math.exp(-t / u.glide)) * wander;
    phase += f0 / sr;
    if (phase >= 1) {
      phase -= 1;
      wander = 1 + 0.045 * (rng.next() * 2 - 1);
      height = 1 + 0.22 * (rng.next() * 2 - 1);
    }
    const flow = phase < OPEN ? 0.5 - 0.5 * Math.cos((Math.PI * phase) / OPEN) : phase < OPEN + SHUT ? Math.cos((Math.PI / 2) * ((phase - OPEN) / SHUT)) : 0;
    // What leaves the mouth is the change in flow, not the flow.
    out[i] = (flow - last) * height * sr * 0.004;
    last = flow;
  }
  return out;
}

/** `source` through a mouth held in the shape of `vowel`, moving from its first shape to its last. */
function mouth(source: Float32Array, sr: number, seconds: number, vowel: Vowel): Float32Array {
  const out = new Float32Array(source.length);
  const gains = [1, 0.8, 0.5] as const;
  const qs = [4.5, 6, 7] as const;
  for (let k = 0; k < 3; k++) {
    const from = vowel.from[k]!;
    const to = vowel.to[k]!;
    const band = bp(source.slice(), sr, (t) => from + (to - from) * Math.min(1, t / seconds), qs[k]);
    mix(out, band, sr, 0, gains[k]!);
  }
  return out;
}

function utter(u: Utterance, rng: Rng, sr: number): Float32Array {
  const stops = u.voiced * u.seconds;
  const voiced = shape(pulse(sr, u, rng), sr, (t) => (t < stops ? 1 : Math.max(0, 1 - (t - stops) / (0.15 * u.seconds))));
  // Breath: the same mouth with air pushed through it, loudest as the throat lets go.
  const air = lp(white(sr, u.seconds, rng), sr, 4500);
  const source = buffer(sr, u.seconds);
  mix(source, voiced, sr, 0, 1 - u.breath);
  mix(source, air, sr, 0, u.breath * 0.55);
  const out = mouth(source, sr, u.seconds, u.vowel);
  // The air that follows the voice out, past the vowel: a body emptying.
  mix(out, bp(shape(white(sr, u.seconds, rng), sr, (t) => Math.min(1, t / (u.seconds * 0.5)) ** 2), sr, 2400, 0.7), sr, 0, u.breath * u.breath * 2.4);
  const a = u.attack * u.seconds;
  shape(out, sr, (t) => (t < a ? t / a : Math.exp(-(t - a) / (u.decay * u.seconds))) * (1 - Math.max(0, (t - u.seconds * 0.82) / (u.seconds * 0.18))));
  return finish(out, sr, 0.5, 70);
}

/** A hit taken: a short grunt forced out by the blow, its pitch dropping as the breath goes. */
export function painGrunt(rng: Rng, sr: number): Float32Array {
  const high = rng.range(150, 190);
  return utter(
    {
      seconds: rng.range(0.2, 0.3),
      pitch: [high, high * rng.range(0.62, 0.74)],
      glide: rng.range(0.05, 0.09),
      // "Uh" closing towards "oh": the mouth shuts on it.
      vowel: { from: [rng.range(600, 680), rng.range(1150, 1300), 2500], to: [rng.range(430, 500), rng.range(900, 1000), 2400] },
      breath: rng.range(0.3, 0.45),
      voiced: 1,
      attack: 0.08,
      decay: rng.range(0.3, 0.42),
    },
    rng,
    sr,
  );
}

/** A death: the voice gives out part way, and the rest is the breath leaving. */
export function lastBreath(rng: Rng, sr: number): Float32Array {
  const high = rng.range(135, 170);
  return utter(
    {
      seconds: rng.range(0.6, 0.85),
      pitch: [high, high * rng.range(0.48, 0.58)],
      glide: rng.range(0.16, 0.26),
      // "Ah" sinking to "uh" as the jaw goes slack.
      vowel: { from: [rng.range(680, 760), rng.range(1150, 1250), 2550], to: [rng.range(420, 480), rng.range(850, 950), 2350] },
      breath: rng.range(0.5, 0.65),
      voiced: rng.range(0.4, 0.55),
      attack: 0.05,
      decay: rng.range(0.55, 0.7),
    },
    rng,
    sr,
  );
}

export function painVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'pain',
    variants: 6,
    keys: ['pain'],
    key: () => 'pain',
    render: (_key, rng, sr) => [painGrunt(rng, sr)],
    // Your own is felt more than heard: the hit's thump is already yours.
    gain: (p) => (p.local === true || p.position === undefined ? 0.32 : 0.8) * (0.6 + 0.4 * Math.min(1, Math.max(0, p.intensity ?? 0.6))),
    rateJitter: 0.07,
    gainJitterDb: 1.5,
    duration: 0.3,
  });
}

export function deathVoice(): Voice & VoiceExtras {
  return synthVoice({
    id: 'death',
    variants: 5,
    keys: ['death'],
    key: () => 'death',
    render: (_key, rng, sr) => [lastBreath(rng, sr)],
    gain: (p) => (p.local === true || p.position === undefined ? 0.4 : 0.85),
    rateJitter: 0.08,
    gainJitterDb: 1.5,
    duration: 0.85,
  });
}
