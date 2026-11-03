import type { Vec3 } from './math';
import type { Concealment } from './world';

/**
 * A patch of soft cover (ticket 29): a bush, a thicket, tall grass. An upright
 * cylinder of foliage, `radius` m round (x, z), from `bottom` to `top` (m, y).
 */
export interface SoftCover {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Metres of foliage a look must pass through, added up along it, to see
 * nothing. A bush's thin edge doesn't hide what's behind it; a bush's middle,
 * or two edges in a row, does.
 */
export const SOFT_DEPTH = 0.8;

export interface SoftCoverOptions {
  /** Metres a side of the grid the covers are filed in. */
  readonly cell?: number;
}

/** Grid cell (m): a few bushes across. */
const CELL = 6;

/**
 * Soft cover as a `Concealment`: a look is hidden when it passes through
 * `SOFT_DEPTH` m of foliage. A cover the eye stands in doesn't count, so a bot
 * crouched in a bush sees out of it. The covers are filed in a grid of cells,
 * and a look visits only the cells it crosses.
 */
export function softConcealment(covers: readonly SoftCover[], options: SoftCoverOptions = {}): Concealment {
  const cell = options.cell ?? CELL;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of covers) {
    x0 = Math.min(x0, c.x - c.radius);
    z0 = Math.min(z0, c.z - c.radius);
    x1 = Math.max(x1, c.x + c.radius);
    z1 = Math.max(z1, c.z + c.radius);
  }
  if (covers.length === 0) return { hides: () => false };
  const columns = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell));
  // Each cell's covers, and the highest top among them (a look above it skips the cell).
  const lists: number[][] = Array.from({ length: columns * rows }, () => []);
  const tops = new Float64Array(columns * rows).fill(-Infinity);
  covers.forEach((c, i) => {
    const i0 = Math.max(0, Math.floor((c.x - c.radius - x0) / cell));
    const i1 = Math.min(columns - 1, Math.floor((c.x + c.radius - x0) / cell));
    const j0 = Math.max(0, Math.floor((c.z - c.radius - z0) / cell));
    const j1 = Math.min(rows - 1, Math.floor((c.z + c.radius - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let k = i0; k <= i1; k++) {
        lists[j * columns + k]!.push(i);
        tops[j * columns + k] = Math.max(tops[j * columns + k]!, c.top);
      }
    }
  });
  // Which query last counted each cover, so a cover filed in several cells counts once.
  const seen = new Uint32Array(covers.length);
  let query = 0;

  return {
    hides(from: Vec3, to: Vec3): boolean {
      const [fx, fy, fz] = from;
      const dx = to[0] - fx;
      const dy = to[1] - fy;
      const dz = to[2] - fz;
      const length = Math.hypot(dx, dy, dz);
      if (length < SOFT_DEPTH) return false;
      query = (query + 1) >>> 0;
      if (query === 0) {
        seen.fill(0);
        query = 1;
      }
      let depth = 0;
      // The look's own foliage through one cover: where it's inside the circle, and between bottom and top.
      const through = (c: SoftCover): number => {
        const ox = fx - c.x;
        const oz = fz - c.z;
        const r2 = c.radius * c.radius;
        if (ox * ox + oz * oz <= r2) return 0;
        const a = dx * dx + dz * dz;
        if (a < 1e-12) return 0;
        const b = ox * dx + oz * dz;
        const disc = b * b - a * (ox * ox + oz * oz - r2);
        if (disc <= 0) return 0;
        const root = Math.sqrt(disc);
        let t0 = Math.max(0, (-b - root) / a);
        let t1 = Math.min(1, (-b + root) / a);
        if (dy !== 0) {
          const ta = (c.bottom - fy) / dy;
          const tb = (c.top - fy) / dy;
          t0 = Math.max(t0, Math.min(ta, tb));
          t1 = Math.min(t1, Math.max(ta, tb));
        } else if (fy < c.bottom || fy > c.top) {
          return 0;
        }
        return t1 > t0 ? (t1 - t0) * length : 0;
      };
      // Walk the cells the look crosses, in order (a 2D DDA over x and z).
      const gx = (fx - x0) / cell;
      const gz = (fz - z0) / cell;
      let i = Math.floor(gx);
      let j = Math.floor(gz);
      const stepI = dx > 0 ? 1 : -1;
      const stepJ = dz > 0 ? 1 : -1;
      const ddx = dx !== 0 ? Math.abs(cell / dx) : Infinity;
      const ddz = dz !== 0 ? Math.abs(cell / dz) : Infinity;
      let nextX = dx !== 0 ? ((dx > 0 ? i + 1 - gx : gx - i) * cell) / Math.abs(dx) : Infinity;
      let nextZ = dz !== 0 ? ((dz > 0 ? j + 1 - gz : gz - j) * cell) / Math.abs(dz) : Infinity;
      let t = 0;
      while (t <= 1) {
        const tEnd = Math.min(nextX, nextZ, 1);
        if (i >= 0 && i < columns && j >= 0 && j < rows) {
          const k = j * columns + i;
          // The lowest the look gets within this cell.
          const low = fy + Math.min(dy * t, dy * tEnd);
          if (low <= tops[k]!) {
            for (const n of lists[k]!) {
              if (seen[n] === query) continue;
              seen[n] = query;
              depth += through(covers[n]!);
              if (depth >= SOFT_DEPTH) return true;
            }
          }
        } else if ((i < 0 && stepI < 0) || (i >= columns && stepI > 0) || (j < 0 && stepJ < 0) || (j >= rows && stepJ > 0)) {
          // Leaving the grid for good.
          break;
        }
        if (tEnd >= 1) break;
        if (nextX < nextZ) {
          i += stepI;
          t = nextX;
          nextX += ddx;
        } else {
          j += stepJ;
          t = nextZ;
          nextZ += ddz;
        }
      }
      return false;
    },
  };
}
