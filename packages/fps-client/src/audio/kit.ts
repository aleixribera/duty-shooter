import { createRng, hashString, hp, lp, mix, scatter, shape, white, wobble, type Rng } from './dsp';
import type { PrerenderedBank } from './prerender';

/** Renders one variant of a sound: returns one Float32Array per channel (all the same length). */
export type Render = (rng: Rng, sr: number, variant: number) => Float32Array[];

/**
 * Per-AudioContext cache of everything expensive: rendered one-shot variants and the reverb
 * impulse responses. Built lazily (and warmed at unlock), never rebuilt.
 */
export class Kit {
  private readonly banks = new Map<string, AudioBuffer[]>();
  private readonly last = new Map<string, number>();
  private irs: { outdoor: AudioBuffer; indoor: AudioBuffer } | null = null;

  constructor(readonly ctx: BaseAudioContext) {}

  /** The `count` rendered variants of a sound, rendering them on first request. */
  bank(id: string, count: number, render: Render): AudioBuffer[] {
    let bank = this.banks.get(id);
    if (!bank) {
      bank = [];
      const ready = takePrerendered(id);
      const sr = this.ctx.sampleRate;
      if (ready) for (const channels of ready.variants) bank.push(this.toBuffer(channels, true, ready.sampleRate));
      else
        for (let v = 0; v < count; v++) {
          const rng = createRng(hashString(id) ^ Math.imul(v + 1, 0x85ebca6b));
          bank.push(this.toBuffer(render(rng, sr, v)));
        }
      this.banks.set(id, bank);
    }
    return bank;
  }

  /** Every bank rendered so far, by id. */
  rendered(): ReadonlyMap<string, readonly AudioBuffer[]> {
    return this.banks;
  }

  has(id: string): boolean {
    return this.banks.has(id);
  }

  /** A random variant from a bank that is never the same one as the previous pick. */
  pick(id: string, count: number, render: Render): AudioBuffer {
    const bank = this.bank(id, count, render);
    const prev = this.last.get(id) ?? -1;
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === prev) i = (i + 1 + Math.floor(Math.random() * (bank.length - 1))) % bank.length;
    this.last.set(id, i);
    return bank[i] as AudioBuffer;
  }

  impulseResponses(): { outdoor: AudioBuffer; indoor: AudioBuffer } {
    if (!this.irs) {
      const sr = this.ctx.sampleRate;
      // A convolver takes only its context's rate: prerendered at another, the responses are rendered here.
      const ready = (id: string) => {
        const bank = takePrerendered(id);
        return bank?.sampleRate === sr ? bank.variants[0] : undefined;
      };
      this.irs = {
        outdoor: this.toBuffer(ready('ir/outdoor') ?? outdoorIR(sr, createRng(0x0d00)), true),
        indoor: this.toBuffer(ready('ir/indoor') ?? indoorIR(sr, createRng(0x1d00)), true),
      };
    }
    return this.irs;
  }

  private toBuffer(channels: Float32Array[], keepLength = false, sampleRate = this.ctx.sampleRate): AudioBuffer {
    const first = channels[0] ?? new Float32Array(1);
    let length = first.length;
    if (!keepLength) {
      // Trim trailing near-silence so sources end (and get cleaned up) as early as possible.
      let end = length;
      for (; end > 1; end--) {
        let loud = false;
        for (const ch of channels) if (Math.abs(ch[end - 1] ?? 0) > 1e-4) loud = true;
        if (loud) break;
      }
      length = Math.max(1, end);
    }
    const buf = this.ctx.createBuffer(channels.length, length, sampleRate);
    channels.forEach((ch, c) => buf.getChannelData(c).set(ch.subarray(0, length)));
    return buf;
  }
}

const kits = new WeakMap<BaseAudioContext, Kit>();
const prerendered = new Map<string, PrerenderedBank>();

/** A bank rendered ahead of time, for the kit to use instead of rendering it. */
export function offerPrerendered(bank: PrerenderedBank): void {
  prerendered.set(bank.id, bank);
}

function takePrerendered(id: string): PrerenderedBank | undefined {
  const bank = prerendered.get(id);
  prerendered.delete(id);
  return bank;
}

export function kitFor(ctx: BaseAudioContext): Kit {
  let kit = kits.get(ctx);
  if (!kit) {
    kit = new Kit(ctx);
    kits.set(ctx, kit);
  }
  return kit;
}

