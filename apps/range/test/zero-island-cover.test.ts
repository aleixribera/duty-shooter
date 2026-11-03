import { describe, expect, it } from 'vitest';
import { Terrain, type Solid } from '@duty-shooter/fps-core';
import { buildMapById, insidePolygon } from '../src/map/maps';
import { buildZeroIsland } from '../src/map/zero-island';
import { BRIDGES, REGION_IDS, regionAt, zeroIslandGround } from '../src/map/zero-island-terrain';

const map = buildMapById('zero-island');
const terrain = new Terrain(map.terrain!);
const drawn = (finish: string) => map.solids.filter((_, i) => map.looks[i]?.side === finish);
const middle = (s: Solid) => [(s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2] as const;

describe('Zero Island: its cover', () => {
  it('comes out the same every time', () => {
    expect(JSON.stringify(buildZeroIsland().solids)).toBe(JSON.stringify(map.solids));
  });

  it('gives every Region its share of solids, each drawn in its own finish', () => {
    for (const id of REGION_IDS) expect(drawn(`cover-${id}`).length, id).toBeGreaterThan(300);
  });

  it('sits in the Region it was placed for', () => {
    for (const id of REGION_IDS) {
      const pieces = drawn(`cover-${id}`);
      const away = pieces.filter((s) => regionAt(...middle(s)) !== id);
      expect(away.length, id).toBeLessThan(pieces.length * 0.03);
    }
  });

  it('never floats: every piece on the land reaches below the ground under it', () => {
    for (const id of REGION_IDS) {
      const pieces = drawn(`cover-${id}`);
      // A rock's ledge may stand out over the block under it (ticket 63): it rests on that, not on the ground.
      const resting = (s: Solid) => pieces.some((o) => o !== s && o.min[1] < s.min[1] && o.max[1] >= s.min[1] - 0.01 && o.min[0] < s.max[0] && o.max[0] > s.min[0] && o.min[2] < s.max[2] && o.max[2] > s.min[2]);
      for (const s of pieces) {
        const [x, z] = middle(s);
        if (s.min[1] > terrain.heightAt(x, z)) expect(resting(s), `${x},${z}`).toBe(true);
      }
    }
  });

  it('leaves the middle of every road open', () => {
    for (const line of zeroIslandGround().roads) {
      for (const p of line) {
        const hit = map.solids.filter((s) => !s.orientation && s.max[1] > p.y + 1 && s.min[1] < p.y + 1.8 && s.min[0] < p.x + 0.5 && s.max[0] > p.x - 0.5 && s.min[2] < p.z + 0.5 && s.max[2] > p.z - 0.5);
        expect(hit, `${p.x},${p.z}`).toEqual([]);
      }
    }
  });

  it('leaves a clear way down the middle of every bridge', () => {
    for (const b of BRIDGES) {
      const [dx, dz] = [b.to[0] - b.from[0], b.to[1] - b.from[1]];
      const off = (s: Solid) => {
        const [x, z] = middle(s);
        return Math.abs((x - b.from[0]) * dz - (z - b.from[1]) * dx) / Math.hypot(dx, dz);
      };
      const along = (s: Solid) => {
        const [x, z] = middle(s);
        return ((x - b.from[0]) * dx + (z - b.from[1]) * dz) / (dx * dx + dz * dz);
      };
      const pieces = drawn('cover-sea').filter((s) => along(s) > 0 && along(s) < 1 && off(s) < b.width / 2 && s.max[1] < b.deck + 2);
      expect(pieces.length, b.name).toBeGreaterThan(3);
      for (const s of pieces) expect(off(s), b.name).toBeGreaterThan(b.width / 2 - 1.2);
    }
  });

  it('stands nothing on a spawn', () => {
    for (const { position: [x, y, z] } of map.spawns.ffa) {
      const on = map.solids.filter((s) => s.min[0] < x + 1 && s.max[0] > x - 1 && s.min[2] < z + 1 && s.max[2] > z - 1 && s.max[1] > y + 0.5);
      expect(on, `${x},${z}`).toEqual([]);
      expect(insidePolygon(map.playArea!, x, z)).toBe(true);
    }
  });
});
