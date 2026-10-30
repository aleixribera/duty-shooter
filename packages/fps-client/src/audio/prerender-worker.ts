/**
 * The worker that renders the game's procedural sounds ahead of time (see
 * prerender.ts): the same voices and the same Kit as the page, on a stand-in
 * for the audio context that keeps plain samples.
 */
import { kitFor } from './kit';
import type { PrerenderedBank } from './prerender';
import { createDefaultVoices } from './voices';

interface Samples {
  readonly channels: Float32Array[];
  getChannelData(channel: number): Float32Array;
}

const scope = globalThis as unknown as { onmessage: ((e: MessageEvent<number>) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };

scope.onmessage = (e) => {
  const sampleRate = e.data;
  const context = {
    sampleRate,
    createBuffer(channels: number, length: number): Samples {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { channels: data, getChannelData: (c) => data[c]! };
    },
  } as unknown as BaseAudioContext;
  const kit = kitFor(context);
  const post = (id: string, buffers: readonly AudioBuffer[]) => {
    const variants = buffers.map((b) => (b as unknown as Samples).channels);
    const bank: PrerenderedBank = { id, sampleRate, variants };
    scope.postMessage(bank, variants.flat().map((c) => c.buffer as ArrayBuffer));
  };
  const irs = kit.impulseResponses();
  post('ir/outdoor', [irs.outdoor]);
  post('ir/indoor', [irs.indoor]);
  const voices = createDefaultVoices();
  // Guns first: they are what a match is likely to hear first.
  const tasks = [...(voices.gunshot.warmTasks?.(context) ?? []), ...Object.entries(voices).flatMap(([event, voice]) => (event === 'gunshot' ? [] : (voice.warmTasks?.(context) ?? (voice.warm ? [() => voice.warm?.(context)] : []))))];
  const sent = new Set<string>();
  for (const task of tasks) {
    try {
      task();
    } catch {
      // A voice that fails to render here renders on the page, or not at all, as it would there.
    }
    for (const [id, buffers] of kit.rendered()) {
      if (sent.has(id)) continue;
      sent.add(id);
      post(id, buffers);
    }
  }
  scope.postMessage('done');
};
