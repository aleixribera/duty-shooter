import type { Solid, Vec3 } from '@duty-shooter/fps-core';
import { Group, type Object3D } from 'three/webgpu';
import type { SurfaceLayout } from './surfaces';

/**
 * A large map's static surfaces in blocks (ticket 10). Merged per finish over
 * the whole map, the island's cover would be drawn whole every frame, into
 * the shadow map too, and nothing of it ever culled. In blocks this wide (m),
 * each finish a draw call a block, a block out of view or out of the
 * shadow map's reach is skipped.
 */
export const SURFACE_BLOCK = 512;
/** Past this (m) from its nearest point a block draws only its big solids. */
export const SURFACE_FAR = 400;
/** The smallest solid (m, its longest side) a far block still draws: smaller ones are a pixel or two there. */
export const FAR_SMALLEST = 6;
/** How far past the line a block goes before it changes (m), so one on it doesn't flicker. */
const HOLD = 12;

/** One block of the map: its ground square and the faces it draws near and far (indices into the layout's faces). */
export interface SurfaceBlock {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly near: readonly number[];
  readonly far: readonly number[];
}

/**
 * Sorts the drawn faces into blocks by where their solid's middle stands, so a
 * solid is never split between blocks drawn at different levels. Props draw on
 * their own (see WorldView), and decorations near only.
 */
export function surfaceBlocks(layout: SurfaceLayout, solids: readonly Solid[]): SurfaceBlock[] {
  const blocks = new Map<string, { x: number; z: number; near: number[]; far: number[] }>();
  layout.faces.forEach((f, i) => {
    const solid = f.solid >= 0 ? solids[f.solid]! : null;
    if (solid && solid.prop !== null) return;
    let cx: number;
    let cz: number;
    if (solid) {
      cx = (solid.min[0] + solid.max[0]) / 2;
      cz = (solid.min[2] + solid.max[2]) / 2;
    } else {
      cx = f.origin[0] + (f.u[0] + f.v[0]) / 2;
      cz = f.origin[2] + (f.u[2] + f.v[2]) / 2;
    }
    const x = Math.floor(cx / SURFACE_BLOCK);
    const z = Math.floor(cz / SURFACE_BLOCK);
    const key = `${x},${z}`;
    let block = blocks.get(key);
    if (!block) {
      block = { x, z, near: [], far: [] };
      blocks.set(key, block);
    }
    block.near.push(i);
    if (solid && Math.max(solid.max[0] - solid.min[0], solid.max[1] - solid.min[1], solid.max[2] - solid.min[2]) >= FAR_SMALLEST) block.far.push(i);
  });
  return [...blocks.values()].map((b) => ({ x0: b.x * SURFACE_BLOCK, x1: (b.x + 1) * SURFACE_BLOCK, z0: b.z * SURFACE_BLOCK, z1: (b.z + 1) * SURFACE_BLOCK, near: b.near, far: b.far }));
}

/** A block as drawn: its square and its meshes, near and far. */
export interface DrawnBlock {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly near: readonly Object3D[];
  readonly far: readonly Object3D[];
}

/** Shows each block near or far by how far its nearest point is from the viewer. */
export class SurfaceBlocks {
  readonly root = new Group();
  readonly #blocks: { readonly block: DrawnBlock; near: boolean | null }[];

  constructor(blocks: readonly DrawnBlock[]) {
    this.#blocks = blocks.map((block) => ({ block, near: null }));
    for (const { block } of this.#blocks) this.root.add(...block.near, ...block.far);
  }

  update(viewer: Vec3): void {
    for (const b of this.#blocks) {
      const { x0, x1, z0, z1 } = b.block;
      const distance = Math.hypot(Math.max(x0 - viewer[0], 0, viewer[0] - x1), Math.max(z0 - viewer[2], 0, viewer[2] - z1));
      const line = b.near === null ? SURFACE_FAR : b.near ? SURFACE_FAR + HOLD : SURFACE_FAR - HOLD;
      const near = distance < line;
      if (near === b.near) continue;
      b.near = near;
      for (const m of b.block.near) m.visible = near;
      for (const m of b.block.far) m.visible = !near;
    }
  }
}
