/**
 * The score, composed in code. D minor at 60 beats a minute: one beat a second, like the clock
 * every match is. Analogue-style pads through a slow filter, a lone theremin-like lead (the
 * sound of the atomic age's own films), tape wow and flutter over all of it, a siren's rising
 * fifth far off, and a low pulse on the beat.
 *
 *   the menu theme   pad (a loop, 8 bars: Dm add9 | B flat maj7 | Gm6 | A7sus4 -> A), and two
 *                    phrases of the lead the arranger lays over it: the motif
 *                    D E F E D | D C B flat | G B flat D E | D -> C sharp
 *                    which ends on the leading note, so each return of the loop resolves it;
 *                    and a lower answer built on the siren's fifth
 *   the countdown    bed (a loop, 2 bars: a low drone, an ostinato on D, the clock's tick), and
 *                    the riser that takes its place for the last ten seconds and stops dead
 *   stings           match start, the Ring closing, victory (the motif turned major) and defeat
 *                    (the motif's fall, and the tape running down)
 *
 * Everything is rendered once into buffers (in a worker, at half the output rate: none of it
 * reaches above 8 kHz), so playing the score costs a few buffer sources.
 */
import { buffer, createRng, fadeEdges, hp, lp, mix, noiseBurst, peak, samples, svf, thump, white, type Rng } from '../dsp';
import type { Render } from '../kit';
import { BAR, BEAT, LOOP, RISER_SECONDS, type Stem } from './scene';

const TAU = 2 * Math.PI;
/** A MIDI note's frequency (A4 = 69 = 440 Hz). */
export const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * The tape's speed at `t` s, about 1: a slow wow and a faster flutter. Every term repeats in 8 s,
 * so loops of 8 and 32 s close on themselves.
 */
export function wow(t: number): number {
  return 1 + 0.0013 * Math.sin(TAU * 0.375 * t) + 0.0005 * Math.sin(TAU * 6.25 * t + 1.3) + 0.0007 * Math.sin(TAU * 0.125 * t + 0.6);
}

/** The wow sampled every 64 samples: it moves far slower than that, and a sine a sample would cost more than the oscillators. */
function wowTable(sr: number, seconds: number): Float32Array {
  // Exactly `seconds` long (to the table's step), so a loop's tape comes round to where it began.
  const table = new Float32Array(Math.max(1, Math.round((seconds * sr) / 64)));
  for (let i = 0; i < table.length; i++) table[i] = wow((i * 64) / sr);
  return table;
}

/** A band-limited (PolyBLEP) sawtooth added to `dst`, which starts `t0` s into the tape. */
function saw(dst: Float32Array, sr: number, tape: Float32Array, t0: number, freq: number, gain: number, phase = 0): void {
  let p = phase - Math.floor(phase);
  const base = freq / sr;
  const off = Math.round(t0 * sr);
  for (let i = 0; i < dst.length; i++) {
    const dt = base * (tape[((off + i) >> 6) % tape.length] ?? 1);
    p += dt;
    if (p >= 1) p -= 1;
    let v = 2 * p - 1;
    if (p < dt) {
      const x = p / dt;
      v -= x + x - x * x - 1;
    } else if (p > 1 - dt) {
      const x = (p - 1) / dt;
      v -= x * x + x + x + 1;
    }
    dst[i] = (dst[i] ?? 0) + v * gain;
  }
}

/** A sine with a little second harmonic, added to `dst`. */
function sine(dst: Float32Array, sr: number, tape: Float32Array, t0: number, freq: number, gain: number, second = 0): void {
  let p = 0;
  const base = (TAU * freq) / sr;
  const off = Math.round(t0 * sr);
  for (let i = 0; i < dst.length; i++) {
    p += base * (tape[((off + i) >> 6) % tape.length] ?? 1);
    dst[i] = (dst[i] ?? 0) + gain * (Math.sin(p) + second * Math.sin(2 * p));
  }
}

