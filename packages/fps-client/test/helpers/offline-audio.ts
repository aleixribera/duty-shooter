import type { SoundEventName, SoundParams, Voice } from '../../src/audio';
import { distanceGain } from '../../src/audio/system';

/**
 * Just enough of an AudioContext to run a voice's play() in Node: it renders
 * the voice's buffers for real and records the node graph, so a test can
 * hear what the voice would send out, gains and all.
 */
interface FakeNode {
  readonly kind: string;
  readonly gain: { value: number };
  readonly playbackRate: { value: number };
  readonly frequency: { value: number };
  readonly Q: { value: number };
  type: string;
  buffer: { getChannelData(c: number): Float32Array; length: number } | null;
  onended: (() => void) | null;
  readonly outs: FakeNode[];
  connect(n: FakeNode): FakeNode;
  disconnect(): void;
  start(): void;
}

function node(kind: string): FakeNode {
  const n: FakeNode = {
    kind,
    gain: { value: 1 },
    playbackRate: { value: 1 },
    frequency: { value: 0 },
    Q: { value: 1 },
    type: '',
    buffer: null,
    onended: null,
    outs: [],
    connect(to) {
      n.outs.push(to);
      return to;
    },
    disconnect() {},
    start() {},
  };
  return n;
}

export const SR = 24000;

export function offlineContext() {
  const sources: FakeNode[] = [];
  const ctx = {
    sampleRate: SR,
    currentTime: 0,
    createBuffer(channels: number, length: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, numberOfChannels: channels, sampleRate: SR, getChannelData: (c: number) => data[c]! };
    },
    createBufferSource() {
      const n = node('source');
      sources.push(n);
      return n;
    },
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
  };
  return { ctx: ctx as unknown as AudioContext, sources };
}

/** The product of the gains from `from` to `to` along the loudest path, or 0 if it never gets there. */
function pathGain(from: FakeNode, to: FakeNode): number {
  if (from === to) return 1;
  let best = 0;
  for (const next of from.outs) best = Math.max(best, pathGain(next, to));
  return best * (from.kind === 'gain' ? from.gain.value : 1);
}

/**
 * Plays `voice` once for `event` heard `distance` m away (null: not placed
 * in the world), and returns the mix it sends out, with the system's
 * distance law applied.
 */
export function hear(voice: Voice, event: SoundEventName, params: SoundParams, distance: number | null): Float32Array {
  const { ctx, sources } = offlineContext();
  const out = node('out');
  const p = distance === null ? params : { ...params, distance };
  voice.play(ctx, out as unknown as AudioNode, p, 0);
  const length = Math.max(1, ...sources.map((s) => s.buffer?.length ?? 0));
  const mixed = new Float32Array(length);
  const fall = distanceGain(event, distance);
  for (const s of sources) {
    if (!s.buffer) continue;
    const g = pathGain(s, out) * fall;
    const data = s.buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) mixed[i] = (mixed[i] ?? 0) + (data[i] ?? 0) * g;
  }
  return mixed;
}

/** The loudest 50 ms of `data`, as RMS. */
export function loudness(data: Float32Array): number {
  const w = Math.round(0.05 * SR);
  let best = 0;
  for (let a = 0; a + w <= data.length; a += Math.round(w / 2)) {
    let sum = 0;
    for (let i = a; i < a + w; i++) sum += (data[i] ?? 0) ** 2;
    best = Math.max(best, Math.sqrt(sum / w));
  }
  return best;
}
