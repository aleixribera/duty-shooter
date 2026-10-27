import { describe, expect, it } from 'vitest';
import { createWorld, raycastWorld, type Vec3 } from '@duty-shooter/fps-core';
import { LIGHTING, finishTable } from '@duty-shooter/fps-client/surfaces';
import { MAP_IDS, buildMapById, mapSolids } from '../src/map/maps';

for (const id of MAP_IDS) {
  const map = buildMapById(id);
  const solids = mapSolids(map);
  const { inner, light } = map.horizon;
  // The map's own ground: drawn, shootable boxes whose tops are at y 0.
  const ground = solids.filter((s) => !s.orientation && s.blocks === 'both' && s.max[1] === 0 && s.min[1] < 0);
  const groundAt = (x: number, z: number) => ground.some((s) => s.min[0] <= x && x <= s.max[0] && s.min[2] <= z && z <= s.max[2]);

  describe(`${id}: the far ground`, () => {
    it("wears one of the map's finishes", () => {
      expect(finishTable({ finishes: map.finishes, looks: [], decorations: [], indoor: [] })[map.horizon.ground]).toBeDefined();
    });

    it('meets the map ground all the way round its edge, with no gap', () => {
      const gaps: [number, number][] = [];
      const e = 0.05;
      for (let x = inner.x0 + e; x < inner.x1; x += 0.5) {
        for (const z of [inner.z0 + e, inner.z1 - e]) if (!groundAt(x, z)) gaps.push([x, z]);
      }
      for (let z = inner.z0 + e; z < inner.z1; z += 0.5) {
        for (const x of [inner.x0 + e, inner.x1 - e]) if (!groundAt(x, z)) gaps.push([x, z]);
      }
      expect(gaps).toEqual([]);
    });

    it('never lies under the map ground, so the two never fight', () => {
      const e = 1e-9;
      expect(ground.filter((s) => s.min[0] < inner.x0 - e || s.max[0] > inner.x1 + e || s.min[2] < inner.z0 - e || s.max[2] > inner.z1 + e)).toEqual([]);
    });

    it('takes its light from open ground that sees the sun', () => {
      expect(groundAt(light[0], light[1])).toBe(true);
      const from: Vec3 = [light[0], 0.01, light[1]];
      const d = LIGHTING.sunDirection;
      expect(raycastWorld(createWorld(solids), from, [from[0] + d[0] * 400, from[1] + d[1] * 400, from[2] + d[2] * 400])).toBeNull();
    });
  });
}
