import { add, scale, type Vec3 } from '../math';
import { STATS } from '../stats';
import type { Material, World } from '../world';
import { segmentBox } from './hitboxes';

/** A bullet in flight. Simulated with gravity drop; never interacts with other bullets. */
export interface Projectile {
  readonly shooter: string;
  /** Where it left the muzzle, for damage-by-distance. */
  readonly origin: Vec3;
  position: Vec3;
  velocity: Vec3;
  /** Ticks of lag compensation: hitboxes are tested this far in the past for the bullet's whole flight. */
  readonly rewind: number;
  /** Seconds to advance on the next step (part of a tick for a bullet fired mid-tick). */
  pending: number;
}

export interface WorldHit {
  /** Fraction along the segment. */
  readonly t: number;
  readonly point: Vec3;
  /** Outward face normal of the box that was hit. */
  readonly normal: Vec3;
  readonly material: Material;
}

/** Where a bullet moves over `seconds`: ballistic, exact within the step. */
export function advance(p: Projectile, seconds: number): { from: Vec3; to: Vec3; velocity: Vec3 } {
  const g = STATS.weapon.projectileGravity.value;
  const from = p.position;
  const to: Vec3 = [
    from[0] + p.velocity[0] * seconds,
    from[1] + p.velocity[1] * seconds - 0.5 * g * seconds * seconds,
    from[2] + p.velocity[2] * seconds,
  ];
  return { from, to, velocity: [p.velocity[0], p.velocity[1] - g * seconds, p.velocity[2]] };
}

/** The first world box the segment a→b enters, or null. */
export function raycastWorld(world: World, a: Vec3, b: Vec3): WorldHit | null {
  let best: { t: number; index: number } | null = null;
  world.boxes.forEach((box, index) => {
    const t = segmentBox(a, b, box.min, box.max);
    if (t !== null && (!best || t < best.t)) best = { t, index };
  });
  if (!best) return null;
  const { t, index } = best as { t: number; index: number };
  const box = world.boxes[index]!;
  const point = add(a, scale([b[0] - a[0], b[1] - a[1], b[2] - a[2]], t));
  return { t, point, normal: faceNormal(box.min, box.max, point), material: box.material };
}

/** Normal of the box face nearest to a point on its surface. */
function faceNormal(min: Vec3, max: Vec3, p: Vec3): Vec3 {
  let best = Infinity;
  let normal: Vec3 = [0, 1, 0];
  for (let i = 0; i < 3; i++) {
    const lo = Math.abs((p[i] as number) - (min[i] as number));
    const hi = Math.abs((max[i] as number) - (p[i] as number));
    if (lo < best) {
      best = lo;
      normal = [i === 0 ? -1 : 0, i === 1 ? -1 : 0, i === 2 ? -1 : 0];
    }
    if (hi < best) {
      best = hi;
      normal = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0];
    }
  }
  return normal;
}
