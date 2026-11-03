import { describe, expect, it } from 'vitest';
import type { Solid } from '@duty-shooter/fps-core';
import { Mesh, BufferGeometry } from 'three/webgpu';
import { FAR_SMALLEST, SURFACE_BLOCK, SURFACE_FAR, SurfaceBlocks, surfaceBlocks } from '../src/surface-blocks';
import { layoutSurfaces } from '../src/surfaces';

const box = (x: number, z: number, size: number, height = size): Solid => ({ min: [x, 0, z], max: [x + size, height, z + size], material: 'concrete', blocks: 'both', orientation: null, prop: null }) as Solid;

/** A kilometre and a half of cover: big blocks and small ones, one of each straddling a block's edge. */
function cover(): Solid[] {
  const solids: Solid[] = [];
  for (let x = -700; x < 700; x += 90) for (let z = -700; z < 700; z += 110) solids.push(box(x, z, 2), box(x + 30, z + 40, 9, 7));
  solids.push(box(SURFACE_BLOCK - 1, 5, 2), box(SURFACE_BLOCK - 4, 60, 10));
  return solids;
}

describe('the surfaces in blocks (ticket 10): all of them near, the big ones far', () => {
  const solids = cover();
  const layout = layoutSurfaces(solids, { finishes: {}, looks: [], decorations: [], indoor: [], modelled: [] });
  const blocks = surfaceBlocks(layout, solids);

  it('puts every face in one block, a solid’s faces all in the same one', () => {
    const near = blocks.flatMap((b) => b.near);
    expect(near.length).toBe(layout.faces.length);
    expect(new Set(near).size).toBe(layout.faces.length);
    for (const b of blocks) {
      for (const f of b.near) {
        const s = solids[layout.faces[f]!.solid]!;
        const cx = (s.min[0] + s.max[0]) / 2;
        const cz = (s.min[2] + s.max[2]) / 2;
        expect(cx >= b.x0 && cx < b.x1 && cz >= b.z0 && cz < b.z1).toBe(true);
      }
    }
  });

  it('keeps far only the faces of solids at least FAR_SMALLEST across', () => {
    for (const b of blocks) {
      expect(b.far.every((f) => b.near.includes(f))).toBe(true);
      for (const f of b.near) {
        const s = solids[layout.faces[f]!.solid]!;
        const big = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]) >= FAR_SMALLEST;
        expect(b.far.includes(f)).toBe(big);
      }
    }
  });

  it('draws a block in full near the viewer and its big solids alone far off, without flickering on the line', () => {
    const meshes = blocks.map((b) => ({ ...b, nearMeshes: [new Mesh(new BufferGeometry())], farMeshes: [new Mesh(new BufferGeometry())] }));
    const view = new SurfaceBlocks(meshes.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, near: b.nearMeshes, far: b.farMeshes })));
    view.update([0, 2, 0]);
    const nearOf = (b: (typeof meshes)[number]) => b.nearMeshes[0]!.visible;
    for (const b of meshes) {
      const distance = Math.hypot(Math.max(b.x0, 0, -b.x1), Math.max(b.z0, 0, -b.z1));
      expect(nearOf(b)).toBe(distance < SURFACE_FAR);
      expect(b.farMeshes[0]!.visible).toBe(!nearOf(b));
    }
    // On a block's line, back and forth: it keeps what it was.
    const edge = meshes.find((b) => b.x0 > 0)!;
    const states = new Set<boolean>();
    for (let i = 0; i < 10; i++) {
      view.update([edge.x0 - SURFACE_FAR + (i % 2 ? 2 : -2), 2, (edge.z0 + edge.z1) / 2]);
      states.add(nearOf(edge));
    }
    expect(states.size).toBe(1);
  });
});
