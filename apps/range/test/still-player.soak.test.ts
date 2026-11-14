// A player who stands still at their spawn in a free-for-all is found: a bot comes and shoots them, almost always
// within a minute and always within two (review 2026-11-14f: in a Station Nine Gun Game no bot came to a still player
// in 155 s while the bots fought 48 times elsewhere). Before the bots' hunches leaned on whoever had gone quiet, 18 of
// these 80 matches went past a minute and three never found the player in two.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usercmd, type ModeId } from '@duty-shooter/fps-core';
import { BotMatchDriver } from '@duty-shooter/fps-client/session';
import { buildMapById, mapSolids } from '../src/map/maps';

const LIMIT = 120;
const SEEDS = [1, 3, 5, 7, 9, 13, 15, 17, 19, 21, 25, 27, 29, 31, 33, 35, 39, 43, 45, 47];

/** Seconds of live play until a still player first loses health in a seeded Bot Match, or {@link LIMIT} if no one came. */
function firstHit(mapId: 'survival-town' | 'switchyard' | 'station-nine', mode: ModeId, seed: number): number {
  let state = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32));
  const map = buildMapById(mapId);
  const driver = new BotMatchDriver({ map: map.id, solids: mapSolids(map), ladders: map.ladders ?? [], spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav!, mode, botsPerTeam: 3, name: 'You' });
  try {
    let live = 0;
    for (let i = 0; i < (LIMIT + 20) * 60 && live < LIMIT * 60; i++) {
      driver.tick(usercmd());
      const self = driver.client.self;
      if (driver.match?.phase !== 'playing' || !self) continue;
      live += 1;
      if (!self.alive || self.health < 100) return live / 60;
    }
    return LIMIT;
  } finally {
    driver.dispose();
    vi.restoreAllMocks();
  }
}

describe('a player standing still is found', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['station-nine', 'gungame'],
    ['station-nine', 'ffa'],
    ['switchyard', 'gungame'],
    ['survival-town', 'ffa'],
  ] as const)(`on %s (%s), standing at spawn through ${SEEDS.length} matches: shot within 60 s in all but 3, and within ${LIMIT} s in every one`, (mapId, mode) => {
    const times = SEEDS.map((seed) => firstHit(mapId, mode, seed));
    const late = times.filter((t) => t > 60);
    expect(late.length, times.map((t) => t.toFixed(0)).join(' ')).toBeLessThanOrEqual(3);
    expect(Math.max(...times), times.map((t) => t.toFixed(0)).join(' ')).toBeLessThan(LIMIT);
  }, 600_000);
});
