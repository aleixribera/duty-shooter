import type { Solid, TerrainData, Vec3 } from '@duty-shooter/fps-core';

/**
 * The sky field: what lights a map on terrain that has no bake (Zero Island
 * is too wide for one). The realtime shadow map reaches 45 m; past it nothing
 * shaded anything, and near or far nothing stood in anything else's way of
 * the sky, so the island was drawn flat. The field is one small picture of
 * the whole map from above, worked out as the map loads (a few passes over
 * its cells, no rays), holding four heights a cell:
 *
 * - `shade`: how high the sun's shadow stands as it reaches there, cast by
 *   what lies toward the sun. A point under it is in shadow. Every hill,
 *   building and wall casts into it, however far. What stands in the cell
 *   itself is left out: the picture is read between cells, and a roof's own
 *   height would spill onto the sunlit ground at its foot.
 * - `far shade`: the same from casters at least `NEAR_CASTERS` away only, for
 *   near the player, where the realtime shadow map draws the near ones
 *   crisply and the field must not smear a soft copy round them.
 * - `close` and `wide`: the heights round about, averaged over a few metres
 *   and over a few tens. A point well under them has things standing over
 *   it and sees less sky: the foot of a wall, an alley, a ravine.
 *
 * The lighting reads it by world position (see `skyLight` in
 * surface-materials.ts).
 */

/** A field cell is this many terrain cells a side. */
const COARSE = 2;
/** Casters nearer than this along the ground (m) are left out of the far shade. */
export const NEAR_CASTERS = 12;
/** How far the close and the wide averages reach (field cells either side, each averaged twice). */
const CLOSE = 1;
const WIDE = 8;
/** Stands in for "no shadow" off the grid, far under any ground. */
const NOTHING = -1000;
/** A shadow that reaches a cell lower than this under its ground (m) is kept as this: between cells, shadow gives way to light near where it truly ends. */
const SUNK = 3;

export interface SkyField {
  /** The grid's lowest (x, z) corner, and metres a side of a cell. */
  readonly origin: readonly [x: number, z: number];
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** Four heights a cell (m), row by row: shade, close, wide, far shade. */
  readonly data: Float32Array;
}

/** The highest point of `solid` over (x, z), or null where it doesn't stand over it. */
function topOver(solid: Solid, x: number, z: number): number | null {
  const o = solid.orientation;
  if (!o) return x >= solid.min[0] && x <= solid.max[0] && z >= solid.min[2] && z <= solid.max[2] ? solid.max[1] : null;
  // The stretch of the vertical line through (x, z) that lies inside the box: each of its axes bounds it.
  let low = -Infinity;
  let high = Infinity;
  for (let k = 0; k < 3; k++) {
    const axis = o.axes[k]!;
    const a = axis[0] * (x - o.center[0]) - axis[1] * o.center[1] + axis[2] * (z - o.center[2]);
    const b = axis[1];
    const half = o.half[k]!;
    if (Math.abs(b) < 1e-6) {
      if (Math.abs(a) > half) return null;
      continue;
    }
    const y0 = (-half - a) / b;
    const y1 = (half - a) / b;
    low = Math.max(low, Math.min(y0, y1));
    high = Math.min(high, Math.max(y0, y1));
  }
  return high >= low && Number.isFinite(high) ? high : null;
}

/**
 * Raises `top` to the solids standing on it. `whole`: a cell takes a solid that reaches into it at all (a thin
 * wall is then a cell thick, and casts); otherwise only one that stands over its middle. A post, thinner than a
 * cell both ways, is never made a cell thick: its shadow would be a road's width.
 */
function stand(top: Float32Array, field: { origin: readonly [number, number]; cell: number; columns: number; rows: number }, solids: readonly Solid[], whole: boolean): void {
  const { origin, cell, columns, rows } = field;
  for (const s of solids) {
    // Clip is never drawn, and a prop can be shot away.
    if (s.blocks === 'players' || s.prop !== null) continue;
    const i0 = Math.max(0, Math.floor((s.min[0] - origin[0]) / cell));
    const i1 = Math.min(columns - 1, Math.floor((s.max[0] - origin[0]) / cell));
    const j0 = Math.max(0, Math.floor((s.min[2] - origin[1]) / cell));
    const j1 = Math.min(rows - 1, Math.floor((s.max[2] - origin[1]) / cell));
    const reaches = whole && Math.max(s.max[0] - s.min[0], s.max[2] - s.min[2]) >= cell;
    for (let j = j0; j <= j1; j++) {
      const z = origin[1] + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = origin[0] + (i + 0.5) * cell;
        // Reaching into the cell: judged at the point of the solid's bounds nearest the cell's middle.
        const y = reaches ? topOver(s, Math.min(Math.max(x, s.min[0]), s.max[0]), Math.min(Math.max(z, s.min[2]), s.max[2])) : topOver(s, x, z);
        if (y !== null && y > top[j * columns + i]!) top[j * columns + i] = y;
      }
    }
  }
}

/**
 * How high the sun's shadow stands over each cell: the ground and what stands on it (`top`), or the shadow of
 * what lies toward the sun, which sinks by the sun's height as it runs. One pass, each line of cells from the
 * one toward the sun: the shadow reaching a cell is the one over the cell it came through, a step lower.
 * `reaching`, if given, is filled with that reaching shadow alone, whatever stands in the cell.
 */
