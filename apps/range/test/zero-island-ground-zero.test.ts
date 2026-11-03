import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { DECORATION_TOLERANCE } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../src/map/maps';
import { GZ, GZ_KIT, GZ_PADS, GZ_PIECES, GZ_PLACED } from '../src/map/zero-island-ground-zero-plan';
import { instancesOf } from '../src/map/zero-island-kit';
import { regionAt } from '../src/map/zero-island-terrain';
import { readGlb } from './support/glb';

/**
 * Ground Zero, built (ticket 17): its plan's pieces stand on their pads, the
 * generator's look of each lies inside its boxes, and none of the cover pass's
 * grey is left in the Region.
 */

const map = buildMapById('zero-island');
const plants = map.plants!;
const terrain = new Terrain(map.terrain!);
const file = (path: string) => new URL(`../../../${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PLAN = file('tools/map/regions/ground-zero.json');
const GLB = file('apps/range/public/models/ground-zero.glb');

/** The plan as the Blender generator reads it: each piece's boxes, and the kit's unit models. */
const planJson = () =>
  `${JSON.stringify(
    {
      pieces: Object.fromEntries(Object.entries(GZ_PIECES).map(([name, p]) => [name, p.boxes.map((b) => ({ part: b.part, c: b.c, s: b.s, yaw: b.yaw ?? 0, material: b.material ?? 'concrete' }))])),
      kit: Object.fromEntries(Object.values(GZ_KIT).map((d) => [d.asset, d.fit])),
    },
    null,
    1,
  )}\n`;

const kitKinds = plants.kinds.filter((k) => k.url === 'models/ground-zero.glb');

describe('Zero Island: Ground Zero', () => {
  it('hands the Blender generator the plan as it is (UPDATE_KIT=1 writes it)', () => {
    if (process.env.UPDATE_KIT) writeFileSync(PLAN, planJson());
    expect(readFileSync(PLAN, 'utf8').replace(/\r\n/g, '\n')).toBe(planJson());
  });

  it('stands every piece on its pad, the ground levelled under it', () => {
    for (const p of GZ_PLACED) {
      const pad = GZ_PADS[p.pad]!;
      expect(Math.abs(p.x - pad.x) <= pad.halfX && Math.abs(p.z - pad.z) <= pad.halfZ, `${p.asset} at ${p.x},${p.z}`).toBe(true);
      if (pad.level !== null) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(pad.level, 1);
    }
    expect(terrain.heightAt(GZ.x, GZ.z)).toBeCloseTo(GZ.floor, 1);
  });

  it('leaves no grey cover in Ground Zero: every piece there wears a model', () => {
    const modelled = new Set(plants.modelled);
    const grey = map.looks.flatMap((look, i) => {
      if ((look?.side !== 'cover-ground-zero' && look?.side !== 'built-ground-zero') || modelled.has(i)) return [];
      const s = map.solids[i]!;
      return [`${i} at ${((s.min[0] + s.max[0]) / 2).toFixed(0)},${((s.min[2] + s.max[2]) / 2).toFixed(0)}`];
    });
    expect(grey).toEqual([]);
    // And something of the kit stands in it: a couple of hundred of its models.
    expect(kitKinds.reduce((n, k) => n + instancesOf(k).length, 0)).toBeGreaterThan(150);
  });

  it('draws only models the kit has, each with its cheaper one', () => {
    expect(existsSync(GLB)).toBe(true);
    const { assets } = readGlb(GLB);
    for (const k of kitKinds) {
      expect(k.built, k.asset).toBe(true);
      expect(assets.has(k.asset), k.asset).toBe(true);
      expect(assets.has(k.lod!), k.lod!).toBe(true);
    }
    for (const name of [...Object.keys(GZ_PIECES), ...Object.values(GZ_KIT).map((d) => d.asset)]) expect(assets.has(name), name).toBe(true);
  });

  it("builds each piece's look inside its boxes, what's seen being what stops a bullet", () => {
    const { assets } = readGlb(GLB);
    for (const [name, piece] of Object.entries(GZ_PIECES)) {
      for (const asset of [name, `${name}-lod`]) {
        let worst = 0;
        for (const [x, y, z] of assets.get(asset)!.vertices) {
          const d = Math.min(
            ...piece.boxes.map((b) => {
              const yaw = b.yaw ?? 0;
              const [dx, dy, dz] = [x - b.c[0], y - b.c[1], z - b.c[2]];
              // Into the box's frame: its +x looks along (cos yaw, 0, -sin yaw).
              const u = dx * Math.cos(yaw) - dz * Math.sin(yaw);
              const w = dx * Math.sin(yaw) + dz * Math.cos(yaw);
              return Math.hypot(Math.max(Math.abs(u) - b.s[0] / 2, 0), Math.max(Math.abs(dy) - b.s[1] / 2, 0), Math.max(Math.abs(w) - b.s[2] / 2, 0));
            }),
          );
          worst = Math.max(worst, d);
        }
        expect(worst, asset).toBeLessThanOrEqual(DECORATION_TOLERANCE);
      }
    }
  });

  it("builds the kit's models for the cover pass inside a unit box, scaled to each piece's solid", () => {
    const { assets } = readGlb(GLB);
    for (const d of Object.values(GZ_KIT)) {
      for (const asset of [d.asset, `${d.asset}-lod`]) {
        const out = assets.get(asset)!.vertices.filter(([x, y, z]) => Math.abs(x) > 0.5 + 1e-3 || Math.abs(z) > 0.5 + 1e-3 || y < -1e-3 || y > 1 + 1e-3);
        expect(out.length, asset).toBe(0);
      }
    }
  });

  it('stands its built pieces in Ground Zero', () => {
    for (const p of GZ_PLACED) expect(regionAt(p.x, p.z), `${p.asset} at ${p.x},${p.z}`).toBe('ground-zero');
  });
});
