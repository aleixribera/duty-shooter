import type { Vec3 } from './math';

/**
 * Surface material carried by every world box. Drives impact effects and
 * footstep sounds, and leaves room for bullet penetration later.
 */
export type Material =
  | 'concrete'
  | 'metal'
  | 'wood'
  | 'dirt'
  | 'grass'
  | 'glass'
  | 'plaster';

/** An axis-aligned box in world space (metres), tagged with a material. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly material: Material;
}

/** The static level geometry the simulation collides against. */
export interface World {
  readonly boxes: readonly Box[];
}

/** Builds a box, normalising min/max so either corner order is accepted. */
export function box(spec: { min: Vec3; max: Vec3; material: Material }): Box {
  const [ax, ay, az] = spec.min;
  const [bx, by, bz] = spec.max;
  return {
    min: [Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)],
    max: [Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)],
    material: spec.material,
  };
}

export function createWorld(boxes: readonly Box[]): World {
  return { boxes: [...boxes] };
}
