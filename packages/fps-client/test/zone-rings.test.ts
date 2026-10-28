import { describe, expect, it } from 'vitest';
import type { Zone, ZoneState } from '@duty-shooter/fps-core';
import { Box3, Mesh, Scene } from 'three/webgpu';
import { ZoneRings, ringLook } from '../src/zone-rings';

const ZONES: readonly Zone[] = [
  { id: 'A', name: 'West lawn', center: [-16, 0, 0], radius: 4, height: 3 },
  { id: 'B', name: 'Street end', center: [13, 0.5, 0], radius: 3.5, height: 3 },
];
const state = (id: string, s: Partial<ZoneState> = {}): ZoneState => ({ id, owner: 0, capturing: 0, progress: 0, contested: false, ...s });

describe('the zone rings', () => {
  it('is grey while nobody holds a zone, and the holder’s HUD colour once one does', () => {
    expect(ringLook(state('A'))).toEqual({ owner: 0xc9ccd1, taker: 0xc9ccd1, progress: 0 });
    expect(ringLook(state('A', { owner: 1 })).owner).toBe(0x3d8bff);
    expect(ringLook(state('A', { owner: 2 })).owner).toBe(0xff9a3c);
  });

  it('sweeps the taking team’s colour round as far as the capture has got', () => {
    expect(ringLook(state('A', { capturing: 1, progress: 0.4 }))).toEqual({ owner: 0xc9ccd1, taker: 0x3d8bff, progress: 0.4 });
    expect(ringLook(state('A', { owner: 1, capturing: 2, progress: 0.7 }))).toEqual({ owner: 0x3d8bff, taker: 0xff9a3c, progress: 0.7 });
  });

  it('covers each zone’s capture circle, round its floor, and shows only with an Outposts state', () => {
    const scene = new Scene();
    const rings = new ZoneRings(scene, ZONES);
    const meshes = scene.children.filter((c): c is Mesh => c instanceof Mesh);
    expect(meshes).toHaveLength(2);
    for (const [i, zone] of ZONES.entries()) {
      const box = new Box3().setFromObject(meshes[i]!);
      expect((box.max.x - box.min.x) / 2).toBeCloseTo(zone.radius + 0.1, 1);
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(zone.center[0], 5);
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(zone.center[2], 5);
      expect(box.min.y).toBeLessThan(zone.center[1]);
      expect(box.max.y).toBeGreaterThan(zone.center[1]);
    }
    expect(meshes.every((m) => !m.visible)).toBe(true);
    rings.update([state('A'), state('B', { owner: 2 })], 0);
    expect(meshes.every((m) => m.visible)).toBe(true);
    rings.update([state('B')], 0);
    expect(meshes.map((m) => m.visible)).toEqual([false, true]);
    rings.update(null, 0);
    expect(meshes.some((m) => m.visible)).toBe(false);
    rings.dispose();
    expect(scene.children.filter((c) => c instanceof Mesh)).toHaveLength(0);
  });
});
