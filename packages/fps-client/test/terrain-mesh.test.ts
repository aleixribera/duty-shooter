import { describe, expect, it } from 'vitest';
import { Terrain, type TerrainData } from '@duty-shooter/fps-core';
import { chunkStep, TERRAIN_CHUNK, terrainChunkCount, terrainChunkMesh, terrainColorBytes, terrainSeaMesh, terrainWaterMesh } from '../src/surfaces';

/** A bumpy little ground, 100 cells by 70: not a whole number of chunks either way. */
function ground(): TerrainData {
  const columns = 100;
  const rows = 70;
  const heights = new Float32Array((columns + 1) * (rows + 1));
  const water = new Float32Array(heights.length).fill(-50);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      // Different on each diagonal of a cell, so splitting it the other way would show.
      heights[j * (columns + 1) + i] = ((i * 7 + j * 13) % 11) * 0.4 + (i * j) % 3;
      if (i >= 10 && i <= 14) water[j * (columns + 1) + i] = 6;
    }
  }
  return { origin: [-30, 20], cell: 2, columns, rows, heights, water, palette: ['grass', 'sand'], materials: new Uint8Array(columns * rows).fill(1) };
}

/** Where a ray straight down at (x, z) meets a mesh's top, leaving skirts (which stand on edge) out. */
function meshHeightAt(mesh: { positions: Float32Array; index: Uint32Array }, x: number, z: number): number | null {
  const p = mesh.positions;
  for (let t = 0; t < mesh.index.length; t += 3) {
    const [a, b, c] = [mesh.index[t]! * 3, mesh.index[t + 1]! * 3, mesh.index[t + 2]! * 3];
    const area = (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!) - (p[c]! - p[a]!) * (p[b + 2]! - p[a + 2]!);
    if (area === 0) continue;
    const u = ((x - p[a]!) * (p[c + 2]! - p[a + 2]!) - (p[c]! - p[a]!) * (z - p[a + 2]!)) / area;
    const v = ((p[b]! - p[a]!) * (z - p[a + 2]!) - (x - p[a]!) * (p[b + 2]! - p[a + 2]!)) / area;
    if (u < 0 || v < 0 || u + v > 1) continue;
    return p[a + 1]! + u * (p[b + 1]! - p[a + 1]!) + v * (p[c + 1]! - p[a + 1]!);
  }
  return null;
}

/** The highest value of one coordinate across a mesh. */
function highest(mesh: { positions: Float32Array }, axis: number): number {
  let top = -Infinity;
  for (let v = axis; v < mesh.positions.length; v += 3) top = Math.max(top, mesh.positions[v]!);
  return top;
}

