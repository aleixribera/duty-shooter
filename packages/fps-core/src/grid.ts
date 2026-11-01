import type { Vec3 } from './math';
import type { Solid } from './world';

/** Solids are registered a little beyond their bounds, so rounding at a cell edge never loses one. */
const MARGIN = 0.01;
/** Metres a segment's bounds are widened by before ruling a solid out, so rounding never hides a graze. */
const BOUNDS_SLACK = 1e-6;
/** Above this many cells the grid coarsens, so a map with far scenery stays small in memory. */
const MAX_CELLS = 1 << 20;

/**
 * A uniform grid over the ground plane (X/Z), built once, listing which
 * solids reach into each cell. Queries return candidates in solid order, so
 * every caller sees exactly what a linear scan over all solids would see,
 * minus the solids that cannot matter. With no cell size it is a plain list.
 */
export class SolidIndex {
  readonly #solids: readonly Solid[];
  /** Indices into the world's solids of the members of this index, ascending. */
  readonly #members: readonly number[];
  readonly #cell: number;
  readonly #ox: number;
  readonly #oz: number;
  readonly #nx: number;
  readonly #nz: number;
  /** Cell c's solids are #items[#start[c] .. #start[c + 1]). */
  readonly #start: Int32Array;
  readonly #items: Int32Array;
  readonly #stamp: Uint32Array;
  #visit = 0;
  /** What a cell gave `firstHit`: kept, since the bots' sight and frag arcs ask thousands of times a tick. */
  readonly #found: number[] = [];

