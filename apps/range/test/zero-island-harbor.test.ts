import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { buildMapById } from '../src/map/maps';
import { insidePolygon } from '../src/map/definition';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';
import { placeBox } from '../src/map/zero-island-region';
import { HB, RH_PIECES, RH_PLACED } from '../src/map/zero-island-harbor-plan';
import { padFloor } from '../src/map/zero-island-kit';
import { zeroIslandBoundary } from '../src/map/zero-island-terrain';
import { regionKitSuite } from './support/region-kit';

/**
 * Rogue Harbor, built (ticket 19): the container port, its quay, cranes and
 * the cargo ship alongside, and the hangar by the airstrip, dressed by its
 * kit, with every piece of cover there wearing a model.
 */

const kit = ZERO_ISLAND_KITS.find((k) => k.region === 'rogue-harbor')!;
regionKitSuite(kit, 'harbor', 80);

describe('Zero Island: Rogue Harbor', () => {
  const map = buildMapById('zero-island');
  const terrain = new Terrain(map.terrain!);
  const outline = zeroIslandBoundary();
  const count = (asset: string) => RH_PLACED.filter((p) => p.asset === asset).length;
  const corners = (asset: string) => {
    const p = RH_PLACED.find((q) => q.asset === asset)!;
    const floor = padFloor(terrain, kit.pads[p.pad]!);
    return RH_PIECES[asset as keyof typeof RH_PIECES].boxes.flatMap((b) => {
      const { center, size, yaw } = placeBox(b, p.x, floor, p.z, p.yaw);
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      return [-1, 1].flatMap((u) => [-1, 1].map((v) => ({ part: b.part, x: center[0] + (u * size[0] * c) / 2 + (v * size[2] * s) / 2, z: center[2] - (u * size[0] * s) / 2 + (v * size[2] * c) / 2, y: center[1] - size[1] / 2, top: center[1] + size[1] / 2 })));
    });
  };

  it('stands the quay, two cranes, the ship, two warehouses and the hangar', () => {
    expect([count('rh-quay'), count('rh-crane'), count('rh-ship'), count('rh-warehouse'), count('rh-hangar')]).toEqual([1, 2, 1, 2, 1]);
    for (const p of RH_PLACED.filter((q) => q.asset !== 'rh-ship' && q.asset !== 'rh-hangar')) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(HB.floor, 1);
  });

  it('moors the ship in the shallows inside the Boundary, its gangways down onto the quay', () => {
    for (const c of corners('rh-ship')) {
      expect(insidePolygon(outline, c.x, c.z), `${c.part} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(true);
      if (c.part === 'hull' || c.part === 'stern') expect(terrain.heightAt(c.x, c.z), `${c.part} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBeLessThan(0.6);
    }
    // Each stair's foot stands on the quay's top, a step up from it.
    const steps = corners('rh-ship').filter((c) => c.part === 'step');
    for (const c of steps) expect(c.y).toBeCloseTo(HB.floor, 1);
    expect(Math.min(...steps.map((c) => c.top))).toBeCloseTo(HB.floor + 0.36, 1);
  });

  it('keeps the yard dense: hard cover within a short sprint of anywhere in it', () => {
    const solids = map.solids.filter((s) => s.max[1] - s.min[1] > 1.6 && Math.hypot((s.min[0] + s.max[0]) / 2 - HB.x, (s.min[2] + s.max[2]) / 2 - HB.z) < 75);
    let worst = 0;
    for (let dx = -45; dx <= 45; dx += 5) {
      for (let dz = -45; dz <= 45; dz += 5) {
        if (Math.hypot(dx, dz) > 45) continue;
        const [x, z] = [HB.x + dx, HB.z + dz];
        const near = Math.min(...solids.map((s) => Math.hypot(Math.max(s.min[0] - x, 0, x - s.max[0]), Math.max(s.min[2] - z, 0, z - s.max[2]))));
        worst = Math.max(worst, near);
      }
    }
    expect(worst).toBeLessThan(10);
  });
});