describe('terrain chunks', () => {
  const data = ground();
  const terrain = new Terrain(data);

  it('covers the whole grid, with short chunks at the far edges', () => {
    expect(terrainChunkCount(data)).toEqual({ columns: 2, rows: 2 });
    const last = terrainChunkMesh(data, 1, 1, 1);
    expect(highest(last, 0)).toBe(-30 + 200);
    expect(highest(last, 2)).toBe(20 + 140);
  });

  it('draws at full detail exactly the ground a player stands on, either side of a diagonal', () => {
    for (const [x, z] of [[-29.5, 20.4], [-28.4, 21.6], [10.3, 33.9], [50.7, 90.2], [60.1, 88.2]] as const) {
      const cx = Math.floor((x + 30) / (2 * TERRAIN_CHUNK));
      const cz = Math.floor((z - 20) / (2 * TERRAIN_CHUNK));
      expect(meshHeightAt(terrainChunkMesh(data, cx, cz, 1), x, z)).toBeCloseTo(terrain.heightAt(x, z), 3);
    }
  });

  it('faces the top up', () => {
    const { positions: p, index } = terrainChunkMesh(data, 0, 0, 2);
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t]! * 3, index[t + 1]! * 3, index[t + 2]! * 3];
      // In (x, z), counter-clockwise seen from above is a negative area; a skirt stands on edge and has none.
      const area = (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!) - (p[c]! - p[a]!) * (p[b + 2]! - p[a + 2]!);
      expect(area).toBeLessThanOrEqual(0);
    }
  });

  it('gets cheaper with each step, and keeps a chunk corner where it is', () => {
    const fine = terrainChunkMesh(data, 0, 0, 1);
    const coarse = terrainChunkMesh(data, 0, 0, 8);
    expect(coarse.index.length).toBeLessThan(fine.index.length / 20);
    expect(coarse.positions[1]).toBeCloseTo(terrain.heightAt(-30, 20), 4);
    expect(fine.positions[1]).toBeCloseTo(terrain.heightAt(-30, 20), 4);
  });

  it('hangs a skirt below the edges, deeper for a coarser chunk', () => {
    const lowest = (step: number) => {
      const { positions } = terrainChunkMesh(data, 0, 0, step);
      let low = Infinity;
      for (let y = 1; y < positions.length; y += 3) low = Math.min(low, positions[y]!);
      return low;
    };
    expect(lowest(1)).toBeLessThan(0);
    expect(lowest(8)).toBeLessThan(lowest(1) - 20);
  });

  it('gives each mesh its own index, since disposing a geometry can delete a shared one', () => {
    expect(terrainChunkMesh(data, 0, 0, 2).index).not.toBe(terrainChunkMesh(data, 0, 0, 2).index);
  });

  it('leans normals away from the rise', () => {
    const heights = new Float32Array(17 * 17);
    for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) heights[j * 17 + i] = i * 0.5;
    const mesh = terrainChunkMesh({ origin: [0, 0], cell: 1, columns: 16, rows: 16, heights, palette: ['grass'] }, 0, 0, 1);
    const v = 8 * 17 + 8;
    expect(mesh.normals[v * 3]!).toBeCloseTo(-0.4472, 3);
    expect(mesh.normals[v * 3 + 1]!).toBeCloseTo(0.8944, 3);
    expect(mesh.normals[v * 3 + 2]!).toBeCloseTo(0, 5);
  });
});

describe('choosing a chunk detail', () => {
  it('is finest close to and coarsest far off', () => {
    expect(chunkStep(40)).toBe(1);
    expect(chunkStep(160)).toBe(2);
    expect(chunkStep(300)).toBe(4);
    expect(chunkStep(900)).toBe(8);
  });

  it('holds its detail near a limit, so a player on the line does not make it flicker', () => {
    expect(chunkStep(102)).toBe(2);
    expect(chunkStep(102, 1)).toBe(1);
    expect(chunkStep(98, 2)).toBe(2);
    expect(chunkStep(80, 2)).toBe(1);
    expect(chunkStep(125, 1)).toBe(2);
  });
});

describe('the colours of the ground', () => {
  it('paints each cell its palette colour', () => {
    const bytes = terrainColorBytes(ground(), [0x112233, 0xc0ffee]);
    expect(bytes.length).toBe(100 * 70 * 4);
    expect([...bytes.subarray(0, 4)]).toEqual([0xc0, 0xff, 0xee, 255]);
  });
});

describe('the sea', () => {
  const heights = new Float32Array(65 * 65).fill(5);
  // Under water at one end only.
  for (let j = 0; j <= 64; j++) for (let i = 0; i <= 15; i++) heights[j * 65 + i] = -1;
  const data: TerrainData = { origin: [0, 0], cell: 1, columns: 64, rows: 64, heights, palette: ['sand'] };
  const mesh = terrainSeaMesh(data, 100);
  const covered = (x: number, z: number) => meshHeightAt(mesh, x, z);

  it('lies over the ground that dips under it, and out past the grid', () => {
    expect(covered(4, 30)).toBe(0);
    expect(covered(-50, 30)).toBe(0);
    expect(covered(30, 150)).toBe(0);
    expect(covered(150, 30)).toBe(0);
  });

  it('leaves out the ground that stands clear, so it cannot flicker through it from far off', () => {
    expect(covered(50, 30)).toBeNull();
  });
});

describe('water above the ground', () => {
  it('draws only cells wet at all four corners, at the height of the water', () => {
    const mesh = terrainWaterMesh(ground());
    expect(mesh.index.length).toBe(4 * 70 * 6);
    for (let y = 1; y < mesh.positions.length; y += 3) expect(mesh.positions[y]).toBe(6);
  });

  it('is empty for ground with none', () => {
    const { water: _, ...dry } = ground();
    expect(terrainWaterMesh(dry).index.length).toBe(0);
  });
});
