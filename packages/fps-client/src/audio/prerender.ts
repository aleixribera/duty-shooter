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

/** Settles when every bank is in; false if it could not be done in a worker (the page renders them instead). */
export function startPrerender(): Promise<boolean> {
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
      worker.postMessage(expectedSampleRate());
    } catch {
      done(false);
    }
  });
}
