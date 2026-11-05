import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { buildMapById } from '../src/map/maps';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';
import { DL, DL_PLACED } from '../src/map/zero-island-dustlands-plan';
import { regionKitSuite } from './support/region-kit';

/**
 * The Dustlands, built (ticket 18): the mining camp round the crashed jet,
 * dressed by its kit, with every piece of cover there wearing a model.
 */

const kit = ZERO_ISLAND_KITS.find((k) => k.region === 'the-dustlands')!;
regionKitSuite(kit, 'dustlands', 60);

describe('Zero Island: the Dustlands', () => {
  const map = buildMapById('zero-island');
  const terrain = new Terrain(map.terrain!);

  it('stands the jet, four shacks, the office and the hopper on the canyon floor', () => {
    const count = (asset: string) => DL_PLACED.filter((p) => p.asset === asset).length;
    expect([count('dl-jet'), count('dl-shack'), count('dl-office'), count('dl-hopper')]).toEqual([1, 4, 1, 1]);
    for (const p of DL_PLACED) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(DL.floor, 1);
  });

  it('keeps the camp dense: hard cover within a short sprint of anywhere in it', () => {
    const solids = map.solids.filter((s) => s.max[1] - s.min[1] > 1.6 && Math.hypot((s.min[0] + s.max[0]) / 2 - DL.x, (s.min[2] + s.max[2]) / 2 - DL.z) < 70);
    let worst = 0;
    for (let dx = -45; dx <= 45; dx += 5) {
      for (let dz = -45; dz <= 45; dz += 5) {
        if (Math.hypot(dx, dz) > 45) continue;
        const [x, z] = [DL.x + dx, DL.z + dz];
        const near = Math.min(...solids.map((s) => Math.hypot(Math.max(s.min[0] - x, 0, x - s.max[0]), Math.max(s.min[2] - z, 0, z - s.max[2]))));
        worst = Math.max(worst, near);
      }
    }
    expect(worst).toBeLessThan(10);
  });
});
