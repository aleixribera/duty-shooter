import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { buildMapById } from '../src/map/maps';
import { ZERO_ISLAND_KITS } from '../src/map/zero-island';
import { placeBox } from '../src/map/zero-island-region';
import { MJ, MJ_EXTRA, MJ_PIECES, MJ_PLACED } from '../src/map/zero-island-jungle-plan';
import { zeroIslandGround } from '../src/map/zero-island-terrain';
import { regionKitSuite } from './support/region-kit';

/**
 * Mutant Jungle, built (ticket 22): the clearing round the giant tree, the
 * temple's ruins, the crystals and the camp by the stream's spring, with
 * every piece of cover there wearing a model.
 */

const kit = ZERO_ISLAND_KITS.find((k) => k.region === 'mutant-jungle')!;
regionKitSuite(kit, 'jungle', 40);

describe('Zero Island: Mutant Jungle', () => {
  const map = buildMapById('zero-island');
  const terrain = new Terrain(map.terrain!);
  const count = (asset: string) => MJ_PLACED.filter((p) => p.asset === asset).length;
  const placed = MJ_PLACED.flatMap((p) => MJ_PIECES[p.asset as keyof typeof MJ_PIECES].boxes.map((b) => ({ asset: p.asset, part: b.part, ...placeBox(b, p.x, MJ.floor, p.z, p.yaw) })));

  it('stands the giant tree, the temple, two gateways, the colonnade, three crystal outcrops and the camp in the clearing', () => {
    expect(['mj-tree', 'mj-temple', 'mj-arch', 'mj-colonnade', 'mj-crystals', 'mj-camp'].map(count)).toEqual([1, 1, 2, 1, 3, 1]);
    for (const p of MJ_PLACED) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(MJ.floor, 1);
  });

  it('climbs the temple and the camp a step at a time, to the plinth and the deck', () => {
    for (const [asset, part, top] of [['mj-temple', 'step', 1.2], ['mj-camp', 'stair', 2.9]] as const) {
      const steps = MJ_PIECES[asset].boxes.filter((b) => b.part === part).sort((a, b) => a.c[1] + a.s[1] / 2 - (b.c[1] + b.s[1] / 2));
      let below = 0;
      for (const s of steps) {
        const up = s.c[1] + s.s[1] / 2;
        expect(up - below, `${asset} step at ${s.c[0]}`).toBeLessThanOrEqual(0.4 + 1e-9);
        expect(s.s[2], `${asset} stair width`).toBeGreaterThanOrEqual(2.4);
        below = up;
      }
      expect(below, asset).toBeCloseTo(top, 5);
    }
  });

  it('keeps the stream clear to wade: nothing built stands in it', () => {
    const stream = zeroIslandGround().stream;
    const clear = (x: number, z: number, r: number) => stream.every((p) => Math.hypot(p.x - x, p.z - z) > 5 + r);
    for (const b of placed) expect(clear(b.center[0], b.center[2], Math.hypot(b.size[0], b.size[2]) / 2), `${b.asset} ${b.part}`).toBe(true);
    for (const e of MJ_EXTRA) expect(clear(e.x, e.z, Math.hypot(e.width, e.depth) / 2), `${e.kind} at ${e.x},${e.z}`).toBe(true);
  });

  it('keeps the clearing dense: hard cover within a short sprint of anywhere in it', () => {
    const solids = map.solids.filter((s) => s.max[1] - s.min[1] > 1.6 && Math.hypot((s.min[0] + s.max[0]) / 2 - MJ.x, (s.min[2] + s.max[2]) / 2 - MJ.z) < 70);
    let worst = 0;
    let where = '';
    for (let dx = -45; dx <= 45; dx += 5) {
      for (let dz = -45; dz <= 45; dz += 5) {
        if (Math.hypot(dx, dz) > 45) continue;
        const [x, z] = [MJ.x + dx, MJ.z + dz];
        const near = Math.min(...solids.map((s) => Math.hypot(Math.max(s.min[0] - x, 0, x - s.max[0]), Math.max(s.min[2] - z, 0, z - s.max[2]))));
        if (near > worst) [worst, where] = [near, `${dx},${dz}`];
      }
    }
    expect(worst, where).toBeLessThan(10);
  });
});