/** Raised-cosine swell: up over `attack` from the start, down over `release` to the end. */
function swell(data: Float32Array, sr: number, attack: number, release: number): void {
  const a = Math.max(1, Math.round(attack * sr));
  const r = Math.max(1, Math.round(release * sr));
  const n = data.length;
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < a) g = 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
    if (i >= n - r) g *= 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / r);
    data[i] = (data[i] ?? 0) * g;
  }
}

/** Adds `src` into the loop `dst` from `at` s, running off the end back onto the start. */
function mixWrapped(dst: Float32Array, src: Float32Array, sr: number, at: number, gain: number): void {
  const n = dst.length;
  let j = ((Math.round(at * sr) % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    dst[j] = (dst[j] ?? 0) + (src[i] ?? 0) * gain;
    if (++j === n) j = 0;
  }
}

/** Scales every channel by the same factor so the loudest sample of any is `target`. */
function level(channels: Float32Array[], target: number): Float32Array[] {
  const m = Math.max(...channels.map(peak));
  if (m > 1e-9) for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] ?? 0) * (target / m);
  return channels;
}

/** A tape echo over a one-shot: each repeat `delay` s later, quieter by `feedback` and duller. */
function echo(data: Float32Array, sr: number, delay: number, feedback: number, wet: number, tone = 1800): Float32Array {
  const d = Math.round(delay * sr);
  const wetLine = new Float32Array(data.length);
  const k = 1 - Math.exp((-TAU * tone) / sr);
  let z = 0;
  for (let i = d; i < data.length; i++) {
    z += k * ((data[i - d] ?? 0) + feedback * (wetLine[i - d] ?? 0) - z);
    wetLine[i] = z;
  }
  for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) + wet * (wetLine[i] ?? 0);
  return data;
}

// ---------------------------------------------------------------------------------------------
// The menu theme
// ---------------------------------------------------------------------------------------------

/** The progression: each chord's bass note and voicing (MIDI), from its bar (0-based) for so many bars. */
export const PROGRESSION: readonly { readonly name: string; readonly bar: number; readonly bars: number; readonly bass: number; readonly notes: readonly number[] }[] = [
  { name: 'Dm(add9)', bar: 0, bars: 2, bass: 38, notes: [50, 57, 64, 65] },
  { name: 'Bbmaj7', bar: 2, bars: 2, bass: 34, notes: [53, 58, 62, 69] },
  { name: 'Gm6', bar: 4, bars: 2, bass: 43, notes: [55, 58, 62, 64] },
  // The dominant's shell holds for two bars while the fourth above it (D) falls to the third (C sharp).
  { name: 'A7', bar: 6, bars: 2, bass: 33, notes: [52, 57, 67] },
  { name: 'sus4', bar: 6, bars: 1, bass: 0, notes: [62] },
  { name: 'third', bar: 7, bars: 1, bass: 0, notes: [61] },
];

/** A phrase of the lead: each note's beat (from the loop's start), length in beats and pitch (MIDI). */
export interface LeadNote {
  readonly beat: number;
  readonly beats: number;
  readonly midi: number;
}

/** The motif. It ends on C sharp, the leading note, and the loop's return to D minor answers it. */
export const MOTIF: readonly LeadNote[] = [
  { beat: 0, beats: 3, midi: 74 },
  { beat: 3, beats: 1, midi: 76 },
  { beat: 4, beats: 2, midi: 77 },
  { beat: 6, beats: 1, midi: 76 },
  { beat: 7, beats: 1, midi: 74 },
  { beat: 8, beats: 3, midi: 74 },
  { beat: 11, beats: 1, midi: 72 },
  { beat: 12, beats: 3, midi: 70 },
  { beat: 16, beats: 2, midi: 67 },
  { beat: 18, beats: 2, midi: 70 },
  { beat: 20, beats: 3, midi: 74 },
  { beat: 23, beats: 1, midi: 76 },
  { beat: 24, beats: 4, midi: 74 },
  { beat: 28, beats: 3, midi: 73 },
];

