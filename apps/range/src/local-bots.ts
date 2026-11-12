import { connectPort, type Connection } from '@duty-shooter/fps-core';
import type { FromLocalRoyale, ToLocalRoyale } from './local-royale';

/** Local bots' server, running: the connection to join it by, and how to stop it. */
export interface LocalBots {
  readonly connection: Connection;
  readonly stop: () => void;
}

/**
 * Starts Local bots' worker (ticket 15, ADR 0010): the island's server on
 * this page, ready once it has built the island and its nav. `onStats` hears
 * its tick costs every 2 s; `seed` puts every match on the same spawns and
 * circles.
 */
export function startLocalBots(onStats: (stats: FromLocalRoyale) => void, seed?: number): Promise<LocalBots> {
  return new Promise((done, fail) => {
    const worker = new Worker(new URL('./royale-worker.ts', import.meta.url), { type: 'module', name: 'local-bots' });
    const stop = () => worker.terminate();
    let connection: Connection | null = null;
    worker.addEventListener('message', (e: MessageEvent<FromLocalRoyale | { readonly k: string }>) => {
      const m = e.data;
      if (!('t' in m)) return;
      if (m.t === 'ready') {
        connection = connectPort(worker);
        done({ connection, stop });
      } else if (m.t === 'stats') onStats(m);
      else {
        stop();
        fail(new Error(m.reason));
      }
    });
    worker.addEventListener('error', (e) => {
      stop();
      // Mid-match, the game hears the server is gone rather than waiting on silence.
      if (connection) connection.close('The bots stopped on this machine.');
      else fail(new Error(e.message || 'the worker failed to load'));
    });
    worker.postMessage({ t: 'start', nav: new URL('nav/zero-island.nav', location.href).href, ...(seed === undefined ? {} : { seed }) } satisfies ToLocalRoyale);
  });
}