export function shadeOver(top: Float32Array, columns: number, rows: number, cell: number, sun: Vec3, reaching?: Float32Array): Float32Array {
  const out = new Float32Array(top);
  reaching?.fill(NOTHING);
  const flat = Math.hypot(sun[0], sun[2]);
  // Straight overhead, nothing shades anything beside it.
  if (flat < 1e-4 || sun[1] <= 0) return out;
  const alongZ = Math.abs(sun[2]) >= Math.abs(sun[0]);
  const lines = alongZ ? rows : columns;
  const across = alongZ ? columns : rows;
  const toward = (alongZ ? sun[2] : sun[0]) > 0 ? 1 : -1;
  // Cells across for each cell toward the sun, and what the shadow loses over that step.
  const shift = (alongZ ? sun[0] : sun[2]) / Math.abs(alongZ ? sun[2] : sun[0]);
  const drop = cell * Math.hypot(1, shift) * (sun[1] / flat);
  const whole = Math.floor(shift);
  const part = shift - whole;
  const stride = alongZ ? columns : 1;
  const step = alongZ ? 1 : columns;
  for (let k = 1; k < lines; k++) {
    const line = toward > 0 ? lines - 1 - k : k;
    const here = line * stride;
    const from = (line + toward) * stride;
    for (let b = 0; b < across; b++) {
      const b0 = b + whole;
      const h0 = b0 >= 0 && b0 < across ? out[from + b0 * step]! : NOTHING;
      const h1 = part > 0 ? (b0 + 1 >= 0 && b0 + 1 < across ? out[from + (b0 + 1) * step]! : NOTHING) : h0;
      const shade = h0 + (h1 - h0) * part - drop;
      const i = here + b * step;
      if (reaching) reaching[i] = shade;
      if (shade > out[i]!) out[i] = shade;
    }
  }
  return out;
}

/** `heights` averaged over `radius` cells either side, twice over (a soft-edged average), along the rows then down the columns. */
function averaged(heights: Float32Array, columns: number, rows: number, radius: number): Float32Array {
  let a = new Float32Array(heights);
  let b = new Float32Array(heights.length);
  const run = (count: number, length: number, stride: number, step: number) => {
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      let sum = 0;
      // The edge's value stands in for what lies past it.
      for (let k = -radius; k <= radius; k++) sum += a[base + Math.min(length - 1, Math.max(0, k)) * step]!;
      for (let k = 0; k < length; k++) {
        b[base + k * step] = sum / (2 * radius + 1);
        sum += a[base + Math.min(length - 1, k + radius + 1) * step]! - a[base + Math.max(0, k - radius) * step]!;
      }
    }
    [a, b] = [b, a];
  };
  for (let pass = 0; pass < 2; pass++) {
    run(rows, columns, columns, 1);
    run(columns, rows, 1, columns);
  }
  return a;
}

/** The sky field of a map on `terrain` with `solids` standing on it, under a sun in direction `sun` (toward it). */
export function buildSkyField(terrain: TerrainData, solids: readonly Solid[], sun: Vec3): SkyField {
  const cell = terrain.cell * COARSE;
  const columns = Math.ceil(terrain.columns / COARSE);
  const rows = Math.ceil(terrain.rows / COARSE);
  const field = { origin: terrain.origin, cell, columns, rows };
  // The ground at each cell's middle, which is a corner of the terrain's. Water stands in nothing's light: the bed under it is lit through it.
  const ground = new Float32Array(columns * rows);
  const across = terrain.columns + 1;
  for (let j = 0; j < rows; j++) {
    const row = Math.min(terrain.rows, j * COARSE + 1) * across;
    for (let i = 0; i < columns; i++) ground[j * columns + i] = terrain.heights[row + Math.min(terrain.columns, i * COARSE + 1)]!;
  }
  const whole = new Float32Array(ground);
  stand(whole, field, solids, true);
  const middles = new Float32Array(ground);
  stand(middles, field, solids, false);
  const shade = new Float32Array(columns * rows);
  shadeOver(whole, columns, rows, cell, sun, shade);
  const far = shadeOver(middles, columns, rows, cell, sun);
  const close = averaged(whole, columns, rows, CLOSE);
  const wide = averaged(whole, columns, rows, WIDE);
  // The far shade over a cell is the shade `NEAR_CASTERS` toward the sun, sunk by what a shadow loses on the way.
  const flat = Math.hypot(sun[0], sun[2]);
  const dx = flat > 1e-4 ? ((sun[0] / flat) * NEAR_CASTERS) / cell : 0;
  const dz = flat > 1e-4 ? ((sun[2] / flat) * NEAR_CASTERS) / cell : 0;
  const sunk = flat > 1e-4 ? (NEAR_CASTERS * sun[1]) / flat : 0;
  const data = new Float32Array(columns * rows * 4);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const k = j * columns + i;
      const fx = Math.min(columns - 1.001, Math.max(0, i + dx));
      const fz = Math.min(rows - 1.001, Math.max(0, j + dz));
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      const at = z0 * columns + x0;
      const from = (far[at]! * (1 - tx) + far[at + 1]! * tx) * (1 - tz) + (far[at + columns]! * (1 - tx) + far[at + columns + 1]! * tx) * tz;
      data[k * 4] = Math.max(shade[k]!, whole[k]! - SUNK);
      data[k * 4 + 1] = close[k]!;
      data[k * 4 + 2] = wide[k]!;
      data[k * 4 + 3] = flat > 1e-4 && sun[1] > 0 ? from - sunk : NOTHING;
    }
  }
  return { ...field, data };
}
