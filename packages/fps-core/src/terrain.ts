import type { Vec3 } from './math';
import { DEG } from './math';
import { STATS } from './stats';
import type { Material } from './world';

/**
 * A map's ground as plain data, built ahead of time. Heights are metres at
 * the grid's corners, row by row along +X, rows along +Z. Each cell is two
 * triangles split along the diagonal from its (x+1, z) corner to its (x, z+1)
 * corner: whatever draws the terrain must split them the same way.
 */
export interface TerrainData {
  /** The grid's lowest (x, z) corner. */
  readonly origin: readonly [x: number, z: number];
  /** Metres a side of a cell. */
  readonly cell: number;
  /** Cells along X. */
  readonly columns: number;
  /** Cells along Z. */
  readonly rows: number;
  /** (columns + 1) × (rows + 1) corner heights. */
  readonly heights: ArrayLike<number>;
  /** The water's surface at each corner, same layout; below the ground where it's dry. */
  readonly water?: ArrayLike<number>;
  /** The materials the ground uses; a bullet hitting it or a foot on it reads this. */
  readonly palette: readonly Material[];
  /** Each cell's index into the palette, row by row; the first entry everywhere without it. */
  readonly materials?: ArrayLike<number>;
}

/** Squared gradient past which ground is too steep to stand on. */
const STEEP = Math.tan(STATS.terrain.slopeLimit.value * DEG) ** 2;
/** Depth below the surface that counts as a ray going under it, so a ray ending on the ground doesn't. */
const GRAZE = 1e-6;

/**
 * Terrain: the collision primitive beside solids (ADR 0007). Every query is
 * constant time but `raycast`, which walks the cells under the ray. Outside
 * its rectangle there is no ground at all, so a map closes it with a Boundary.
 */
export class Terrain {
  readonly #heights: Float32Array;
  readonly #water: Float32Array | null;
  readonly #materials: ArrayLike<number> | null;
  readonly #palette: readonly Material[];
  readonly #ox: number;
  readonly #oz: number;
  readonly #cell: number;
  readonly #nx: number;
  readonly #nz: number;
  readonly #stride: number;
  readonly #top: number;
  /** The slope along x and along z of the triangle `#locate` last landed on. */
  #sx = 0;
  #sz = 0;