/** The answer: lower and sparser, built on the fifth D-A the siren sings. */
export const ANSWER: readonly LeadNote[] = [
  { beat: 0, beats: 4, midi: 69 },
  { beat: 4, beats: 2, midi: 74 },
  { beat: 6, beats: 2, midi: 69 },
  { beat: 8, beats: 4, midi: 70 },
  { beat: 12, beats: 2, midi: 65 },
  { beat: 14, beats: 2, midi: 62 },
  { beat: 16, beats: 4, midi: 67 },
  { beat: 20, beats: 2, midi: 70 },
  { beat: 22, beats: 2, midi: 67 },
  { beat: 24, beats: 4, midi: 69 },
  { beat: 28, beats: 3, midi: 64 },
];

/** The pad: two detuned saws a note through a slow low-pass, each chord swelling in as the last fades; a sine bass; the pulse. */
function pad(sr: number): Float32Array[] {
  const n = samples(sr, LOOP);
  const out = [new Float32Array(n), new Float32Array(n)];
  const tape = wowTable(sr, LOOP);
  const ATTACK = 2.4;
  const RELEASE = 3.2;
  for (const chord of PROGRESSION) {
    const from = chord.bar * BAR;
    const moving = chord.notes.length === 1;
    const attack = moving ? 0.9 : ATTACK;
    const release = moving ? 1.6 : RELEASE;
    const seconds = chord.bars * BAR + release;
    const len = samples(sr, seconds);
    const l = new Float32Array(len);
    const r = new Float32Array(len);
    chord.notes.forEach((note, k) => {
      const f = hz(note);
      const g = (moving ? 0.34 : 0.26) / Math.sqrt(1 + k * 0.25);
      // Each note's pair sits a few cents apart and to either side, so the chord is wide and slowly beating.
      saw(l, sr, tape, from, f * 0.9972, g, 0.13 * k);
      saw(r, sr, tape, from, f * 1.0028, g, 0.57 + 0.11 * k);
      saw(l, sr, tape, from, f * 1.0041, g * 0.35, 0.31 * k);
      saw(r, sr, tape, from, f * 0.9959, g * 0.35, 0.83 * k);
    });
    // The filter breathes over 16 s, a little out of step between the sides.
    const cutoff = (side: number) => (t: number) => 520 + 620 * (0.5 - 0.5 * Math.cos((TAU * (from + t)) / 16 + side * 0.9));
    svf(l, sr, 'lowpass', cutoff(0), 0.8);
    svf(r, sr, 'lowpass', cutoff(1), 0.8);
    swell(l, sr, attack, release);
    swell(r, sr, attack, release);
    mixWrapped(out[0]!, l, sr, from, 1);
    mixWrapped(out[1]!, r, sr, from, 1);
    if (chord.bass > 0) {
      const b = new Float32Array(samples(sr, chord.bars * BAR + 1.6));
      sine(b, sr, tape, from, hz(chord.bass), 0.5, 0.18);
      swell(b, sr, 0.5, 1.6);
      mixWrapped(out[0]!, b, sr, from, 1);
      mixWrapped(out[1]!, b, sr, from, 1);
    }
  }
  // The pulse: a soft low knock on every beat, the first of each bar the firmest.
  const pulse = new Float32Array(n);
  for (let beat = 0; beat < LOOP / BEAT; beat++) {
    const accent = [1, 0.3, 0.55, 0.3][beat % 4] ?? 0.3;
    thump(pulse, sr, { at: beat * BEAT, f0: 82, f1: 55, glideTau: 0.03, attack: 0.004, tau: 0.085, gain: 0.3 * accent });
  }
  for (const ch of out) for (let i = 0; i < n; i++) ch[i] = (ch[i] ?? 0) + (pulse[i] ?? 0);
  return level(out, 0.5);
}

