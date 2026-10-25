import type { Vec3 } from '../math';
import { STATS } from '../stats';
import type { World } from '../world';
import { EPSILON, hullBlocked, type Hull } from './collision';

/** The three MW2019 mantle height bands, lowest first. */
export type MantleBand = 'lowVault' | 'waist' | 'highClimb';

const MT = STATS.mantle;

/** The band for a ledge `height` metres above the feet, or null outside every band. */
function bandFor(height: number): MantleBand | null {
  if (height <= STATS.movement.stepHeight.value + EPSILON) return null;
  if (height <= MT.lowVaultMaxHeight.value) return 'lowVault';
  if (height <= MT.waistMantleMaxHeight.value) return 'waist';
  if (height <= MT.highClimbMaxHeight.value) return 'highClimb';
  return null;
}

/** Stats-file duration of a mantle in each band (s). */
export function mantleDuration(band: MantleBand): number {
  return (band === 'lowVault' ? MT.lowVaultDuration : band === 'waist' ? MT.waistMantleDuration : MT.highClimbDuration).value;
}

export interface Ledge {
  readonly band: MantleBand;
  /** Where the feet end up: standing on the ledge, one hull width past its face. */
  readonly destination: Vec3;
}

/**
 * Distance along the ray (origin, dir) on the X/Z plane to the box's
 * footprint grown by the hull half-width, or null on a miss. 0 when the
 * hull already touches the box.
 */
function distanceToFootprint(origin: Vec3, dir: readonly [number, number], min: Vec3, max: Vec3, grow: number): number | null {
  let enter = -Infinity;
  let exit = Infinity;
  for (const [o, d, lo, hi] of [
    [origin[0], dir[0], min[0] - grow, max[0] + grow],
    [origin[2], dir[1], min[2] - grow, max[2] + grow],
  ] as const) {
    if (Math.abs(d) < EPSILON) {
      if (o < lo - EPSILON || o > hi + EPSILON) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
  }
  if (enter > exit || exit < 0) return null;
  return Math.max(0, enter);
}

/**
 * Looks for a ledge to mantle in the view direction: a box top within one of
 * the height bands, whose face is within reach of the hull, with room to
 * rise above the player and to stand on top. The nearest such ledge wins.
 */
export function findLedge(world: World, feet: Vec3, yaw: number, hull: Hull): Ledge | null {
  const dir = [-Math.sin(yaw), -Math.cos(yaw)] as const;
  let best: { ledge: Ledge; distance: number; height: number } | null = null;
  for (const b of world.boxes) {
    const height = b.max[1] - feet[1];
    const band = bandFor(height);
    if (!band) continue;
    const distance = distanceToFootprint(feet, dir, b.min, b.max, hull.halfWidth);
    if (distance === null || distance > MT.reach.value) continue;
    const top = b.max[1];
    const advance = distance + 2 * hull.halfWidth;
    const destination: Vec3 = [feet[0] + dir[0] * advance, top, feet[2] + dir[1] * advance];
    if (hullBlocked(world, [feet[0], top, feet[2]], hull) || hullBlocked(world, destination, hull)) continue;
    if (!best || distance < best.distance - EPSILON || (Math.abs(distance - best.distance) <= EPSILON && height < best.height)) {
      best = { ledge: { band, destination }, distance, height };
    }
  }
  return best?.ledge ?? null;
}