// ---------------------------------------------------------------------------------------------
// Impulse responses. Not normalised by the ConvolverNode (normalize = false): instead each
// channel's energy (sum of squares) is set explicitly, so wet level = send gain and is
// independent of sample rate. Energy ~2 gives a tail around -18 dBFS RMS after a -6 dBFS shot.
// ---------------------------------------------------------------------------------------------

function energy(data: Float32Array): number {
  let e = 0;
  for (let i = 0; i < data.length; i++) e += (data[i] ?? 0) ** 2;
  return e;
}

function setEnergy(data: Float32Array, target: number): Float32Array {
  const e = energy(data);
  if (e > 1e-12) {
    const s = Math.sqrt(target / e);
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * s;
  }
  return data;
}

/**
 * A single reflection: an impulse smeared by a low-pass. Scaled by its DC gain (sum), not its
 * energy, so the echo of the low, smooth part of a shot comes back at exactly `amp` times the dry.
 */
function reflection(dst: Float32Array, sr: number, at: number, amp: number, cutoff: number, sign = 1): void {
  const imp = new Float32Array(Math.round(sr * 0.004));
  imp[0] = 1;
  lp(imp, sr, cutoff, 0.6);
  let sum = 0;
  for (let i = 0; i < imp.length; i++) sum += imp[i] ?? 0;
  mix(dst, imp, sr, at, (sign * amp) / Math.max(sum, 1e-6));
}

/**
 * Outdoor: sparse, slappy discrete echoes off distant buildings/terrain (50 ms - 1.1 s) over a long,
 * rolling, progressively darker decay (T60 ~2 s, audible for ~1.5 s). Decorrelated L/R.
 */
function outdoorIR(sr: number, rng: Rng): Float32Array[] {
  const seconds = 2.0;
  const t60 = 2.0;
  const tau = t60 / 6.91;
  return [0, 1].map(() => {
    const diffuse = white(sr, seconds, rng);
    lp(diffuse, sr, (t) => 450 + 5000 * Math.exp(-t / 0.45), 0.6);
    const roll = wobble(rng, seconds, 0.07, 0.55);
    shape(diffuse, sr, (t) => {
      const rise = t < 0.012 ? 0 : t < 0.08 ? ((t - 0.012) / 0.068) ** 2 : 1;
      return rise * Math.exp(-t / tau) * roll(t);
    });
    setEnergy(diffuse, 0.13);
    const ir = new Float32Array(diffuse.length);
    mix(ir, diffuse, sr, 0, 1);
    for (const t of scatter(rng, 7, 0.05, 0.6, 1.3)) {
      reflection(ir, sr, t, rng.range(0.12, 0.34) * Math.exp(-t / 0.7), rng.range(1800, 4500));
    }
    // A few late, dark slaps off far-away terrain.
    for (const t of scatter(rng, 3, 0.6, 1.1)) reflection(ir, sr, t, rng.range(0.05, 0.12), rng.range(900, 1600));
    // Keep the sub thump of the dry shot out of the tail (it only muddies it).
    hp(ir, sr, 90);
    hp(ir, sr, 90);
    return ir;
  });
}

/**
 * Indoor: dense early reflections in the first 45 ms, then a shorter (T60 ~0.75 s), boomier decay
 * with a low-frequency build-up from the room modes.
 */
function indoorIR(sr: number, rng: Rng): Float32Array[] {
  const seconds = 1.0;
  const t60 = 0.75;
  const tau = t60 / 6.91;
  return [0, 1].map(() => {
    const air = white(sr, seconds, rng);
    lp(air, sr, (t) => 700 + 5000 * Math.exp(-t / 0.18), 0.6);
    shape(air, sr, (t) => (t < 0.003 ? 0 : t < 0.015 ? (t - 0.003) / 0.012 : 1) * Math.exp(-t / tau));
    setEnergy(air, 0.019);
    const boom = white(sr, seconds, rng);
    lp(boom, sr, 240, 0.9);
    lp(boom, sr, 240, 0.7);
    shape(boom, sr, (t) => (t < 0.006 ? 0 : t < 0.03 ? (t - 0.006) / 0.024 : 1) * Math.exp(-t / (tau * 1.25)));
    setEnergy(boom, 0.013);
    const ir = new Float32Array(air.length);
    mix(ir, air, sr, 0, 1);
    mix(ir, boom, sr, 0, 1);
    for (const t of scatter(rng, 22, 0.002, 0.045, 1.2)) {
      reflection(ir, sr, t, rng.range(0.06, 0.2) * Math.exp(-t / 0.06), rng.range(3000, 7000), rng.bool(0.3) ? -1 : 1);
    }
    hp(ir, sr, 60);
    return ir;
  });
}