/**
 * The lead: one voice gliding from note to note like a theremin, its vibrato growing on each
 * held note, with a tape echo behind it. `seconds` leaves room for the echo to die away.
 */
export function lead(sr: number, notes: readonly LeadNote[], seconds: number, o: { glide?: number; vibrato?: number; echo?: number } = {}): Float32Array {
  const out = buffer(sr, seconds);
  const tape = wowTable(sr, seconds);
  const glideK = 1 - Math.exp(-1 / ((o.glide ?? 0.07) * sr));
  const up = 1 - Math.exp(-1 / (0.11 * sr));
  const down = 1 - Math.exp(-1 / (0.28 * sr));
  const depth = o.vibrato ?? 0.0065;
  let f = hz(notes[0]?.midi ?? 69);
  let amp = 0;
  let phase = 0;
  let vib = 0;
  let k = 0;
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    while (k < notes.length - 1 && t >= (notes[k + 1]?.beat ?? Infinity) * BEAT) {
      k++;
      held = 0;
    }
    const note = notes[k]!;
    const on = t >= note.beat * BEAT && t < (note.beat + note.beats) * BEAT - 0.06;
    f += (hz(note.midi) - f) * glideK;
    amp += ((on ? 1 : 0) - amp) * (on ? up : down);
    held += 1 / sr;
    // The vibrato waits a moment on each note, then opens out.
    const v = Math.min(1, Math.max(0, (held - 0.3) / 0.8));
    vib += (TAU * 5.3) / sr;
    phase += ((TAU * f) / sr) * (tape[(i >> 6) % tape.length] ?? 1) * (1 + depth * v * v * Math.sin(vib));
    out[i] = amp * (Math.sin(phase) + 0.2 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase));
  }
  lp(out, sr, 3800);
  echo(out, sr, 0.75, 0.42, o.echo ?? 0.45);
  hp(out, sr, 120);
  fadeEdges(out, sr, 0.02, 0.5);
  return out;
}

/** How long the lead's echo rings past the loop (s). */
export const LEAD_TAIL = 4;

/** The far siren: a rotor's buzz climbing the fifth from D to A, wavering there, and winding back down. */
function sirenMotif(sr: number): Float32Array {
  const seconds = 13;
  const out = buffer(sr, seconds);
  const lo = hz(62);
  const hi = hz(69);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = t < 4.2 ? lo + (hi - lo) * (1 - Math.exp(-t / 1.25)) / (1 - Math.exp(-4.2 / 1.25)) : t < 7 ? hi * (1 + 0.006 * Math.sin(TAU * 0.5 * t)) : lo * 0.75 + (hi - lo * 0.75) * Math.exp(-(t - 7) / 2);
    p1 += (TAU * f * wow(t)) / sr;
    p2 += (TAU * f * 1.004) / sr;
    const g = Math.min(1, t / 1.6) * (t > 7 ? Math.exp(-(t - 7) / 1.8) : 1);
    out[i] = g * (Math.tanh(2.2 * Math.sin(p1)) * 0.6 + Math.tanh(1.6 * Math.sin(p2)) * 0.4);
  }
  lp(out, sr, 1250);
  lp(out, sr, 2200);
  echo(out, sr, 0.61, 0.5, 0.6, 1100);
  hp(out, sr, 150);
  fadeEdges(out, sr, 0.05, 1.2);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The countdown
// ---------------------------------------------------------------------------------------------

/** The bed's loop: two bars. */
export const BED_SECONDS = 2 * BAR;

/** A frequency moved to the nearest that fits a whole number of cycles into `seconds`, so a held tone loops without a seam. */
const fit = (freq: number, seconds: number): number => Math.round(freq * seconds) / seconds;