  constructor(data: TerrainData) {
    const corners = (data.columns + 1) * (data.rows + 1);
    if (data.heights.length !== corners) throw new Error(`Terrain needs ${corners} heights, got ${data.heights.length}`);
    if (data.water && data.water.length !== corners) throw new Error(`Terrain needs ${corners} water heights, got ${data.water.length}`);
    if (data.palette.length === 0) throw new Error('Terrain needs a material');
    this.#heights = data.heights instanceof Float32Array ? data.heights : Float32Array.from(data.heights as ArrayLike<number>);
    this.#water = !data.water ? null : data.water instanceof Float32Array ? data.water : Float32Array.from(data.water as ArrayLike<number>);
    this.#materials = data.materials ?? null;
    this.#palette = data.palette;
    this.#ox = data.origin[0];
    this.#oz = data.origin[1];
    this.#cell = data.cell;
    this.#nx = data.columns;
    this.#nz = data.rows;
    this.#stride = data.columns + 1;
    let top = -Infinity;
    for (let i = 0; i < corners; i++) top = Math.max(top, this.#heights[i]!);
    this.#top = top;
  }

  /** The cell's column under `x`, or -1 outside the rectangle. */
  #column(x: number): number {
    const g = (x - this.#ox) / this.#cell;
    return g >= 0 && g <= this.#nx ? Math.min(this.#nx - 1, Math.floor(g)) : -1;
  }

  #row(z: number): number {
    const g = (z - this.#oz) / this.#cell;
    return g >= 0 && g <= this.#nz ? Math.min(this.#nz - 1, Math.floor(g)) : -1;
  }

  /** The height of `grid` at (x, z) in cell (i, j), leaving its triangle's slope in #sx and #sz. */
  #locate(grid: Float32Array, i: number, j: number, x: number, z: number): number {
    const cell = this.#cell;
    const c = j * this.#stride + i;
    const u = (x - this.#ox) / cell - i;
    const v = (z - this.#oz) / cell - j;
    const h01 = grid[c + this.#stride]!;
    const h10 = grid[c + 1]!;
    if (u + v <= 1) {
      const h00 = grid[c]!;
      this.#sx = (h10 - h00) / cell;
      this.#sz = (h01 - h00) / cell;
      return h00 + u * (h10 - h00) + v * (h01 - h00);
    }
    const h11 = grid[c + this.#stride + 1]!;
    this.#sx = (h11 - h01) / cell;
    this.#sz = (h11 - h10) / cell;
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }

  /** Ground height at (x, z), or -Infinity outside the rectangle. */
  /** A number that changes with the ground. */
  fingerprint(): number {
    let hash = 0x811c9dc5;
    for (const heights of [this.#heights, this.#water ?? new Float32Array()]) {
      const bits = new Int32Array(heights.buffer, heights.byteOffset, heights.length);
      for (let i = 0; i < bits.length; i++) hash = Math.imul(hash ^ bits[i]!, 16777619);
    }
    return hash >>> 0;
  }

  heightAt(x: number, z: number): number {
    const i = this.#column(x);
    const j = this.#row(z);
    return i < 0 || j < 0 ? -Infinity : this.#locate(this.#heights, i, j, x, z);
  }

  /** Moves #sx and #sz to the ground's slope at (x, z); false outside the rectangle. */
  #slopeAt(x: number, z: number): boolean {
    const i = this.#column(x);
    const j = this.#row(z);
    if (i < 0 || j < 0) return false;
    this.#locate(this.#heights, i, j, x, z);
    return true;
  }

  /** True when the ground at (x, z) is past the slope limit. */
  steepAt(x: number, z: number): boolean {
    return this.#slopeAt(x, z) && this.#sx * this.#sx + this.#sz * this.#sz > STEEP;
  }

  /** The ground's unit normal at (x, z), up outside the rectangle. */
  normalAt(x: number, z: number): Vec3 {
    if (!this.#slopeAt(x, z)) return [0, 1, 0];
    const length = Math.hypot(this.#sx, 1, this.#sz);
    return [-this.#sx / length, 1 / length, -this.#sz / length];
  }

  /** The unit direction straight down the ground on the plane at (x, z), or null where it's level. */
  downhillAt(x: number, z: number): readonly [x: number, z: number] | null {
    if (!this.#slopeAt(x, z)) return null;
    const length = Math.hypot(this.#sx, this.#sz);
    return length < 1e-9 ? null : [-this.#sx / length, -this.#sz / length];
  }

  /** How far the water's surface stands above `y` at (x, z): negative when above it or dry. */
  waterAbove(x: number, y: number, z: number): number {
    if (!this.#water) return -Infinity;
    const i = this.#column(x);
    const j = this.#row(z);
    return i < 0 || j < 0 ? -Infinity : this.#locate(this.#water, i, j, x, z) - y;
  }

  /** The ground's material at (x, z). */
  materialAt(x: number, z: number): Material {
    const i = this.#column(x);
    const j = this.#row(z);
    if (!this.#materials || i < 0 || j < 0) return this.#palette[0]!;
    return this.#palette[this.#materials[j * this.#nx + i]!] ?? this.#palette[0]!;
  }

  /**
   * The fraction along a→b where the segment first goes under the ground, no
   * later than `limit`, or null if it never does. Walks the cells under it,
   * looking closer only at those whose highest corner it dips to; the ground
   * is flat between a cell's edges and its diagonal, so a sign change between
   * those points is the crossing, exactly.
   */
  raycast(a: Vec3, b: Vec3, limit = 1): number | null {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    if (Math.min(a[1], a[1] + dy * limit) > this.#top) return null;
    const cell = this.#cell;
    // The grid coordinates of a point along the segment are gx + t·ux and gz + t·uz.
    const gx = (a[0] - this.#ox) / cell;
    const gz = (a[2] - this.#oz) / cell;
    const ux = dx / cell;
    const uz = dz / cell;
    let t = 0;
    let end = limit;
    if (ux === 0) {
      if (gx < 0 || gx > this.#nx) return null;
    } else {
      const e = -gx / ux;
      const f = (this.#nx - gx) / ux;
      t = Math.max(t, Math.min(e, f));
      end = Math.min(end, Math.max(e, f));
    }
    if (uz === 0) {
      if (gz < 0 || gz > this.#nz) return null;
    } else {
      const e = -gz / uz;
      const f = (this.#nz - gz) / uz;
      t = Math.max(t, Math.min(e, f));
      end = Math.min(end, Math.max(e, f));
    }
    if (t > end) return null;
    const stepX = ux > 0 ? 1 : -1;
    const stepZ = uz > 0 ? 1 : -1;
    let i = Math.min(this.#nx - 1, Math.max(0, Math.floor(gx + ux * t)));
    let j = Math.min(this.#nz - 1, Math.max(0, Math.floor(gz + uz * t)));
    let nextX = ux === 0 ? Infinity : (i + (stepX > 0 ? 1 : 0) - gx) / ux;
    let nextZ = uz === 0 ? Infinity : (j + (stepZ > 0 ? 1 : 0) - gz) / uz;
    const deltaX = ux === 0 ? Infinity : 1 / Math.abs(ux);
    const deltaZ = uz === 0 ? Infinity : 1 / Math.abs(uz);
    const heights = this.#heights;
    const stride = this.#stride;
    for (;;) {
      const out = Math.min(nextX, nextZ, end);
      const c = j * stride + i;
      const y0 = a[1] + dy * t;
      const y1 = a[1] + dy * out;
      const low = y0 < y1 ? y0 : y1;
      if (low <= heights[c]! || low <= heights[c + 1]! || low <= heights[c + stride]! || low <= heights[c + stride + 1]!) {
        const above = (s: number) => a[1] + dy * s - this.#locate(heights, i, j, a[0] + dx * s, a[2] + dz * s);
        const first = above(t);
        if (first < -GRAZE) return t;
        const across = ux + uz === 0 ? -1 : (i + j + 1 - gx - gz) / (ux + uz);
        const split = across > t && across < out;
        const mid = split ? above(across) : first;
        if (split && mid < -GRAZE) return t + ((across - t) * first) / (first - mid);
        const last = above(out);
        if (last < -GRAZE) {
          const from = split ? across : t;
          return from + ((out - from) * mid) / (mid - last);
        }
      }
      if (out >= end) return null;
      t = out;
      if (nextX < nextZ) {
        i += stepX;
        nextX += deltaX;
        if (i < 0 || i >= this.#nx) return null;
      } else {
        j += stepZ;
        nextZ += deltaZ;
        if (j < 0 || j >= this.#nz) return null;
      }
    }
  }
}
