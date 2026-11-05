import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Terrain } from '@duty-shooter/fps-core';
import { DECORATION_TOLERANCE } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../../src/map/maps';
import { instancesOf, type RegionKit } from '../../src/map/zero-island-kit';
import { regionAt } from '../../src/map/zero-island-terrain';
import { readGlb } from './glb';

/**
 * What every built Region holds to (ticket 17's pattern, `zero-island-region.ts`),
 * for a Region's own test file: the plan handed to Blender as it is, each
 * piece on its pad in its Region, no grey left there, and every model drawn
 * inside its boxes.
 */

const file = (path: string) => new URL(`../../../../${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** The plan as a Region's Blender generator reads it: each piece's boxes, and the kit's unit models. */
export const planJson = (kit: Pick<RegionKit, 'pieces' | 'dress'>) =>
  `${JSON.stringify(
    {
      pieces: Object.fromEntries(Object.entries(kit.pieces).map(([name, p]) => [name, p.boxes.map((b) => ({ part: b.part, c: b.c, s: b.s, yaw: b.yaw ?? 0, material: b.material ?? 'concrete' }))])),
      kit: Object.fromEntries(Object.values(kit.dress).map((d) => [d.asset, d.fit])),
    },
    null,
    1,
  )}\n`;

/** Metres from a point to a turned box (0 inside it). */
function toBox(x: number, y: number, z: number, b: { c: readonly number[]; s: readonly number[]; yaw?: number }): number {
  const yaw = b.yaw ?? 0;
  const [dx, dy, dz] = [x - b.c[0]!, y - b.c[1]!, z - b.c[2]!];
  // Into the box's frame: its +x looks along (cos yaw, 0, -sin yaw).
  const u = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const w = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.hypot(Math.max(Math.abs(u) - b.s[0]! / 2, 0), Math.max(Math.abs(dy) - b.s[1]! / 2, 0), Math.max(Math.abs(w) - b.s[2]! / 2, 0));
}

/** The shared checks of a built Region: `name` the kit's files' (tools/map/regions/<name>.json, models/<name>.glb). */
export function regionKitSuite(kit: RegionKit, name: string, least: number): void {
  const map = buildMapById('zero-island');
  const plants = map.plants!;
  const terrain = new Terrain(map.terrain!);
  const PLAN = file(`tools/map/regions/${name}.json`);
  const GLB = file(`apps/range/public/models/${name}.glb`);
  const kitKinds = plants.kinds.filter((k) => k.url === kit.url);

  describe(`Zero Island: ${kit.region}'s kit`, () => {
    it('hands the Blender generator the plan as it is (UPDATE_KIT=1 writes it)', () => {
      if (process.env.UPDATE_KIT) writeFileSync(PLAN, planJson(kit));
      expect(readFileSync(PLAN, 'utf8').replace(/\r\n/g, '\n')).toBe(planJson(kit));
    });

    it('stands every piece on its pad in its Region, the ground levelled under it', () => {
      for (const p of kit.placed) {
        const pad = kit.pads[p.pad]!;
        expect(Math.abs(p.x - pad.x) <= pad.halfX && Math.abs(p.z - pad.z) <= pad.halfZ, `${p.asset} at ${p.x},${p.z}`).toBe(true);
        if (pad.level !== null) expect(terrain.heightAt(p.x, p.z), p.asset).toBeCloseTo(pad.level, 1);
        expect(regionAt(p.x, p.z), `${p.asset} at ${p.x},${p.z}`).toBe(kit.region);
      }
      for (const e of kit.extra ?? []) expect(regionAt(e.x, e.z), `${e.kind} at ${e.x},${e.z}`).toBe(kit.region);
    });

    it(`leaves no grey cover in ${kit.region}: every piece there wears a model`, () => {
      const modelled = new Set(plants.modelled);
      const grey = map.looks.flatMap((look, i) => {
        if ((look?.side !== `cover-${kit.region}` && look?.side !== `built-${kit.region}`) || modelled.has(i)) return [];
        const s = map.solids[i]!;
        return [`${i} at ${((s.min[0] + s.max[0]) / 2).toFixed(0)},${((s.min[2] + s.max[2]) / 2).toFixed(0)}`];
      });
      expect(grey).toEqual([]);
      expect(kitKinds.reduce((n, k) => n + instancesOf(k).length, 0)).toBeGreaterThan(least);
    });

    it('draws only models the kit has, each with its cheaper one', () => {
      expect(existsSync(GLB)).toBe(true);
      const { assets } = readGlb(GLB);
      for (const k of kitKinds) {
        expect(k.built, k.asset).toBe(true);
        expect(assets.has(k.asset), k.asset).toBe(true);
        expect(assets.has(k.lod!), k.lod!).toBe(true);
      }
      for (const asset of [...Object.keys(kit.pieces), ...Object.values(kit.dress).map((d) => d.asset)]) expect(assets.has(asset), asset).toBe(true);
    });

    it("builds each piece's look inside its boxes, what's seen being what stops a bullet", () => {
      const { assets } = readGlb(GLB);
      for (const [piece, { boxes }] of Object.entries(kit.pieces)) {
        for (const asset of [piece, `${piece}-lod`]) {
          let worst = 0;
          for (const [x, y, z] of assets.get(asset)!.vertices) worst = Math.max(worst, Math.min(...boxes.map((b) => toBox(x, y, z, b))));
          expect(worst, asset).toBeLessThanOrEqual(DECORATION_TOLERANCE);
        }
      }
    });

    it("builds the kit's models for the cover pass inside a unit box, scaled to each piece's solid", () => {
      const { assets } = readGlb(GLB);
      for (const d of Object.values(kit.dress)) {
        for (const asset of [d.asset, `${d.asset}-lod`]) {
          const out = assets.get(asset)!.vertices.filter(([x, y, z]) => Math.abs(x) > 0.5 + 1e-3 || Math.abs(z) > 0.5 + 1e-3 || y < -1e-3 || y > 1 + 1e-3);
          expect(out.length, asset).toBe(0);
        }
      }
    });
  });
}
