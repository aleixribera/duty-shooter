/** Works out a map's bot routes off the page: most of a second of work that Start need not wait for. */
import { buildNavGraph, createWorld, type NavGraph } from '@duty-shooter/fps-core';
import { buildMapById, mapSolids, type MapId } from './maps';

/** The nav graph of a map that has one. */
export function mapRoutes(id: MapId): NavGraph | null {
  const map = buildMapById(id);
  return map.nav ? buildNavGraph(createWorld(mapSolids(map), { ladders: map.ladders ?? [] }), map.nav) : null;
}

// Vitest imports this file for mapRoutes, with no worker scope to talk to.
if ('importScripts' in globalThis) {
  addEventListener('message', (e: MessageEvent<MapId>) => postMessage(mapRoutes(e.data)));
}
