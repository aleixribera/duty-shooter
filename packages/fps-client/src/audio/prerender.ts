/**
 * Renders the procedural sounds in a worker from the moment the page opens.
 * A bank takes up to 100 ms to render; on the main thread, that was the
 * worst hitch in a match. By the time a sound is first played its samples
 * are here, and the kit turns them into a buffer in a moment.
 */
import { offerPrerendered } from './kit';

/** A bank of sounds as plain samples: variants of channels. */
export interface PrerenderedBank {
  readonly id: string;
  readonly sampleRate: number;
  readonly variants: Float32Array[][];
}

/** The output rate the last audio context here ran at. Banks play at any rate; the reverbs must match (see Kit.impulseResponses). */
const RATE_KEY = 'duty-shooter.audio-rate';

export function rememberSampleRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // Not remembered: the usual rate is assumed next time.
  }
}

function expectedSampleRate(): number {
  try {
    return Number(localStorage.getItem(RATE_KEY)) || 48000;
  } catch {
    return 48000;
  }
}

/** What a prerender worker renders: every effect's banks, or the score's stems (a worker of its own, so the music never holds the guns up). */
export type PrerenderSet = 'effects' | 'music';

/** What the worker is told: the output rate to render for, and which set. */
export interface PrerenderOrder {
  readonly sampleRate: number;
  readonly set: PrerenderSet;
}

/** Settles when every bank of `set` is in; false if it could not be done in a worker (the page renders them instead). */
export function startPrerender(set: PrerenderSet = 'effects'): Promise<boolean> {
  if (typeof Worker === 'undefined') return Promise.resolve(false);
  return new Promise((done) => {
    try {
      const worker = new Worker(new URL('./prerender-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<PrerenderedBank | 'done'>) => {
        if (e.data !== 'done') return offerPrerendered(e.data);
        worker.terminate();
        done(true);
      };
      worker.onerror = () => {
        worker.terminate();
        done(false);
      };
      const order: PrerenderOrder = { sampleRate: expectedSampleRate(), set };
      worker.postMessage(order);
    } catch {
      done(false);
    }
  });
}
