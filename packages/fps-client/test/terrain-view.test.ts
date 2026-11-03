import { describe, expect, it } from 'vitest';
import type { TerrainData } from '@duty-shooter/fps-core';
import { MeshBasicNodeMaterial, type Mesh, type Object3D } from 'three/webgpu';
import { TERRAIN_BLOCK, TerrainView } from '../src/terrain-view';
import { TERRAIN_CHUNK } from '../src/surfaces';

/** Land a kilometre and a half on a side, gently rolling, all above the sea. */
function land(): TerrainData {
  const columns = 1536;
  const rows = 1536;
  const heights = new Float32Array((columns + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) heights[j * (columns + 1) + i] = 5 + Math.sin(i / 40) * 3 + Math.cos(j / 55) * 2;
  return { origin: [-768, -768], cell: 1, columns, rows, heights, water: new Float32Array(heights.length).fill(-50), palette: ['grass'], materials: new Uint8Array(columns * rows) };
}

/** The ground's own draw calls (its sea and seabed left out) and their triangles. */
function ground(view: TerrainView) {
  let draws = 0;
  let triangles = 0;
  view.root.traverseVisible((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh.name !== 'ground') return;
    draws++;
    triangles += mesh.geometry.index!.count / 3;
  });
  return { draws, triangles };
}

describe('the ground (ticket 10): chunks near, blocks of them far', () => {
  const data = land();
  const chunks = (data.columns / TERRAIN_CHUNK) * (data.rows / TERRAIN_CHUNK);

  it('draws the far ground in blocks of chunks, one call each, near ground chunk by chunk', () => {
    const view = new TerrainView(data, [0x6b7a3a], new MeshBasicNodeMaterial());
    view.update([0, 2, 0]);
    const { draws } = ground(view);
    // Far fewer calls than chunks: every chunk out past the finest steps rides in a block.
    expect(draws).toBeLessThan(chunks / 3);
    expect(draws).toBeGreaterThan(chunks / (TERRAIN_BLOCK * TERRAIN_BLOCK));
    view.dispose();
  });

  it('draws the same ground either way: a block is its chunks at their coarsest', () => {
    const view = new TerrainView(data, [0x6b7a3a], new MeshBasicNodeMaterial());
    // From a corner, the far corner's blocks; from there, the same ground as chunks.
    view.update([-760, 2, -760]);
    const blocked = ground(view);
    const far = new TerrainView(data, [0x6b7a3a], new MeshBasicNodeMaterial(), { blocks: false });
    far.update([-760, 2, -760]);
    const chunked = ground(far);
    expect(blocked.triangles).toBe(chunked.triangles);
    expect(blocked.draws).toBeLessThan(chunked.draws / 2);
    view.dispose();
    far.dispose();
  });

  it('breaks a block back into chunks as the viewer comes near it, and builds the near ones finer', () => {
    const view = new TerrainView(data, [0x6b7a3a], new MeshBasicNodeMaterial());
    view.update([-760, 2, -760]);
    const before = ground(view);
    // A teleport across: everything catches up at once.
    view.update([760, 2, 760]);
    const after = ground(view);
    expect(after.draws).toBe(before.draws);
    expect(after.triangles).toBe(before.triangles);
    view.dispose();
  });
});
