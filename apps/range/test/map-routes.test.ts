import { buildNavGraph, createWorld } from '@duty-shooter/fps-core';
import { describe, expect, it } from 'vitest';
import { mapRoutes } from '../src/map/routes-worker';
import { buildMapById, mapSolids } from '../src/map/maps';

describe('bot routes worked out off the page', () => {
  it('are the graph a match would build, after crossing to the page', () => {
    const map = buildMapById('switchyard');
    const here = buildNavGraph(createWorld(mapSolids(map), { ladders: map.ladders ?? [] }), map.nav!);
    expect(structuredClone(mapRoutes('switchyard'))).toEqual(here);
  });

  it('are nothing on a map without bots', () => {
    expect(mapRoutes('range')).toBeNull();
  });
});