/** One note of the ostinato: saws through a low-pass that snaps shut. */
function pluck(sr: number, midi: number, seconds: number, bright: number): Float32Array {
  const out = buffer(sr, seconds);
  const flat = new Float32Array([1]);
  const f = hz(midi);
  saw(out, sr, flat, 0, f * 0.997, 0.5, 0.2);
  saw(out, sr, flat, 0, f * 1.003, 0.5, 0.7);
  saw(out, sr, flat, 0, f * 0.5, 0.35, 0.4);
  svf(out, sr, 'lowpass', (t) => 160 + bright * Math.exp(-t / 0.055), 1.1);
  const tau = seconds / 3.2;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = (out[i] ?? 0) * Math.min(1, t / 0.004) * Math.exp(-t / tau);
  }
  return fadeEdges(out, sr, 0, 0.02);
}

/** The clock's tick: a small dry knock. */
function tick(dst: Float32Array, sr: number, rng: Rng, at: number, gain: number): void {
  noiseBurst(dst, sr, rng, { at, attack: 0.0002, tau: 0.003, gain, mode: 'bandpass', freq: 2100, q: 1.4, length: 0.03 });
  thump(dst, sr, { at, f0: 1250, f1: 1180, glideTau: 0.01, attack: 0.0004, tau: 0.014, gain: gain * 0.5 });
}

/**
 * The last minute's bed: a drone on D whose partials beat slowly, an ostinato of eighths on D
 * with a flat second leaning in at the bar's end, the tick of the second, and a thin fifth
 * shivering above. Low and sparse: it leaves the band footsteps live in alone.
 */
function bed(sr: number, rng: Rng): Float32Array[] {
  const seconds = BED_SECONDS;
  const n = samples(sr, seconds);
  const mid = new Float32Array(n);
  const root = fit(hz(26), seconds);
  // The drone, built from sines so that it closes on itself exactly.
  const partials = [0.45, 1, 0.55, 0.3, 0.16, 0.09];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (let h = 0; h < partials.length; h++) {
      const f = root * (h + 1);
      const slow = 0.75 + 0.25 * Math.sin((TAU * (h + 1) * t) / seconds + h * 1.7);
      v += (partials[h] ?? 0) * slow * (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * (f + (h + 1) / seconds) * t + h));
    }
    mid[i] = v * 0.16;
  }
  const steps = [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0];
  const accents = [1, 0.45, 0.7, 0.45, 0.85, 0.45, 0.7, 0.5];
  steps.forEach((step, k) => mixWrapped(mid, pluck(sr, 38 + step, 0.46, 900 + 500 * (accents[k % 8] ?? 0.5)), sr, k * 0.5, 0.42 * (accents[k % 8] ?? 0.5)));
  const out = [Float32Array.from(mid), Float32Array.from(mid)];
  for (let s = 0; s < seconds; s++) tick(out[s % 2]!, sr, rng, s + 0.001, 0.2);
  for (let s = 0; s < seconds; s++) tick(out[(s + 1) % 2]!, sr, rng, s + 0.001, 0.09);
  // The fifth above (A and D), a few cycles apart between the sides, shivering four times a second.
  const fifth = [fit(hz(69), seconds), fit(hz(74), seconds)];
  for (let c = 0; c < 2; c++) {
    const ch = out[c]!;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const shiver = 0.6 + 0.4 * Math.sin(TAU * 4 * t + c * 1.1);
      const breath = 0.55 - 0.45 * Math.cos((TAU * t) / seconds);
      let v = 0;
      for (const f of fifth) {
        const ff = f + (c === 0 ? 0 : 1 / seconds);
        v += Math.sin(TAU * ff * t) + 0.3 * Math.sin(TAU * 2 * ff * t) + 0.1 * Math.sin(TAU * 3 * ff * t);
      }
      ch[i] = (ch[i] ?? 0) + v * 0.035 * shiver * breath;
    }
  }
  return level(out, 0.5);
}

