import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_CATALOGUE, MAP_IDS, MATCH_MAPS, TEAM_SIZES, mapEntry } from '../src/map/catalogue';

// The catalogue is the one list of maps; these hold what the page and the server take from it.
describe('the map catalogue', () => {
  it('has a lobby picture on disk for every map that claims one', () => {
    for (const id of MAP_IDS) {
      expect(existsSync(new URL(`../public/maps/${id}.jpg`, import.meta.url)), id).toBe(MAP_CATALOGUE[id].picture);
    }
  });

  it('plays every match mode on each match map, so a lobby can pick any of them', () => {
    expect(MATCH_MAPS.length).toBeGreaterThan(0);
    for (const id of MATCH_MAPS) {
      for (const mode of ['tdm', 'ffa', 'outposts', 'charge', 'gungame'] as const) expect(TEAM_SIZES[id][mode], `${id} ${mode}`).toBeGreaterThan(0);
    }
  });

  it('gives each map its own name, and knows nothing of an id it does not ship', () => {
    expect(new Set(MAP_IDS.map((id) => MAP_CATALOGUE[id].name)).size).toBe(MAP_IDS.length);
    expect(mapEntry('nowhere')).toBeUndefined();
    expect(mapEntry(null)).toBeUndefined();
  });
});
