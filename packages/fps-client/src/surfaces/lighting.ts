import type { Vec3 } from '@duty-shooter/fps-core';

/** `v` scaled to unit length. */
export const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * A map's fixed light, shared by its bake and the renderer: the sun (its
 * direction, colour and strength), the sky from horizon to zenith, and the
 * light coming up from the ground past the edge of the world. Colours are
 * linear.
 */
export interface Lighting {
  /** Toward the sun (unit). */
  readonly sunDirection: Vec3;
  readonly sunColor: Vec3;
  readonly sunIntensity: number;
  /** Half-angle (rad) of the cone the bake jitters sun rays in, for soft shadow edges. */
  readonly sunSpread: number;
  readonly skyZenith: Vec3;
  readonly skyHorizon: Vec3;
  readonly skyIntensity: number;
  /** Light coming up from the ground past the edge of the world. */
  readonly ground: Vec3;
}

/**
 * The warm afternoon (Survival Town and the range): a sun low in the
 * south-west (about 38 degrees up), a blue sky warming toward the horizon,
 * and sunlit desert below it.
 */
export const LIGHTING: Lighting = {
  sunDirection: normalize([-0.55, 0.62, 0.55]),
  sunColor: [1.0, 0.86, 0.68],
  sunIntensity: 2.7,
  sunSpread: 0.02,
  skyZenith: [0.3, 0.46, 0.78],
  skyHorizon: [0.86, 0.8, 0.7],
  skyIntensity: 0.85,
  ground: [0.42, 0.36, 0.27],
};

/** Sky radiance in direction `d` (unit) under `lighting`. */
export function skyRadiance(d: Vec3, lighting: Lighting = LIGHTING): Vec3 {
  if (d[1] <= 0) return lighting.ground;
  const k = Math.sqrt(d[1]);
  const z = lighting.skyZenith;
  const h = lighting.skyHorizon;
  const s = lighting.skyIntensity;
  return [(h[0] + (z[0] - h[0]) * k) * s, (h[1] + (z[1] - h[1]) * k) * s, (h[2] + (z[2] - h[2]) * k) * s];
}

/** A lamp the bake lights the world with: a point of light, fading with the square of distance out to `range` m. */
export interface Lamp {
  readonly position: Vec3;
  /** Linear colour. */
  readonly color: Vec3;
  /** Light at 1 m (linear, in the sun's units). */
  readonly intensity: number;
  readonly range: number;
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
