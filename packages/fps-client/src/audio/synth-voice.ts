import type { Rng } from './dsp';
import { kitFor } from './kit';
import type { SoundParams, Voice, VoiceExtras, VoiceParams } from './types';

export interface SynthSpec {
  /** Bank id prefix, unique per voice. */
  readonly id: string;
  /** Rendered variants per key (round-robin without immediate repeats). */
  readonly variants: number;
  /** Every key `key()` can return, so warm() can render them ahead of time. */
  readonly keys: readonly string[];
  key(p: VoiceParams): string;
  render(key: string, rng: Rng, sr: number, variant: number): Float32Array[];
  /** Linear output gain for this play (0 skips the play). */
  gain(p: VoiceParams): number;
  /** Base playback rate for this play (default 1). */
  rate?(p: VoiceParams): number;
  /** Optional per-play low-pass cutoff in Hz (e.g. softer crouch steps). */
  lowpass?(p: VoiceParams): number | undefined;
  /** +- fraction of playback rate jitter (pitch and length). */
  readonly rateJitter: number;
  /** +- dB of gain jitter. */
  readonly gainJitterDb: number;
  /** Longest rendered length in seconds at rate 1. */
  readonly duration: number;
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const jit = (amount: number): number => amount * (Math.random() * 2 - 1);

/** Disconnect a set of nodes when `source` finishes, so long autofire never leaks graph nodes. */
export function cleanupOnEnd(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  source.onended = () => {
    source.onended = null;
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // already disconnected
      }
    }
  };
}

/**
 * Plays one buffer from a bank through gain (+ optional low-pass) into `out`, with per-play
 * rate and gain jitter. Returns nothing; nodes clean themselves up when the source ends.
 */
export function playBuffer(
  ctx: BaseAudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  startTime: number,
  o: { gain: number; rate: number; lowpass?: number | undefined; offset?: number },
): void {
  if (o.gain <= 0) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate;
  const g = ctx.createGain();
  g.gain.value = o.gain;
  const nodes: AudioNode[] = [src, g];
  if (o.lowpass !== undefined && o.lowpass < 18000) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    f.Q.value = 0.5;
    src.connect(f).connect(g);
    nodes.push(f);
  } else {
    src.connect(g);
  }
  g.connect(out);
  cleanupOnEnd(src, nodes);
  src.start(Math.max(startTime, ctx.currentTime), o.offset ?? 0);
}

export function synthVoice(spec: SynthSpec): Voice & VoiceExtras {
  const bankId = (key: string): string => `${spec.id}/${key}`;
  const renderFor = (key: string) => (rng: Rng, sr: number, v: number) => spec.render(key, rng, sr, v);
  return {
    duration: spec.duration / (1 - spec.rateJitter) / 0.9,
    warm(ctx: BaseAudioContext) {
      const kit = kitFor(ctx);
      for (const key of spec.keys) kit.bank(bankId(key), spec.variants, renderFor(key));
    },
    warmTasks(ctx: BaseAudioContext) {
      const kit = kitFor(ctx);
      return spec.keys.map((key) => () => void kit.bank(bankId(key), spec.variants, renderFor(key)));
    },
    play(ctx: AudioContext, out: AudioNode, params: SoundParams, startTime: number) {
      const p = params as VoiceParams;
      const gain = spec.gain(p);
      if (!(gain > 0)) return;
      const key = spec.key(p);
      const buffer = kitFor(ctx).pick(bankId(key), spec.variants, renderFor(key));
      playBuffer(ctx, out, buffer, startTime, {
        gain: gain * dbToGain(jit(spec.gainJitterDb)),
        rate: (spec.rate?.(p) ?? 1) * (1 + jit(spec.rateJitter)),
        lowpass: spec.lowpass?.(p),
      });
    },
  };
}

/** Clamp to [0, 1], treating undefined/NaN as `fallback`. */
export function unit(value: number | undefined, fallback: number): number {
  const v = value === undefined || Number.isNaN(value) ? fallback : value;
  return Math.min(1, Math.max(0, v));
}