/** When the riser's pulses fall (s): from the bed's two a second to eight by the end. */
export function riserPulses(): number[] {
  const r0 = 2 * Math.pow(2, 1 / 12);
  const a = 8 / r0;
  const times: number[] = [];
  for (let k = 0; ; k++) {
    const t = (RISER_SECONDS * Math.log(1 + (k * Math.log(a)) / (r0 * RISER_SECONDS))) / Math.log(a);
    if (t >= RISER_SECONDS - 0.02) break;
    times.push(t);
  }
  return times;
}

/**
 * The final ten seconds: the ostinato speeds up and climbs by semitones from E flat to A, the
 * dominant, with noise and a high cluster opening over it; at ten seconds it is cut, on a low
 * knock. The resolution never comes.
 */
function riser(sr: number, rng: Rng): Float32Array[] {
  const seconds = RISER_SECONDS;
  const total = seconds + 0.9;
  const out = buffer(sr, total);
  const flat = new Float32Array([1]);
  const times = riserPulses();
  times.forEach((t, k) => {
    const step = Math.min(6, Math.floor((t / seconds) * 7));
    const gap = (times[k + 1] ?? seconds) - t;
    const body = pluck(sr, 39 + step, Math.min(0.46, Math.max(0.09, gap * 0.95)), 900 + 2200 * (t / seconds));
    mix(out, body, sr, t, 0.5 * (k % 2 === 0 ? 1 : 0.7) * (0.6 + 0.4 * (t / seconds)));
  });
  // Noise climbing through the mids.
  const air = white(sr, seconds, rng);
  svf(air, sr, 'bandpass', (t) => 300 * Math.pow(5000 / 300, t / seconds), 1.3);
  for (let i = 0; i < air.length; i++) {
    const t = i / sr;
    air[i] = (air[i] ?? 0) * 0.5 * Math.pow(t / seconds, 2.2);
  }
  mix(out, air, sr, 0, 1);
  // A tone sliding up three octaves under it, and the minor second A / B flat opening above.
  const high = buffer(sr, seconds);
  saw(high, sr, flat, 0, hz(69), 0.3, 0.1);
  saw(high, sr, flat, 0, hz(70), 0.3, 0.6);
  saw(high, sr, flat, 0, hz(81.1), 0.12, 0.3);
  svf(high, sr, 'lowpass', (t) => 400 * Math.pow(9, t / seconds), 0.9);
  let p = 0;
  for (let i = 0; i < high.length; i++) {
    const t = i / sr;
    const x = t / seconds;
    p += (TAU * 110 * Math.pow(8, x)) / sr;
    const tremolo = 0.7 + 0.3 * Math.sin(TAU * (3 + 9 * x) * t);
    high[i] = ((high[i] ?? 0) * Math.pow(x, 1.6) * tremolo + 0.22 * x * Math.sin(p)) * 0.9;
  }
  mix(out, high, sr, 0, 1);
  // Cut dead at ten seconds.
  const cut = Math.round(seconds * sr);
  const ramp = Math.round(0.006 * sr);
  for (let i = cut - ramp; i < out.length; i++) out[i] = i < cut ? (out[i] ?? 0) * ((cut - i) / ramp) : 0;
  thump(out, sr, { at: seconds, f0: 95, f1: 34, glideTau: 0.07, attack: 0.002, tau: 0.2, gain: 1.1 });
  noiseBurst(out, sr, rng, { at: seconds, attack: 0.002, tau: 0.09, gain: 0.5, mode: 'lowpass', freq: 320, steep: true, length: 0.8 });
  hp(out, sr, 35);
  fadeEdges(out, sr, 0.01, 0.1);
  return level([out], 0.6);
}

// ---------------------------------------------------------------------------------------------
// Stings
// ---------------------------------------------------------------------------------------------

