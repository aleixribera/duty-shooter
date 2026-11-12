import { describe, expect, it } from 'vitest';
import { box } from '@duty-shooter/fps-core';
import { GRIME_MARKS, MOST_GRIME, SCATTER_FINISHES, grimeQuads, layoutSurfaces, scatterPlacements, type Scatter, type SurfaceSpec } from '@duty-shooter/fps-client/surfaces';
import { cornerCreases, cornerEdges, creaseEdges, openEdges } from '../src/surfaces/edges';

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

describe('creases', () => {
  // A room's corner: a floor, a wall along z = 0 (its room face at z = 0.2) and one along x = 0 (room face at x = 0.2)
  // that overlaps the first's end, as the maps' walls do.
  const room = [
    box({ min: [-1, -0.5, -1], max: [5, 0, 5], material: 'wood' }),
    box({ min: [0, 0, 0], max: [4, 3, 0.2], material: 'concrete' }),
    box({ min: [0, 0, 0], max: [0.2, 3, 4], material: 'concrete' }),
  ];
  const { faces } = layoutSurfaces(room, spec([null, { side: 'wall' }, { side: 'wall' }]));
  const creases = creaseEdges(faces, room);
  const roomFace = faces.findIndex((f) => f.solid === 1 && f.normal[2] === 1);
  /** The distance to the nearest crease on the first wall's room face at (x, y). */
  const toCrease = (x: number, y: number) => {
    const f = faces[roomFace]!;
    const alongU = Math.abs(f.u[0]) > 0;
    const [ku, kv] = alongU ? [(x - f.origin[0]) / f.u[0], (y - f.origin[1]) / f.v[1]] : [(y - f.origin[1]) / f.u[1], (x - f.origin[0]) / f.v[0]];
    return Math.min(...cornerCreases(f, creases, roomFace, ku, kv));
  };

  it('finds the corner where the other wall overlaps the face', () => {
    // The other wall's room face stands at x = 0.2.
    expect(toCrease(0.5, 1.5)).toBeCloseTo(0.3, 1);
  });

  it('finds the foot on the floor', () => {
    expect(toCrease(2, 0.1)).toBeCloseTo(0.1, 1);
  });

  it('leaves the open end and the head alone', () => {
    // The far end (x = 4) stops in the open, and nothing stands on the wall's head.
    expect(toCrease(3.9, 2.9)).toBeGreaterThan(2);
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

describe('grime', () => {
  const solids = [
    // A house with a roof over its yard side, on a 40 m square of dirt.
    box({ min: [-20, -1, -20], max: [20, 0, 20], material: 'concrete' }),
    box({ min: [-4, 0, -3], max: [4, 4, 3], material: 'concrete' }),
    box({ min: [4, 3.8, -3], max: [8, 4, 3], material: 'concrete' }),
  ];
  const { faces, finishes: worn } = layoutSurfaces(solids, spec([{ side: 'dirt', top: 'dirt' }, { side: 'wall' }, { side: 'wall' }]));
  const scatter: Scatter = { on: ['dirt'], within: { x0: -20, x1: 20, z0: -20, z1: 20 }, open: 0, walls: 0, seed: 5 };
  const quads = grimeQuads(faces, solids, worn, scatter);
  const lowest = (q: (typeof quads)[number]) => q.origin[1];

  it('leaves every kind of mark, and no more than one draw is worth', () => {
    expect(new Set(quads.map((q) => q.mark))).toEqual(new Set(GRIME_MARKS));
    expect(quads.length).toBeLessThanOrEqual(MOST_GRIME);
  });

  it('is the same every time', () => {
    expect(grimeQuads(faces, solids, worn, scatter)).toEqual(quads);
  });

  it('stays on the wall it marks: not past its ends, its head or its foot', () => {
    for (const q of quads.filter((m) => m.mark !== 'stain')) {
      expect(lowest(q)).toBeGreaterThanOrEqual(-0.001);
      expect(lowest(q) + q.v[1]).toBeLessThanOrEqual(4.001);
      for (const a of [0, 1]) {
        expect(Math.abs(q.origin[0] + q.u[0] * a)).toBeLessThanOrEqual(4.01);
        expect(Math.abs(q.origin[2] + q.u[2] * a)).toBeLessThanOrEqual(3.01);
      }
    }
  });

  it('keeps out from under the roof, where no weather gets', () => {
    const covered = quads.filter((q) => q.mark !== 'stain' && q.origin[0] > 3.99 && Math.abs(q.origin[2]) < 2.9);
    expect(covered).toEqual([]);
  });

  it('faces out, so the far side of a thin wall never shows it', () => {
    // The house is a convex box round the origin: out is away from it.
    for (const q of quads.filter((m) => m.mark !== 'stain')) {
      const [ux, , uz] = q.u;
      expect((q.origin[0] + ux / 2) * -uz + (q.origin[2] + uz / 2) * ux).toBeGreaterThan(0);
    }
  });

  it('runs a streak down from the head of the wall', () => {
    const streaks = quads.filter((q) => q.mark === 'streak');
    expect(streaks.length).toBeGreaterThan(0);
    for (const q of streaks) expect(lowest(q) + q.v[1]).toBeCloseTo(4);
  });

  it('lays damp from the foot of the wall', () => {
    for (const q of quads.filter((m) => m.mark === 'damp')) expect(lowest(q)).toBeCloseTo(0);
  });
});
