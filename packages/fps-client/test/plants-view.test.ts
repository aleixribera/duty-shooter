import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, MeshBasicNodeMaterial, StaticDrawUsage } from 'three/webgpu';
import { KindView, MIN_SLOTS } from '../src/plants-view';
import { PLANT_STRIDE, type PlantKind } from '../src/surfaces';

/** Plants in a row along x, one every `step` m from the origin. */
function row(count: number, step: number): Float32Array {
  const data = new Float32Array(count * PLANT_STRIDE);
  for (let i = 0; i < count; i++) data.set([i * step, 0, 0, 0, 1, 1, 1, 0x808080, 0], i * PLANT_STRIDE);
  return data;
}

const triangle = () => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  return g;
};

const bushes = (instances: Float32Array): PlantKind => ({ asset: 'bush', lod: 'bush-lod', near: 20, far: 100, thin: false, sway: 0, instances });
const view = (kind: PlantKind) => new KindView(kind, triangle, () => new MeshBasicNodeMaterial());

describe('plants view', () => {
  it('draws the full model near, the cheap one out to far, and nothing past it', () => {
    const k = view(bushes(row(30, 10)));
    k.fill(0, 0, 0);
    // 0..20 m in full (3), 30..100 m cheap (8), the rest out of range.
    expect(k.near.mesh.count).toBe(3);
    expect(k.lod!.mesh.count).toBe(8);
  });

  it('counts height in the distance: from high up, less is near', () => {
    const k = view(bushes(row(30, 10)));
    k.fill(0, 50, 0);
    expect(k.near.mesh.count).toBe(0);
    // Within 100 m of a camera 50 m up: x up to 86 m.
    expect(k.lod!.mesh.count).toBe(9);
  });

  it('reaches as much farther through a scope as it magnifies', () => {
    const k = view(bushes(row(60, 10)));
    k.fill(0, 0, 0, 4);
    expect(k.near.mesh.count).toBe(9);
    // Near out to 80 m (9), cheap out to 400 m (32 more).
    expect(k.lod!.mesh.count).toBe(32);
  });

  it('refills after a few steps, or at once when the zoom changes', () => {
    const k = view(bushes(row(30, 10)));
    k.follow(0, 0, 0, 1);
    expect(k.near.mesh.count).toBe(3);
    k.follow(3, 0, 0, 1);
    expect(k.near.mesh.count).toBe(3);
    k.follow(0, 0, 0, 2);
    expect(k.near.mesh.count).toBe(5);
  });

  it('uploads only the slots in use', () => {
    const k = view(bushes(row(30, 10)));
    k.fill(0, 0, 0);
    expect(k.lod!.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 8 * 16 }]);
  });
});

describe('plants view: buffers', () => {
  it('keeps even a rare kind past the uniform-buffer size, so its matrices upload only on a refill', () => {
    const k = view(bushes(row(5, 10)));
    expect(k.near.mesh.instanceMatrix.count).toBeGreaterThanOrEqual(MIN_SLOTS);
    expect(MIN_SLOTS * 16 * 4).toBeGreaterThan(65536);
  });
});

describe('plants view: usage', () => {
  it('keeps every per-plant buffer static: three uploads a dynamic one on every draw', () => {
    const k = view(bushes(row(5, 10)));
    for (const level of [k.near, k.lod!]) {
      expect(level.mesh.instanceMatrix.usage).toBe(StaticDrawUsage);
      expect((level.mesh.geometry.getAttribute('plantExtra') as BufferAttribute).usage).toBe(StaticDrawUsage);
      expect((level.mesh.geometry.getAttribute('plantTint') as BufferAttribute).usage).toBe(StaticDrawUsage);
    }
  });
});