/** A synth brass note: saws through a filter that opens with a bark and settles. */
function brass(dst: Float32Array, sr: number, at: number, midi: number, seconds: number, gain: number, bright = 2600): void {
  const out = buffer(sr, seconds + 0.5);
  const flat = new Float32Array([1]);
  const f = hz(midi);
  saw(out, sr, flat, 0, f * 0.9965, 0.5, 0.15);
  saw(out, sr, flat, 0, f * 1.0035, 0.5, 0.65);
  svf(out, sr, 'lowpass', (t) => 260 + bright * (Math.min(1, t / 0.035) * (0.3 + 0.7 * Math.exp(-t / 0.4))), 1.0);
  const hold = Math.round(seconds * sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = (out[i] ?? 0) * Math.min(1, t / 0.022) * (i < hold ? 1 : Math.exp(-(i - hold) / (0.12 * sr)));
  }
  fadeEdges(out, sr, 0, 0.05);
  mix(dst, out, sr, at, gain);
}

function finishSting(out: Float32Array, sr: number, tail: number, target = 0.6): Float32Array[] {
  hp(out, sr, 32);
  fadeEdges(out, sr, 0.003, tail);
  return level([out], target);
}

/** A match opens: a low knock, and the fifth D-A-D stacked up in brass over it. */
function matchStart(sr: number, rng: Rng): Float32Array[] {
  const out = buffer(sr, 4.2);
  thump(out, sr, { at: 0, f0: 78, f1: 36, glideTau: 0.08, attack: 0.003, tau: 0.32, gain: 1 });
  noiseBurst(out, sr, rng, { at: 0, attack: 0.002, tau: 0.05, gain: 0.3, mode: 'lowpass', freq: 400, steep: true, length: 0.4 });
  brass(out, sr, 0, 38, 1.9, 0.5, 1500);
  brass(out, sr, 0.0, 50, 1.9, 0.42);
  brass(out, sr, 0.17, 57, 1.73, 0.42);
  brass(out, sr, 0.34, 62, 1.56, 0.46, 3200);
  echo(out, sr, 0.375, 0.4, 0.35, 1500);
  return finishSting(out, sr, 0.8);
}

/** The Ring starts to close: the siren's fifth, twice and quickly, over a low swell. */
function ringClosing(sr: number): Float32Array[] {
  const out = buffer(sr, 3.6);
  const tone = buffer(sr, 1.9);
  let p = 0;
  for (let i = 0; i < tone.length; i++) {
    const t = i / sr;
    const u = t % 0.85;
    const f = hz(69) + (hz(74) - hz(69)) * Math.min(1, u / 0.42) ** 0.7;
    p += (TAU * f) / sr;
    const g = Math.min(1, u / 0.03) * (u > 0.62 ? Math.max(0, 1 - (u - 0.62) / 0.2) : 1) * (t > 1.68 ? 0 : 1);
    tone[i] = g * Math.tanh(2 * Math.sin(p));
  }
  lp(tone, sr, 2400);
  mix(out, tone, sr, 0, 0.45);
  brass(out, sr, 0, 38, 1.7, 0.5, 900);
  brass(out, sr, 0, 45, 1.7, 0.3, 900);
  echo(out, sr, 0.3, 0.45, 0.4, 1600);
  return finishSting(out, sr, 0.8);
}

/** Victory: the motif's first three notes turned major (D E F sharp) and carried up to A over a D major chord. */
function victory(sr: number, rng: Rng): Float32Array[] {
  const out = buffer(sr, 6.5);
  thump(out, sr, { at: 0, f0: 80, f1: 37, glideTau: 0.08, attack: 0.003, tau: 0.3, gain: 0.9 });
  thump(out, sr, { at: 1.5, f0: 80, f1: 37, glideTau: 0.08, attack: 0.003, tau: 0.45, gain: 1 });
  noiseBurst(out, sr, rng, { at: 1.5, attack: 0.004, tau: 0.5, gain: 0.12, mode: 'highpass', freq: 3000, length: 2 });
  brass(out, sr, 0, 62, 0.42, 0.5);
  brass(out, sr, 0.5, 64, 0.42, 0.5);
  brass(out, sr, 1.0, 66, 0.42, 0.52);
  brass(out, sr, 1.5, 69, 2.6, 0.5, 3400);
  brass(out, sr, 2.5, 74, 1.6, 0.34, 3400);
  for (const [note, g] of [[38, 0.5], [50, 0.36], [57, 0.34], [62, 0.3], [66, 0.3]] as const) brass(out, sr, 1.5, note, 2.6, g, 1700);
  echo(out, sr, 0.375, 0.42, 0.35, 1900);
  return finishSting(out, sr, 1.5);
}

