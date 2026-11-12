import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { InstancedBufferAttribute, InstancedMesh, PerspectiveCamera, Scene } from 'three/webgpu';
import { Effects } from '../src/effects';
import { ambientScale, ambientTint, OPEN_AMBIENT, type ProbeField } from '../src/surface-materials';

// Effects' decal textures can be empty in this non-rendering check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterAll(() => vi.unstubAllGlobals());

/** A probe grid that reads `ambient` everywhere. */
const probesOf = (ambient: Vec3 | null) => ({ sample: () => (ambient ? { ambient, sun: 0 } : null) }) as unknown as ProbeField;

/** Every live puff's light multiplier, from the layers that have any. */
const puffLight = (scene: Scene): Vec3[] => {
  const out: Vec3[] = [];
  scene.traverse((o) => {
    if (!(o instanceof InstancedMesh) || !o.visible) return;
    const a = o.geometry.getAttribute('pAmbient') as InstancedBufferAttribute | undefined;
    if (!a) return;
    for (let i = 0; i < o.count; i++) out.push([a.getX(i), a.getY(i), a.getZ(i)]);
  });
  return out;
};

describe('smoke lit by the light round it', () => {
  it('is lit as on open ground with no probes, and on open ground', () => {
    expect(ambientTint(null)).toEqual([1, 1, 1]);
    const open = ambientTint({ ambient: [OPEN_AMBIENT, OPEN_AMBIENT, OPEN_AMBIENT] });
    for (const c of open) expect(c).toBeCloseTo(1, 5);
  });

  it("takes a dark room's dim, warm light, with the walls' fill so it doesn't go black", () => {
    const room: Vec3 = [0.06, 0.045, 0.03];
    const tint = ambientTint({ ambient: room });
    expect(ambientScale({ ambient: room })).toBeGreaterThan(0.4);
    expect(ambientScale({ ambient: room })).toBeLessThan(0.7);
    expect(tint[0]).toBeGreaterThan(tint[2]);
    expect(Math.max(...tint)).toBeLessThan(1);
  });

  it('is capped in a bright spot', () => {
    expect(ambientScale({ ambient: [3, 3, 3] })).toBe(1.2);
    for (const c of ambientTint({ ambient: [3, 3, 3] })) expect(c).toBe(1.2);
  });

  // Second-opinion review: a buried probe reading black gave black smoke, and a near-black blue one blew blue up to ~6.
  it('gives a black probe the warm fill, and a near-black blue one no runaway channel', () => {
    const black = ambientTint({ ambient: [0, 0, 0] });
    expect(Math.min(...black)).toBeGreaterThan(0.3);
    expect(black[0]).toBeGreaterThan(black[2]);
    for (const c of ambientTint({ ambient: [0, 0, 0.01] })) expect(c).toBeLessThanOrEqual(1.2);
  });

  // Review 2026-11-12d: muzzle smoke indoors was a pale blue cloud in a dim beige room, lit by the open sky.
  it("gives a burst's muzzle smoke indoors the room's light, and outdoors the sky's", () => {
    for (const [probe, check] of [
      [[0.06, 0.045, 0.03], (c: Vec3) => expect(c[0]).toBeLessThan(0.8)],
      [null, (c: Vec3) => expect(c).toEqual([1, 1, 1])],
    ] as const) {
      const scene = new Scene();
      const effects = new Effects(scene, createWorld([]));
      effects.probes = probesOf(probe as Vec3 | null);
      for (let i = 0; i < 20; i++) effects.shot([0, 1.6, 0], [0, 0, -1], 'm4a1');
      effects.update(1 / 60, new PerspectiveCamera());
      const lights = puffLight(scene);
      expect(lights.length).toBeGreaterThan(5);
      for (const c of lights) check(c);
      effects.dispose();
    }
  });
});
