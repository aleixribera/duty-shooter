import { describe, expect, it } from 'vitest';
import { Scene } from 'three/webgpu';
import { DETAIL_FADE, RingWall, detailOver, groundUnderRing, type RingGround } from '../src/ring-wall';

/** A hill rising to the east (x), with a lake to the south (z < -100) whose surface stands at 4 m. */
const hill: RingGround = {
  heightAt: (x) => Math.max(-6, x / 10),
  waterAbove: (_x, y, z) => (z < -100 ? 4 - y : -Infinity),
};

describe('the Ring wall’s foot glow', () => {
  it('sits on the ground under each column, the water over it, and never under the sea (ticket 44)', () => {
    const ring = { x: 0, z: 0, radius: 300 };
    const g = groundUnderRing(ring, hill);
    const columns = g.length / 2;
    // Column j stands at angle 2πj/segments: east (a quarter round) is on the hill, 30 m up.
    expect(g[(columns - 1) / 4]).toBeCloseTo(30, 3);
    // South (half round) is the lake's surface, not the ground under it.
    expect(g[(columns - 1) / 2]).toBeCloseTo(4, 3);
    // West, the ground dips under the sea: the glow stays at sea level.
    expect(g[((columns - 1) * 3) / 4]).toBe(0);
    // Both rows of a column share its height.
    for (let j = 0; j < columns; j++) expect(g[j + columns]).toBe(g[j]);
  });

  it('fills the wall’s own vertices with the ground under where each one stands, and follows the Ring', () => {
    const wall = new RingWall(new Scene(), hill);
    const check = (ring: { x: number; z: number; radius: number }) => {
      wall.update(ring, 0);
      const pos = wall.mesh.geometry.getAttribute('position');
      const ground = wall.mesh.geometry.getAttribute('ground');
      expect(ground.count).toBe(pos.count);
      for (let i = 0; i < pos.count; i += 37) {
        const x = ring.x + pos.getX(i) * ring.radius;
        const z = ring.z + pos.getZ(i) * ring.radius;
        const want = Math.max(0, hill.heightAt(x, z), hill.waterAbove(x, 0, z));
        expect(ground.getX(i)).toBeCloseTo(want, 3);
      }
    };
    check({ x: 0, z: 0, radius: 300 });
    check({ x: 120, z: -40, radius: 180 });
    wall.dispose();
  });

  it('stays at sea level on a map with no terrain, as before', () => {
    const wall = new RingWall(new Scene(), null);
    wall.update({ x: 0, z: 0, radius: 200 }, 0);
    const ground = wall.mesh.geometry.getAttribute('ground');
    for (let i = 0; i < ground.count; i++) expect(ground.getX(i)).toBe(0);
    wall.dispose();
  });
});

describe('the Ring wall in front of the sun (ticket 53)', () => {
  // The frame's bloom takes light past 1.6 for a highlight, and the sun shafts take the sky past 2.5 for the sun.
  const BLOOM_FROM = 1.6;
  // The wall's arcs at their brightest (the hot colour's luminance, 0.65, times an arc's 1.3, and its halo), over the curtain's usual light.
  const DETAIL = 0.91;
  const SHEET = 0.3;

  it('keeps all its detail over the open sky, and none over the sun’s glow and the lit cloud round it', () => {
    expect(detailOver(0)).toBe(1);
    expect(detailOver(DETAIL_FADE[0])).toBe(1);
    expect(detailOver(DETAIL_FADE[1])).toBe(0);
    expect(detailOver(3)).toBe(0);
    for (let s = 0; s < 3; s += 0.05) expect(detailOver(s + 0.05)).toBeLessThanOrEqual(detailOver(s));
  });

  it('never lifts the sky behind it into a highlight: the arcs can’t make the sun’s glow flicker', () => {
    // Wherever the sky and the sheet are short of a highlight, the detail doesn't make one.
    for (let s = 0; s + SHEET < BLOOM_FROM; s += 0.02) expect(s + SHEET + DETAIL * detailOver(s)).toBeLessThan(BLOOM_FROM);
  });
});
