import type { Vec3 } from '@duty-shooter/fps-core';

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * The fixed warm afternoon both the bake and the renderer use: a sun low in
 * the south-west (about 38 degrees up), a blue sky warming toward the
 * horizon, and sunlit desert below it. Colours are linear.
 */
export const LIGHTING = {
  /** Toward the sun. */
  sunDirection: normalize([-0.55, 0.62, 0.55]),
  sunColor: [1.0, 0.86, 0.68] as Vec3,
  sunIntensity: 2.7,
  /** Half-angle (rad) of the cone the bake jitters sun rays in, for soft shadow edges. */
  sunSpread: 0.02,
  skyZenith: [0.3, 0.46, 0.78] as Vec3,
  skyHorizon: [0.86, 0.8, 0.7] as Vec3,
  skyIntensity: 0.85,
  /** Light coming up from the ground past the edge of the world. */
  ground: [0.42, 0.36, 0.27] as Vec3,
} as const;

/** Sky radiance in direction `d` (unit). */
export function skyRadiance(d: Vec3): Vec3 {
  if (d[1] <= 0) return LIGHTING.ground;
  const k = Math.sqrt(d[1]);
  const z = LIGHTING.skyZenith;
  const h = LIGHTING.skyHorizon;
  const s = LIGHTING.skyIntensity;
  return [(h[0] + (z[0] - h[0]) * k) * s, (h[1] + (z[1] - h[1]) * k) * s, (h[2] + (z[2] - h[2]) * k) * s];
}

/** An sRGB hex colour in linear RGB. */
export function linearRgb(hex: number): Vec3 {
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

/** Stored indirect light reaches this value (linear) at full scale. */
export const INDIRECT_RANGE = 2;

/** Encodes a linear light value (0..INDIRECT_RANGE) into a byte, with more precision in the darks. */
export function encodeLight(v: number): number {
  return Math.round(Math.sqrt(Math.min(1, Math.max(0, v / INDIRECT_RANGE))) * 255);
}
