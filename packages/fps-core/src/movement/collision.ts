import type { Vec3 } from '../math';
import type { Box, World } from '../world';

/**
 * Collision of the player's axis-aligned hull against the world's boxes.
 * Movement is resolved one axis at a time with exact sweeps, so a fast
 * player never tunnels through a thin box.
 */

/** Numerical slack for touching faces. Not a gameplay value. */
export const EPSILON = 1e-6;

/** The player's collision box: centred on the feet position in X/Z, from the feet up to `height`. */
export interface Hull {
  readonly halfWidth: number;
  readonly height: number;
}

/** Index into a Vec3: 0 = X, 1 = Y (up), 2 = Z. */
export type Axis = 0 | 1 | 2;
export const X: Axis = 0;
export const Y: Axis = 1;
export const Z: Axis = 2;
const AXES: readonly Axis[] = [X, Y, Z];

function hullMin(pos: Vec3, hull: Hull, axis: Axis): number {
  return axis === Y ? pos[1] : pos[axis] - hull.halfWidth;
}

function hullMax(pos: Vec3, hull: Hull, axis: Axis): number {
  return axis === Y ? pos[1] + hull.height : pos[axis] + hull.halfWidth;
}

/** True when the hull and box overlap by more than EPSILON on `axis` (touching faces do not overlap). */
function overlapsOn(pos: Vec3, hull: Hull, b: Box, axis: Axis): boolean {
  return hullMin(pos, hull, axis) < b.max[axis] - EPSILON && hullMax(pos, hull, axis) > b.min[axis] + EPSILON;
}

/** True when the hull at `pos` overlaps any box. */
export function hullBlocked(world: World, pos: Vec3, hull: Hull): boolean {
  return world.boxes.some((b) => overlapsOn(pos, hull, b, X) && overlapsOn(pos, hull, b, Y) && overlapsOn(pos, hull, b, Z));
}

export interface SweepResult {
  /** How far the hull can move along the axis (same sign as the request, never longer). */
  readonly moved: number;
  /** True when a box stopped the hull short of the requested distance. */
  readonly hit: boolean;
}

/**
 * Sweeps the hull along one axis by `delta`. Boxes the hull already
 * penetrates are ignored, so a hull that starts inside geometry can move out.
 */
export function sweep(world: World, pos: Vec3, hull: Hull, axis: Axis, delta: number): SweepResult {
  if (delta === 0) return { moved: 0, hit: false };
  const others = AXES.filter((a) => a !== axis);
  let allowed = Math.abs(delta);
  let hit = false;
  for (const b of world.boxes) {
    if (!others.every((a) => overlapsOn(pos, hull, b, a))) continue;
    const gap = delta > 0 ? b.min[axis] - hullMax(pos, hull, axis) : hullMin(pos, hull, axis) - b.max[axis];
    if (gap < -EPSILON) continue;
    const clamped = Math.max(0, gap);
    if (clamped <= allowed) {
      allowed = clamped;
      hit = true;
    }
  }
  return { moved: Math.sign(delta) * allowed, hit };
}

export function offset(pos: Vec3, axis: Axis, delta: number): Vec3 {
  const out: [number, number, number] = [pos[0], pos[1], pos[2]];
  out[axis] += delta;
  return out;
}
