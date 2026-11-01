import type { TerrainData } from '@duty-shooter/fps-core';

/**
 * Cuts a heightfield into chunks of triangles, with no renderer in sight. The
 * finest detail splits every cell along the diagonal `Terrain` does (ADR 0007),
 * so the ground drawn is the ground stood on.
 */

/** Cells a side of a chunk. */
export const TERRAIN_CHUNK = 64;

/** Cells between a chunk's vertices, by detail. */
const STEPS = [1, 2, 4, 8] as const;
/** How far off (m) each detail but the last ends. */
const LIMITS = [100, 220, 450] as const;
/** How far past a limit a chunk has to go before it changes (m). */
const HOLD = 12;
/** A skirt's depth, in steps: past any rise a coarse chunk can miss between two of its vertices on walkable ground. */
const SKIRT_STEPS = 3;

export interface TerrainMesh {
  /** x, y, z per vertex. */
  readonly positions: Float32Array;
  /** x, y, z per vertex. */
  readonly normals: Float32Array;
  readonly index: Uint32Array;
}

/** How many chunks a terrain cuts into; the far ones can be short. */
export function terrainChunkCount(data: TerrainData): { columns: number; rows: number } {
  return { columns: Math.ceil(data.columns / TERRAIN_CHUNK), rows: Math.ceil(data.rows / TERRAIN_CHUNK) };
}

/**
 * Which step a chunk should draw at, `distance` metres off. Given the step it
 * is at, it keeps that a little past the limit.
 */
export function chunkStep(distance: number, current?: number): number {
  const level = (d: number) => {
    const found = LIMITS.findIndex((limit) => d < limit);
    return found < 0 ? LIMITS.length : found;
  };
  const wanted = level(distance);
  const at = current === undefined ? -1 : STEPS.indexOf(current as (typeof STEPS)[number]);
  if (at < 0) return STEPS[wanted]!;
  if (wanted > at && distance < LIMITS[wanted - 1]! + HOLD) return STEPS[at]!;
  if (wanted < at && distance > LIMITS[wanted]! - HOLD) return STEPS[at]!;
  return STEPS[wanted]!;
}

/** The grid lines a chunk's vertices stand on: every `step` cells, and always its far edge. */
function lines(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i += step) out.push(i);
  out.push(to);
  return out;
}

/** One chunk of the ground at a step, with a skirt round it so a gap to a finer neighbour never shows the sky. */
export function terrainChunkMesh(data: TerrainData, chunkX: number, chunkZ: number, step: number): TerrainMesh {
  const { columns, rows, cell, heights, origin } = data;
  const stride = columns + 1;
  const xs = lines(chunkX * TERRAIN_CHUNK, Math.min(columns, (chunkX + 1) * TERRAIN_CHUNK), step);
  const zs = lines(chunkZ * TERRAIN_CHUNK, Math.min(rows, (chunkZ + 1) * TERRAIN_CHUNK), step);
  const nx = xs.length;
  const nz = zs.length;
  const count = nx * nz + 2 * (nx + nz);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const index = new Uint32Array(((nx - 1) * (nz - 1) + 2 * (nx - 1 + nz - 1)) * 6);

  const height = (i: number, j: number) => heights[Math.min(rows, Math.max(0, j)) * stride + Math.min(columns, Math.max(0, i))]!;
  let v = 0;
  const vertex = (i: number, j: number, drop: number): number => {
    const s = v * 3;
    positions[s] = origin[0] + i * cell;
    positions[s + 1] = height(i, j) - drop;
    positions[s + 2] = origin[1] + j * cell;
    const dx = height(i - step, j) - height(i + step, j);
    const dz = height(i, j - step) - height(i, j + step);
    const dy = 2 * step * cell;
    const length = Math.hypot(dx, dy, dz);
    normals[s] = dx / length;
    normals[s + 1] = dy / length;
    normals[s + 2] = dz / length;
    return v++;
  };

  for (const j of zs) for (const i of xs) vertex(i, j, 0);

  let t = 0;
  const triangle = (a: number, b: number, c: number) => {
    index[t++] = a;
    index[t++] = b;
    index[t++] = c;
  };
  for (let b = 0; b + 1 < nz; b++) {
    for (let a = 0; a + 1 < nx; a++) {
      const nw = b * nx + a;
      const ne = nw + 1;
      const sw = nw + nx;
      const se = sw + 1;
      // The (x+1, z) to (x, z+1) diagonal, wound to face up.
      triangle(nw, sw, ne);
      triangle(ne, sw, se);
    }
  }

  const drop = SKIRT_STEPS * step * cell;
  /** Hangs a skirt under a run of top vertices, each joined to a copy below it, facing out of the chunk. */
  const skirt = (run: (k: number) => [i: number, j: number, top: number], length: number, flip: boolean) => {
    let lastTop = 0;
    let lastLow = 0;
    for (let k = 0; k < length; k++) {
      const [i, j, top] = run(k);
      const low = vertex(i, j, drop);
      if (k > 0 && flip) {
        triangle(lastTop, lastLow, top);
        triangle(top, lastLow, low);
      } else if (k > 0) {
        triangle(lastTop, top, lastLow);
        triangle(top, low, lastLow);
      }
      lastTop = top;
      lastLow = low;
    }
  };
  skirt((k) => [xs[k]!, zs[0]!, k], nx, false);
  skirt((k) => [xs[k]!, zs[nz - 1]!, (nz - 1) * nx + k], nx, true);
  skirt((k) => [xs[0]!, zs[k]!, k * nx], nz, true);
  skirt((k) => [xs[nx - 1]!, zs[k]!, k * nx + nx - 1], nz, false);

  return { positions, normals, index };
}

/** The ground's colour per cell, as RGBA bytes row by row: each cell its palette entry's sRGB colour. */
export function terrainColorBytes(data: TerrainData, colors: readonly number[]): Uint8Array {
  const count = data.columns * data.rows;
  const bytes = new Uint8Array(count * 4);
  const materials = data.materials;
  for (let c = 0; c < count; c++) {
    const color = colors[materials ? materials[c]! : 0] ?? colors[0]!;
    bytes[c * 4] = color >> 16;
    bytes[c * 4 + 1] = (color >> 8) & 0xff;
    bytes[c * 4 + 2] = color & 0xff;
    bytes[c * 4 + 3] = 255;
  }
  return bytes;
}

/** The water that stands above the ground: every cell wet at all four corners, at the height of its surface. */
export function terrainWaterMesh(data: TerrainData): TerrainMesh {
  const { columns, rows, cell, water, origin } = data;
  const stride = columns + 1;
  const positions: number[] = [];
  const index: number[] = [];
  if (water) {
    const wet = (c: number) => water[c]! > 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        const c = j * stride + i;
        if (!(wet(c) && wet(c + 1) && wet(c + stride) && wet(c + stride + 1))) continue;
        const v = positions.length / 3;
        const x = origin[0] + i * cell;
        const z = origin[1] + j * cell;
        positions.push(x, water[c]!, z, x + cell, water[c + 1]!, z, x, water[c + stride]!, z + cell, x + cell, water[c + stride + 1]!, z + cell);
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
  }
  const normals = new Float32Array(positions.length);
  for (let n = 1; n < normals.length; n += 3) normals[n] = 1;
  return { positions: Float32Array.from(positions), normals, index: Uint32Array.from(index) };
}
