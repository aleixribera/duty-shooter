import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { buildMapById } from '../src/map/maps';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';
import { placeBox } from '../src/map/zero-island-region';
import { FB, FB_PIECES, FB_PLACED } from '../src/map/zero-island-frostbite-plan';
import { SUMMIT, SUMMIT_RADIUS } from '../src/map/zero-island-terrain';
import { regionKitSuite } from './support/region-kit';

/**
 * Frostbite Peaks, built (ticket 21): the radar base on the plateau, the
 * watchtower and the stopped cableway, with every piece of cover there
 * wearing a model.
 */

const kit = ZERO_ISLAND_KITS.find((k) => k.region === 'frostbite-peaks')!;
regionKitSuite(kit, 'frostbite', 40);

describe('Zero Island: Frostbite Peaks', () => {
  const map = buildMapById('zero-island');
  const terrain = new Terrain(map.terrain!);
  const count = (asset: string) => FB_PLACED.filter((p) => p.asset === asset).length;

  it('stands the ops building, two barracks, the radome, the dish, the watchtower and the cableway on the plateau', () => {
    expect(['fb-ops', 'fb-barracks', 'fb-radome', 'fb-dish', 'fb-tower', 'fb-cableway'].map(count)).toEqual([1, 2, 1, 1, 1, 1]);
    for (const p of FB_PLACED) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(FB.floor, 1);
  });

  it('climbs every stair a step at a time, to the roof, the plinth, the cabin and the platform', () => {
    const cases = [
      ['fb-ops', 'step', 4.3],
      ['fb-radome', 'step', 1.6],
      ['fb-tower', 'tread', 6],
      ['fb-cableway', 'step', 1],
    ] as const;
    for (const [asset, part, top] of cases) {
      const steps = FB_PIECES[asset].boxes.filter((b) => b.part === part).sort((a, b) => a.c[1] + a.s[1] / 2 - (b.c[1] + b.s[1] / 2));
      let below = 0;
      for (const s of steps) {
        const up = s.c[1] + s.s[1] / 2;
        expect(up - below, `${asset} step at ${s.c[0]}`).toBeLessThanOrEqual(0.4 + 1e-9);
        expect(s.s[2], `${asset} stair width`).toBeGreaterThanOrEqual(2.3);
        below = up;
      }
      expect(below, asset).toBeCloseTo(top, 5);
    }
  });

  it("hangs the cableway's rope level from the station's wheel to the pylon's, its stopped car clear of a body below", () => {
    const boxes = FB_PIECES['fb-cableway'].boxes;
    const ropes = boxes.filter((b) => b.part === 'rope');
    const wheels = boxes.filter((b) => b.part === 'wheel');
    expect(ropes).toHaveLength(2);
    for (const rope of ropes) {
      for (const end of [-1, 1]) {
        const x = rope.c[0] + (end * rope.s[0]) / 2;
        expect(wheels.some((w) => Math.abs(x - w.c[0]) <= w.s[0] / 2 + 1e-6 && Math.abs(rope.c[2]) <= w.s[2] / 2 && Math.abs(rope.c[1] - w.c[1]) <= w.s[1] / 2)).toBe(true);
      }
    }
    const hanging = boxes.filter((b) => b.part === 'car').find((b) => b.c[0] > -10)!;
    expect(hanging.c[1] - hanging.s[1] / 2).toBeGreaterThan(2.2);
  });

  it('keeps the summit out of the base: every piece stands short of the cliff', () => {
    for (const p of FB_PLACED) {
      for (const b of FB_PIECES[p.asset as keyof typeof FB_PIECES].boxes) {
        const { center } = placeBox(b, p.x, FB.floor, p.z, p.yaw);
        expect(Math.hypot(center[0] - SUMMIT.x, center[2] - SUMMIT.z), `${p.asset} ${b.part}`).toBeGreaterThan(SUMMIT_RADIUS + 10);
      }
    }
  });

  it('keeps the base dense: hard cover within a short sprint of anywhere in it', () => {
    const solids = map.solids.filter((s) => s.max[1] - s.min[1] > 1.6 && Math.hypot((s.min[0] + s.max[0]) / 2 - FB.x, (s.min[2] + s.max[2]) / 2 - FB.z) < 70);
    let worst = 0;
    let where = '';
    for (let dx = -45; dx <= 45; dx += 5) {
      for (let dz = -45; dz <= 45; dz += 5) {
        if (Math.hypot(dx, dz) > 45) continue;
        const [x, z] = [FB.x + dx, FB.z + dz];
        const near = Math.min(...solids.map((s) => Math.hypot(Math.max(s.min[0] - x, 0, x - s.max[0]), Math.max(s.min[2] - z, 0, z - s.max[2]))));
        if (near > worst) [worst, where] = [near, `${dx},${dz}`];
      }
    }
    expect(worst, where).toBeLessThan(10);
  });
});
