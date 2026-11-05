import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { buildMapById } from '../src/map/maps';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';
import { placeBox } from '../src/map/zero-island-region';
import { NC, NC_PIECES, NC_PLACED } from '../src/map/zero-island-neon-plan';
import { regionKitSuite } from './support/region-kit';

/**
 * Neon City, built (ticket 20): four enterable buildings with stairs to their
 * roofs, the elevated highway with a stair up each side, the towers' shells,
 * and every piece of cover there wearing a model.
 */

const kit = ZERO_ISLAND_KITS.find((k) => k.region === 'neon-city')!;
regionKitSuite(kit, 'neon', 60);

/** Every flight in a piece, as runs of steps: each step no more than a step up from the one before, from the floor up. */
const flights = (asset: keyof typeof NC_PIECES, part: string) => {
  const steps = NC_PIECES[asset].boxes.filter((b) => b.part === part);
  const runs: (typeof steps)[] = [];
  for (const s of steps) {
    const last = runs.at(-1)?.at(-1);
    if (last && Math.abs(s.c[2] - last.c[2]) < 1e-6 && Math.abs(Math.abs(s.c[0] - last.c[0]) - 0.45) < 1e-6) runs.at(-1)!.push(s);
    else runs.push([s]);
  }
  return runs;
};

describe('Zero Island: Neon City', () => {
  const map = buildMapById('zero-island');
  const terrain = new Terrain(map.terrain!);
  const count = (asset: string) => NC_PLACED.filter((p) => p.asset === asset).length;

  it('stands four enterable buildings, the highway and four towers, all on the city level', () => {
    expect(count('nc-walkup') + count('nc-arcade')).toBe(4);
    expect(count('nc-highway')).toBe(1);
    expect(NC_PLACED.filter((p) => p.asset.startsWith('nc-tower')).length).toBe(4);
    for (const p of NC_PLACED) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(NC.floor, 1);
  });

  it('climbs every stair a step at a time, from the floor to the floor or roof it serves', () => {
    const cases = [
      ['nc-walkup', 'step', [4, 7.5]],
      ['nc-arcade', 'fire-step', [5.3]],
      ['nc-highway', 'step', [9, 9]],
    ] as const;
    for (const [asset, part, tops] of cases) {
      const runs = flights(asset, part);
      expect(runs.map((r) => +(r.at(-1)!.c[1] + r.at(-1)!.s[1] / 2).toFixed(2)), asset).toEqual([...tops]);
      for (const run of runs) {
        let below = run[0]!.c[1] - run[0]!.s[1] / 2;
        for (const s of run) {
          const top = s.c[1] + s.s[1] / 2;
          expect(top - below, `${asset} step at ${s.c[0]}`).toBeLessThanOrEqual(0.4);
          expect(s.s[2], `${asset} stair width`).toBeGreaterThanOrEqual(2.3);
          below = top;
        }
      }
    }
  });

  it("keeps the avenue and the cross street open: nothing but the highway's piers and the kit's street pieces in them", () => {
    const solids = map.solids.filter((s) => s.max[1] - s.min[1] > 1.2);
    const blocked: string[] = [];
    for (let d = -52; d <= 52; d += 2) {
      for (const [x, z] of [
        [NC.x + 3.5, NC.z + d],
        [NC.x - 3.5, NC.z + d],
        [NC.x + d, NC.z + 4],
        [NC.x + d, NC.z - 4],
      ] as const) {
        const hit = solids.find((s) => x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2] && s.min[1] < NC.floor + 1.5);
        if (hit && hit.max[0] - hit.min[0] > 12) blocked.push(`${x},${z}`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it("puts the highway's stairs' feet in the street and their heads at the deck, through gaps in its parapets", () => {
    const hw = NC_PLACED.find((p) => p.asset === 'nc-highway')!;
    const parapets = NC_PIECES['nc-highway'].boxes.filter((b) => b.part === 'parapet');
    for (const landing of NC_PIECES['nc-highway'].boxes.filter((b) => b.part === 'landing')) {
      const { center } = placeBox(landing, hw.x, NC.floor, hw.z, hw.yaw);
      expect(center[1] + landing.s[1] / 2).toBeCloseTo(NC.floor + 9, 5);
      // No parapet runs past the landing's ends on its side.
      const side = Math.sign(landing.c[2]);
      for (const p of parapets.filter((q) => Math.sign(q.c[2]) === side)) {
        const [a, b] = [p.c[0] - p.s[0] / 2, p.c[0] + p.s[0] / 2];
        expect(b <= landing.c[0] - landing.s[0] / 2 + 1e-6 || a >= landing.c[0] + landing.s[0] / 2 - 1e-6, `parapet ${a}..${b}`).toBe(true);
      }
    }
  });
});
