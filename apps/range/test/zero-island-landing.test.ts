import { describe, expect, it } from 'vitest';
import { STATS, sightReach, type ModeContext, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { BattleRoyale, playGround, type MatchEntrant } from '@duty-shooter/fps-core/modes';
import { island } from './support/royale';

const isle = island();
const ground = playGround(isle.nav, isle.world, isle.map.towns ?? []);
const SEATS = 60;
const SEEDS = 8;
/** Something this close (m) straight ahead fills the middle of the screen: a wall, a barrier, a hillside. */
const NOSE_TO_IT = 5;

const entrants: MatchEntrant[] = Array.from({ length: SEATS }, (_, i) => ({ id: `p${i + 1}`, name: `n${i + 1}`, team: null }));
const ctx = { spawns: [{ position: [0, 0, 0], yaw: 0 }], teamSpawns: null, world: isle.world, ground, zones: [], sites: [], using: new Set(), people: new Set() } as unknown as ModeContext;

/** Metres of open view straight ahead of a person standing on the spawn, up to 40. */
function ahead(s: SpawnPoint): number {
  const eye: Vec3 = [s.position[0], s.position[1] + STATS.stance.standEyeHeight.value, s.position[2]];
  return 40 * sightReach(isle.world, eye, [eye[0] - Math.sin(s.yaw) * 40, eye[1], eye[2] - Math.cos(s.yaw) * 40]);
}

describe('Zero Island: where a Battle Royale puts people down', () => {
  it('faces nobody into a wall: seats land looking at open ground (review 2026-11-14c, defect 4)', () => {
    let close = 0;
    let open = 0;
    const started = performance.now();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const mode = new BattleRoyale({ squadSize: 1, seed });
      mode.start(entrants, ctx);
      for (const e of entrants) {
        const d = ahead(mode.chooseSpawn(e.id, ctx));
        if (d < NOSE_TO_IT) close += 1;
        open += d;
      }
    }
    const ms = (performance.now() - started) / SEEDS;
    console.log(`landing: ${close} of ${SEEDS * SEATS} seats within ${NOSE_TO_IT} m of something ahead, mean view ${(open / (SEEDS * SEATS)).toFixed(1)} m, ${ms.toFixed(0)} ms a start`);
    // A random facing (before) put 89 of 480 within 5 m of a wall or a slope, the mean view 22.5 m; now 1 of 480, 39.2 m.
    // The odd one left lands where every way is shut in close by.
    expect(close).toBeLessThanOrEqual((SEEDS * SEATS) / 100);
    expect(open / (SEEDS * SEATS)).toBeGreaterThan(35);
  });
});