  constructor(solids: readonly Solid[], members: readonly number[], cellSize: number | null) {
    this.#solids = solids;
    this.#members = members;
    this.#stamp = new Uint32Array(solids.length);
    if (cellSize === null || members.length === 0) {
      this.#cell = 0;
      this.#ox = this.#oz = 0;
      this.#nx = this.#nz = 0;
      this.#start = new Int32Array(1);
      this.#items = new Int32Array(0);
      return;
    }
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const i of members) {
      const s = solids[i] as Solid;
      x0 = Math.min(x0, s.min[0] - MARGIN);
      z0 = Math.min(z0, s.min[2] - MARGIN);
      x1 = Math.max(x1, s.max[0] + MARGIN);
      z1 = Math.max(z1, s.max[2] + MARGIN);
    }
    let cell = cellSize;
    while (Math.ceil((x1 - x0) / cell) * Math.ceil((z1 - z0) / cell) > MAX_CELLS) cell *= 2;
    this.#cell = cell;
    this.#ox = x0;
    this.#oz = z0;
    this.#nx = Math.max(1, Math.ceil((x1 - x0) / cell));
    this.#nz = Math.max(1, Math.ceil((z1 - z0) / cell));
    const count = new Int32Array(this.#nx * this.#nz + 1);
    const span = (s: Solid) => [this.#cx(s.min[0] - MARGIN), this.#cz(s.min[2] - MARGIN), this.#cx(s.max[0] + MARGIN), this.#cz(s.max[2] + MARGIN)] as const;
    for (const i of members) {
      const [a, b, c, d] = span(solids[i] as Solid);
      for (let z = b; z <= d; z++) for (let x = a; x <= c; x++) count[z * this.#nx + x + 1]! += 1;
    }
    for (let c = 1; c < count.length; c++) count[c]! += count[c - 1]!;
    this.#start = count.slice();
    this.#items = new Int32Array(count[count.length - 1]!);
    const fill = count;
    for (const i of members) {
      const [a, b, c, d] = span(solids[i] as Solid);
      for (let z = b; z <= d; z++) for (let x = a; x <= c; x++) this.#items[fill[z * this.#nx + x]!++] = i;
    }
  }

  #cx(x: number): number {
    return Math.min(this.#nx - 1, Math.max(0, Math.floor((x - this.#ox) / this.#cell)));
  }

  #cz(z: number): number {
    return Math.min(this.#nz - 1, Math.max(0, Math.floor((z - this.#oz) / this.#cell)));
  }

  get solids(): readonly Solid[] {
    return this.#solids;
  }

  /** Member solids that may reach into the X/Z rectangle, in solid order. */
  inRect(x0: number, z0: number, x1: number, z1: number): readonly number[] {
    if (this.#cell === 0) return this.#members;
    const lx = Math.min(x0, x1) - MARGIN;
    const hx = Math.max(x0, x1) + MARGIN;
    const lz = Math.min(z0, z1) - MARGIN;
    const hz = Math.max(z0, z1) + MARGIN;
    if (hx < this.#ox || hz < this.#oz || lx > this.#ox + this.#nx * this.#cell || lz > this.#oz + this.#nz * this.#cell) return [];
    const out: number[] = [];
    const visit = this.#nextVisit();
    for (let z = this.#cz(lz), zEnd = this.#cz(hz); z <= zEnd; z++) {
      for (let x = this.#cx(lx), xEnd = this.#cx(hx); x <= xEnd; x++) this.#collect(z * this.#nx + x, visit, out);
    }
    return out.length > 1 ? out.sort((a, b) => a - b) : out;
  }

  /**
   * The first member solid the segment a→b enters, by `test` (the entry
   * fraction along the segment, or null on a miss). Ties go to the lower
   * solid index, as in a linear scan. Cells are visited in order along the
   * segment, stopping once no later cell can hold a nearer hit. A solid whose
   * bounds the segment's own bounds miss is passed over without asking `test`,
   * so `test` must be a miss for those, as every world query's is.
   */
  firstHit(a: Vec3, b: Vec3, test: (index: number) => number | null): { t: number; index: number } | null {
    let bestT = Infinity;
    let bestIndex = -1;
    const lx = Math.min(a[0], b[0]) - BOUNDS_SLACK;
    const ly = Math.min(a[1], b[1]) - BOUNDS_SLACK;
    const lz = Math.min(a[2], b[2]) - BOUNDS_SLACK;
    const hx = Math.max(a[0], b[0]) + BOUNDS_SLACK;
    const hy = Math.max(a[1], b[1]) + BOUNDS_SLACK;
    const hz = Math.max(a[2], b[2]) + BOUNDS_SLACK;
    const solids = this.#solids;
    const apart = (index: number) => {
      const { min, max } = solids[index] as Solid;
      return min[1] > hy || max[1] < ly || min[0] > hx || max[0] < lx || min[2] > hz || max[2] < lz;
    };
    if (this.#cell === 0) {
      for (const index of this.#members) {
        if (apart(index)) continue;
        const t = test(index);
        if (t !== null && (t < bestT || (t === bestT && index < bestIndex))) {
          bestT = t;
          bestIndex = index;
        }
      }
      return bestIndex < 0 ? null : { t: bestT, index: bestIndex };
    }
    const visit = this.#nextVisit();
    const found = this.#found;
    this.#walk(a, b, (cell, exit) => {
      found.length = 0;
      this.#collect(cell, visit, found);
      for (let k = 0; k < found.length; k++) {
        const index = found[k]!;
        if (apart(index)) continue;
        const t = test(index);
        if (t !== null && (t < bestT || (t === bestT && index < bestIndex))) {
          bestT = t;
          bestIndex = index;
        }
      }
      return bestT < exit - 1e-9;
    });
    return bestIndex < 0 ? null : { t: bestT, index: bestIndex };
  }

  /** Every member solid that may touch the segment a→b, in solid order. */
  alongSegment(a: Vec3, b: Vec3): readonly number[] {
    if (this.#cell === 0) return this.#members;
    const visit = this.#nextVisit();
    const out: number[] = [];
    this.#walk(a, b, (cell) => {
      this.#collect(cell, visit, out);
      return false;
    });
    return out.length > 1 ? out.sort((x, y) => x - y) : out;
  }

  #nextVisit(): number {
    this.#visit += 1;
    if (this.#visit === 0xffffffff) {
      this.#stamp.fill(0);
      this.#visit = 1;
    }
    return this.#visit;
  }

  #collect(cell: number, visit: number, out: number[]): void {
    for (let k = this.#start[cell]!, end = this.#start[cell + 1]!; k < end; k++) {
      const i = this.#items[k]!;
      if (this.#stamp[i] === visit) continue;
      this.#stamp[i] = visit;
      out.push(i);
    }
  }

  /**
   * Walks the cells the segment's X/Z shadow crosses, in order (a 2D DDA).
   * `visit` gets each cell and the segment fraction where the walk leaves it;
   * returning true stops the walk.
   */
  #walk(a: Vec3, b: Vec3, visit: (cell: number, exit: number) => boolean): void {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    // Clip the segment to the grid's rectangle.
    const hx = this.#ox + this.#nx * this.#cell;
    const hz = this.#oz + this.#nz * this.#cell;
    let t0 = 0;
    let t1 = 1;
    if (dx === 0) {
      if (a[0] < this.#ox || a[0] > hx) return;
    } else {
      const e = (this.#ox - a[0]) / dx;
      const f = (hx - a[0]) / dx;
      t0 = Math.max(t0, Math.min(e, f));
      t1 = Math.min(t1, Math.max(e, f));
    }
    if (dz === 0) {
      if (a[2] < this.#oz || a[2] > hz) return;
    } else {
      const e = (this.#oz - a[2]) / dz;
      const f = (hz - a[2]) / dz;
      t0 = Math.max(t0, Math.min(e, f));
      t1 = Math.min(t1, Math.max(e, f));
    }
    if (t0 > t1) return;
    let x = this.#cx(a[0] + dx * t0);
    let z = this.#cz(a[2] + dz * t0);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    let nextX = dx === 0 ? Infinity : (this.#ox + (x + (stepX > 0 ? 1 : 0)) * this.#cell - a[0]) / dx;
    let nextZ = dz === 0 ? Infinity : (this.#oz + (z + (stepZ > 0 ? 1 : 0)) * this.#cell - a[2]) / dz;
    const deltaX = dx === 0 ? Infinity : this.#cell / Math.abs(dx);
    const deltaZ = dz === 0 ? Infinity : this.#cell / Math.abs(dz);
    for (;;) {
      const exit = Math.min(nextX, nextZ, t1);
      if (visit(z * this.#nx + x, exit) || exit >= t1) return;
      if (nextX < nextZ) {
        x += stepX;
        nextX += deltaX;
      } else {
        z += stepZ;
        nextZ += deltaZ;
      }
      if (x < 0 || x >= this.#nx || z < 0 || z >= this.#nz) return;
    }
  }
}

/** Metres a side of a {@link PointGrid} cell. */
const POINT_CELL = 16;
/** So few points that walking them all beats a grid. */
const FEW_POINTS = 16;

/**
 * The points of one moment (players, as a tick left them) on a grid over the
 * ground plane, built when first asked and thrown away with that moment.
 * Queries return what a walk over every point would find, in the same order,
 * so a caller behaves exactly as it would without one.
 */
export class PointGrid {
  readonly #points: readonly Vec3[];
  #cells: Map<number, number[]> | null = null;

  constructor(points: readonly Vec3[]) {
    this.#points = points;
  }

  /** Indices, ascending, of the points in the box from (x0, z0) to (x1, z1) on the ground plane. */
  within(x0: number, z0: number, x1: number, z1: number): number[] {
    const points = this.#points;
    const inside = (i: number) => {
      const p = points[i] as Vec3;
      return p[0] >= x0 && p[0] <= x1 && p[2] >= z0 && p[2] <= z1;
    };
    const ax = cellOf(x0);
    const az = cellOf(z0);
    const bx = cellOf(x1);
    const bz = cellOf(z1);
    const out: number[] = [];
    if (points.length <= FEW_POINTS || (bx - ax + 1) * (bz - az + 1) >= points.length) {
      for (let i = 0; i < points.length; i++) if (inside(i)) out.push(i);
      return out;
    }
    const cells = (this.#cells ??= this.#fill());
    for (let x = ax; x <= bx; x++) {
      for (let z = az; z <= bz; z++) {
        const cell = cells.get(cellKey(x, z));
        if (cell) for (const i of cell) if (inside(i)) out.push(i);
      }
    }
    return out.sort((a, b) => a - b);
  }

  /** Indices, ascending, of the points within `reach` m of (x, z) along each axis: the caller measures the distance it cares about. */
  around(x: number, z: number, reach: number): number[] {
    return this.within(x - reach, z - reach, x + reach, z + reach);
  }

  #fill(): Map<number, number[]> {
    const cells = new Map<number, number[]>();
    for (const [i, p] of this.#points.entries()) {
      const key = cellKey(cellOf(p[0]), cellOf(p[2]));
      const cell = cells.get(key);
      if (cell) cell.push(i);
      else cells.set(key, [i]);
    }
    return cells;
  }
}

const cellOf = (v: number) => Math.floor(v / POINT_CELL);
const cellKey = (x: number, z: number) => (x + 0x8000) * 0x10000 + (z + 0x8000);
