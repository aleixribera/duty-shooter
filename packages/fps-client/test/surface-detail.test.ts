import { describe, expect, it } from 'vitest';
import { box } from '@duty-shooter/fps-core';
import { SCATTER_FINISHES, layoutSurfaces, scatterPlacements, type Scatter, type SurfaceSpec } from '@duty-shooter/fps-client/surfaces';
import { cornerEdges, openEdges } from '../src/surfaces/edges';

const finishes = { dirt: { family: 'dirt', color: 0xb9925f }, road: { family: 'asphalt', color: 0x746e61 }, wall: { family: 'plaster', color: 0xcccccc } } as const;
const spec = (looks: SurfaceSpec['looks']): SurfaceSpec => ({ finishes, looks, decorations: [], indoor: [] });

describe('open edges', () => {
  // One wall in two boxes, its plane z = 0.
  const pieces = [box({ min: [0, 0, -0.2], max: [2, 3, 0], material: 'concrete' }), box({ min: [2, 0, -0.2], max: [4, 3, 0], material: 'concrete' })];
  const { faces } = layoutSurfaces(pieces, spec([{ side: 'wall' }, { side: 'wall' }]));
  const open = openEdges(faces);
  const front = faces.findIndex((f) => f.solid === 0 && f.normal[2] === 1);
  /** The distance to the nearer open end of the wall's first piece, at `x` along it. */
  const toOpenEnd = (x: number) => {
    const f = faces[front]!;
    const alongU = Math.abs(f.u[0]) > 0;
    const k = (x - f.origin[0]) / (alongU ? f.u[0] : f.v[0]);
    const [end0, end1] = cornerEdges(f, open[front]!, alongU ? k : 0.5, alongU ? 0.5 : k);
    return Math.min(end0, end1);
  };

  it('measures from where the wall really stops', () => {
    expect(toOpenEnd(0.1)).toBeCloseTo(0.1);
  });

  it('closes the edge where the wall carries on in the next box', () => {
    // 10 cm from the joint, but the open end is 1.9 m away the other way.
    expect(toOpenEnd(1.9)).toBeCloseTo(1.9);
  });

  it('gives faces that are not walls no open edges', () => {
    expect(open[faces.findIndex((f) => f.normal[1] === 1)]).toBe(0);
  });
});

describe('scatter', () => {
  const ground = box({ min: [-20, -0.5, -20], max: [20, 0, 20], material: 'dirt' });
  const road = box({ min: [-20, 0, -2], max: [20, 0.01, 2], material: 'asphalt' });
  const house = box({ min: [4, 0, 4], max: [10, 3, 10], material: 'concrete' });
  const awning = box({ min: [-10, 2.5, 6], max: [-6, 2.6, 10], material: 'wood' });
  const solids = [ground, road, house, awning];
  const { faces } = layoutSurfaces(solids, spec([{ side: 'dirt', top: 'dirt' }, { side: 'road', top: 'road' }, { side: 'wall' }, { side: 'wall' }]));
  const scatter: Scatter = { on: ['dirt'], within: { x0: -20, x1: 20, z0: -20, z1: 20 }, open: 120, walls: 80, seed: 5 };
  const placed = scatterPlacements(faces, solids, scatter);

  it('lays every piece it was asked for, visual only', () => {
    expect(placed).toHaveLength(200);
    expect(placed.every((p) => p.visualOnly && p.solids.length === 0)).toBe(true);
  });

  it('is the same every time', () => {
    expect(scatterPlacements(faces, solids, scatter)).toEqual(placed);
  });

  it('keeps off other finishes, out from under roofs and out of solids', () => {
    for (const { position: [x, y, z] } of placed) {
      expect(y).toBe(0);
      expect(Math.abs(z) < 2 && x > -20).toBe(false);
      expect(x > 4 && x < 10 && z > 4 && z < 10).toBe(false);
      expect(x > -10 && x < -6 && z > 6 && z < 10).toBe(false);
    }
  });

  it('gathers along the foot of walls', () => {
    const nearHouse = placed.filter(({ position: [x, , z] }) => x > 3 && x < 11 && z > 3 && z < 11).length;
    // The band round the house is under 7% of the map; by area alone it would hold about 14 of 200.
    expect(nearHouse).toBeGreaterThan(30);
  });

  it('wears only finishes it declares', () => {
    expect(Object.keys(SCATTER_FINISHES).every((k) => k.startsWith('scatter.'))).toBe(true);
  });
});
