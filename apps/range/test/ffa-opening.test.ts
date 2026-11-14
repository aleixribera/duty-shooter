import { describe, expect, it } from 'vitest';
import { STATS, createWorld, sightBlocked, type Vec3 } from '@duty-shooter/fps-core';
import { TEAM_SIZES } from '../src/map/catalogue';
import { buildMapById, mapSolids, MATCH_MAPS } from '../src/map/maps';

/** As the opening deal counts it (`openingSpawns`): two spawns in each other's sight at standing eye height, or within 8 m, see each other. */
const TOO_CLOSE = 8;

/** The most spawns of `sees` that see none of the others. */
function mostUnseen(sees: readonly (readonly boolean[])[]): number {
  let best = 0;
  const pick = (k: number, set: number[]): void => {
    if (set.length + sees.length - k <= best) return;
    if (k === sees.length) {
      best = set.length;
      return;
    }
    if (set.every((j) => !sees[k]![j])) pick(k + 1, [...set, k]);
    pick(k + 1, set);
  };
  pick(0, []);
  return best;
}

describe('a free-for-all opens with nobody in view', () => {
  for (const id of MATCH_MAPS) {
    it(`${id}: its free-for-all spawns seat a full lobby with no one in another's sight`, () => {
      const map = buildMapById(id);
      const world = createWorld(mapSolids(map), { ladders: map.ladders ?? [] });
      const spots = map.spawns.ffa;
      const h = STATS.stance.standEyeHeight.value;
      const eye = (p: Vec3): Vec3 => [p[0], p[1] + h, p[2]];
      const sees = spots.map((a, i) => spots.map((b, j) => i !== j && (Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) < TOO_CLOSE || !sightBlocked(world, eye(a.position), eye(b.position)))));
      // Bot Match fills a free-for-all to twice the map's size a side.
      const players = TEAM_SIZES[id].ffa! * 2;
      expect(mostUnseen(sees)).toBeGreaterThanOrEqual(players);
    });
  }
});