/** Slows `data` down from `from` s on, as a tape machine does when its motor is cut: pitch and time sag together to `endRate`. */
function tapeStop(data: Float32Array, sr: number, from: number, over: number, endRate: number): Float32Array {
  const out = new Float32Array(data.length);
  let pos = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const x = Math.min(1, Math.max(0, (t - from) / over));
    const rate = 1 - (1 - endRate) * x * x * (3 - 2 * x);
    const j = Math.floor(pos);
    const a = data[j] ?? 0;
    out[i] = (a + ((data[j + 1] ?? a) - a) * (pos - j)) * (1 - x * x);
    pos += rate;
  }
  return out;
}

/** Defeat: the motif's fall (F E D) over a dark D minor, and the tape running down. */
function defeat(sr: number): Float32Array[] {
  const seconds = 5.6;
  const dry = buffer(sr, seconds);
  dry.set(lead(sr, [{ beat: 0, beats: 0.9, midi: 65 }, { beat: 0.9, beats: 0.9, midi: 64 }, { beat: 1.8, beats: 3.4, midi: 62 }], seconds, { glide: 0.09, echo: 0.3 }));
  for (let i = 0; i < dry.length; i++) dry[i] = (dry[i] ?? 0) * 0.5;
  for (const [note, g] of [[26, 0.5], [38, 0.5], [45, 0.36], [50, 0.34], [53, 0.3]] as const) brass(dry, sr, 0, note, 4.6, g, 700);
  thump(dry, sr, { at: 0, f0: 70, f1: 33, glideTau: 0.1, attack: 0.004, tau: 0.4, gain: 0.9 });
  return finishSting(tapeStop(dry, sr, 2.3, 3, 0.4), sr, 0.6);
}

/** Every stem, rendered by the Kit like any bank (one variant each). */
export const STEM_RENDER: Readonly<Record<Stem, Render>> = {
  pad: (_rng, sr) => pad(sr),
  leadA: (_rng, sr) => level([lead(sr, MOTIF, LOOP + LEAD_TAIL)], 0.5),
  leadB: (_rng, sr) => level([lead(sr, ANSWER, LOOP + LEAD_TAIL, { glide: 0.16 })], 0.5),
  siren: (_rng, sr) => level([sirenMotif(sr)], 0.5),
  bed: (rng, sr) => bed(sr, rng),
  riser: (rng, sr) => riser(sr, rng),
  matchStart: (rng, sr) => matchStart(sr, rng),
  ringClosing: (_rng, sr) => ringClosing(sr),
  victory: (rng, sr) => victory(sr, rng),
  defeat: (_rng, sr) => defeat(sr),
};

export const STEMS = Object.keys(STEM_RENDER) as Stem[];

/** A stem's bank id in the Kit. */
export const stemId = (stem: Stem): string => `music/${stem}`;

/** Stems that loop: their buffers keep their exact length. */
export const LOOPED: readonly Stem[] = ['pad', 'bed'];

/** Renders one stem at `sr` (for tests and for measuring). */
export function renderStem(stem: Stem, sr: number): Float32Array[] {
  return STEM_RENDER[stem](createRng(0x5c0e ^ stem.length * 977 ^ (stem.charCodeAt(0) << 8)), sr, 0);
}
