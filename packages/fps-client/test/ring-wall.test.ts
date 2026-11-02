import { describe, expect, it } from 'vitest';
import { Scene } from 'three/webgpu';
import { RingWall, groundUnderRing, type RingGround } from '../src/ring-wall';

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
