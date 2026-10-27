import { describe, expect, it } from 'vitest';
import { box, type Solid } from '@duty-shooter/fps-core';
import { layoutSurfaces } from '../src/surfaces';
import { FAR_GROUND, farGroundGeometry, groundUv, type Horizon } from '../src/world-details';

// Two ground tiles side by side and a crate on one: the inner edge has a vertex part-way along it.
const solids: Solid[] = [
  box({ min: [-10, -0.5, -10], max: [3, 0, 10], material: 'sand' }),
  box({ min: [3, -0.5, -10], max: [10, 0, 10], material: 'grass' }),
  box({ min: [-2, 0, -2], max: [2, 2, 2], material: 'wood' }),
];
const layout = layoutSurfaces(solids, { finishes: {}, looks: [], decorations: [], indoor: [] });
const horizon: Horizon = { ground: 'default:sand', inner: { x0: -10, x1: 10, z0: -10, z1: 10 }, light: [-8, -8] };

function triangles(): [number, number, number][][] {
  const p = farGroundGeometry(layout, horizon).getAttribute('position');
  const out: [number, number, number][][] = [];
  for (let i = 0; i < p.count; i += 3) out.push([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]));
  return out;
}

describe('the far ground', () => {
  it('covers everything from the map ground out to its edge, exactly once', () => {
    const area = triangles().reduce((sum, [a, b, c]) => sum + Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2, 0);
    expect(area).toBeCloseTo((2 * FAR_GROUND) ** 2 - 20 * 20, 0);
  });

  it('faces up, flat at y 0', () => {
    for (const [a, b, c] of triangles()) {
      expect([a[1], b[1], c[1]]).toEqual([0, 0, 0]);
      // y of (b - a) x (c - a)
      expect((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])).toBeGreaterThan(0);
    }
  });

  it('puts a vertex wherever the ground has one on the seam, so no crack opens there', () => {
    const seam = triangles()
      .flat()
      .filter((v) => Math.abs(Math.abs(v[2]) - 10) < 1e-9 && Math.abs(v[0]) <= 10);
    for (const x of [-10, 3, 10]) for (const z of [-10, 10]) expect(seam.some((v) => Math.abs(v[0] - x) < 1e-6 && v[2] === z)).toBe(true);
  });

  it('reads the lightmap texel of the ground under its light point', () => {
    const uv = groundUv(layout, -8, -8)!;
    const p = farGroundGeometry(layout, horizon).getAttribute('uv1');
    for (let i = 0; i < p.count; i++) expect([p.getX(i), p.getY(i)]).toEqual([Math.fround(uv[0]), Math.fround(uv[1])]);
    expect(groundUv(layout, 50, 50)).toBeNull();
  });
});
