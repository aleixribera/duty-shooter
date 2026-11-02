import type { TerrainData } from '@duty-shooter/fps-core';

/** The square of ground a map shows: its west and north edges and its size, in metres. */
export interface MapBounds {
  readonly x0: number;
  readonly z0: number;
  readonly size: number;
}

/** The square round a terrain's rectangle, centred on it. */
export function terrainBounds(data: TerrainData): MapBounds {
  const w = data.columns * data.cell;
  const h = data.rows * data.cell;
  const size = Math.max(w, h);
  return { x0: data.origin[0] + (w - size) / 2, z0: data.origin[1] + (h - size) / 2, size };
}

/** Where ground point (x, z) falls on a map `pixels` across, north up. */
export function mapPoint(bounds: MapBounds, pixels: number, x: number, z: number): readonly [number, number] {
  return [((x - bounds.x0) / bounds.size) * pixels, ((z - bounds.z0) / bounds.size) * pixels];
}

/** The sea, deep and shallow, as the map paints it. */
const SEA_DEEP = [14, 26, 38] as const;
const SEA_SHALLOW = [30, 58, 72] as const;
/** The light comes from the north-west, as on a printed map. */
const LIGHT = [-0.6, 0.55, -0.6] as const;

/**
 * The island as a picture `pixels` square (RGBA, row by row, north up): each
 * pixel the colour of the ground's palette entry under it, shaded by the
 * slope against a north-west light, and the sea darkening with depth. Painted
 * once a match, off the terrain the client already has.
 */
export function paintIsland(data: TerrainData, colors: readonly number[], pixels: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels * pixels * 4);
  const b = terrainBounds(data);
  const stride = data.columns + 1;
  const step = b.size / pixels;
  const height = (x: number, z: number): number | null => {
    const i = Math.round((x - data.origin[0]) / data.cell);
    const j = Math.round((z - data.origin[1]) / data.cell);
    if (i < 0 || j < 0 || i > data.columns || j > data.rows) return null;
    return data.heights[j * stride + i]!;
  };
  const water = (x: number, z: number): number => {
    if (!data.water) return -Infinity;
    const i = Math.round((x - data.origin[0]) / data.cell);
    const j = Math.round((z - data.origin[1]) / data.cell);
    return data.water[Math.max(0, Math.min(data.rows, j)) * stride + Math.max(0, Math.min(data.columns, i))]!;
  };
  const len = Math.hypot(...LIGHT);
  for (let py = 0; py < pixels; py++) {
    const z = b.z0 + (py + 0.5) * step;
    for (let px = 0; px < pixels; px++) {
      const x = b.x0 + (px + 0.5) * step;
      const o = (py * pixels + px) * 4;
      const y = height(x, z);
      const wet = y === null ? 0 : water(x, z) - y;
      if (y === null || y < 0 || wet > 0.05) {
        const deep = y === null ? 1 : Math.min(1, Math.max(0, (-(y ?? 0)) / 5, wet / 5));
        for (let c = 0; c < 3; c++) out[o + c] = SEA_SHALLOW[c]! + (SEA_DEEP[c]! - SEA_SHALLOW[c]!) * deep;
        out[o + 3] = 255;
        continue;
      }
      const i = Math.min(data.columns - 1, Math.max(0, Math.floor((x - data.origin[0]) / data.cell)));
      const j = Math.min(data.rows - 1, Math.max(0, Math.floor((z - data.origin[1]) / data.cell)));
      const hex = colors[data.materials ? (data.materials[j * data.columns + i] ?? 0) : 0] ?? 0x808080;
      // Slope from the neighbours one map pixel off, lit from the north-west.
      const dx = ((height(x + step, z) ?? y) - (height(x - step, z) ?? y)) / (2 * step);
      const dz = ((height(x, z + step) ?? y) - (height(x, z - step) ?? y)) / (2 * step);
      const n = [-dx, 1, -dz];
      const lit = Math.max(0, (n[0]! * LIGHT[0] + n[1]! * LIGHT[1] + n[2]! * LIGHT[2]) / (Math.hypot(n[0]!, 1, n[2]!) * len));
      const shade = 0.55 + 0.6 * lit;
      // Darkened toward the map's ink, so overlays in white and the hazard colour stand out on it.
      out[o] = ((hex >> 16) & 255) * shade * 0.78;
      out[o + 1] = ((hex >> 8) & 255) * shade * 0.78;
      out[o + 2] = (hex & 255) * shade * 0.78;
      out[o + 3] = 255;
    }
  }
  return out;
}
