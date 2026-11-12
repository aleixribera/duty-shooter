import { describe, expect, it } from 'vitest';
import { box, type Solid } from '@duty-shooter/fps-core';
import { layoutSurfaces } from '../src/surfaces';
import { SurfaceHits } from '../src/surface-hit';

// A house's outer wall: one wooden solid, siding outside (z < 0), plaster on the face that looks into the room (z > 0).
const wall: Solid = box({ min: [0, 0, -0.1], max: [6, 3, 0.1], material: 'wood' });
const floor: Solid = box({ min: [0, -0.2, 0.1], max: [6, 0, 5], material: 'concrete' });
const spec = {
  finishes: { siding: { family: 'siding', color: 0x9dcdb3 }, wall: { family: 'plaster', color: 0xeadfc6 }, trim: { family: 'paint', color: 0xf3efe4 } },
  looks: [{ side: 'siding', inside: 'wall', top: 'trim', bottom: 'trim' }, null],
  decorations: [],
  indoor: [{ min: [0, 0, 0.1], max: [6, 3, 5] }],
} as const;
const layout = layoutSurfaces([wall, floor], spec as never);
const hits = new SurfaceHits(layout.faces, layout.finishes);
// A boarded floor beside a flush concrete pad: the pad comes later in the list, and once won at the floor's edge on a tie.
const boards: Solid = box({ min: [0, -0.2, 0], max: [6, 0, 5], material: 'concrete' });
const pad: Solid = box({ min: [6, -0.2, 0], max: [12, 0, 5], material: 'concrete' });
const seamLayout = layoutSurfaces([boards, pad], { finishes: { boards: { family: 'floor', color: 0xa87a4f } }, looks: [{ side: 'boards', top: 'boards' }, null], decorations: [], indoor: [] } as never);
const seams = new SurfaceHits(seamLayout.faces, seamLayout.finishes);

describe('what a shot hit, by the face it struck', () => {
  it('is plaster on the room side of a wooden wall', () => {
    expect(hits.materialAt([3, 1.5, 0.1], [0, 0, 1], 'wood')).toBe('plaster');
  });

  it('is wood on the siding outside it', () => {
    expect(hits.materialAt([3, 1.5, -0.1], [0, 0, -1], 'wood')).toBe('wood');
  });

  it('keeps the solid’s material where the face says nothing more (paint, or no face)', () => {
    expect(hits.materialAt([3, 3, 0], [0, 1, 0], 'wood')).toBe('wood');
    expect(hits.materialAt([40, 1, 40], [0, 0, 1], 'metal')).toBe('metal');
  });

  it('takes the face that holds a point at a seam, not its neighbour just past its edge', () => {
    // The room's floor (wood boards on the concrete slab) meets a concrete pad flush at x = 6.
    expect(seams.materialAt([5.98, 0, 2], [0, 1, 0], 'concrete')).toBe('wood');
    expect(seams.materialAt([6.02, 0, 2], [0, 1, 0], 'concrete')).toBe('concrete');
  });

  it('keeps the solid’s material for a hit off any face’s plane', () => {
    expect(hits.materialAt([3, 1.5, 0.5], [0, 0, 1], 'wood')).toBe('wood');
  });
});
