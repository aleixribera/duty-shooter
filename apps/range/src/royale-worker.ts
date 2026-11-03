/** Local bots' worker (ticket 15): the island's Battle Royale server, off the render thread. */
import type { PortLike } from '@duty-shooter/fps-core';
import { serveLocalRoyale } from './local-royale';

serveLocalRoyale(globalThis as unknown as PortLike);
