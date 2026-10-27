import { add, dot, scale, type Vec3 } from '../math';
import { STATS } from '../stats';
import type { Material, Orientation, Solid, World } from '../world';
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
  /** Penetration budget left (see the stats file's penetration table). */
  budget: number;
  /** Product of the damage multipliers of every solid passed through so far. */
  damageScale: number;
  /** Solids already passed through (or props already hit), never met again. */
  readonly passed: number[];
}

export interface WorldHit {
  /** Fraction along the segment. */
  readonly t: number;
  readonly point: Vec3;
  /** Outward face normal of the solid that was hit. */
  readonly normal: Vec3;
  readonly material: Material;
  /** Index of the solid in the world's solids. */
  readonly solid: number;
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

/** The first solid that blocks bullets the segment a→b enters, or null. Player clip and props never take part. */
export function raycastWorld(world: World, a: Vec3, b: Vec3): WorldHit | null {
  const best = world.bullets.firstHit(a, b, (i) => {
    const s = world.solids[i] as Solid;
    return s.prop === null ? segmentSolid(a, b, s) : null;
  });
  if (!best) return null;
  const solid = world.solids[best.index] as Solid;
  const point = add(a, scale([b[0] - a[0], b[1] - a[1], b[2] - a[2]], best.t));
  return { t: best.t, point, normal: solidNormal(solid, point), material: solid.material, solid: best.index };
}

/** True when a person's sight from `a` to `b` is blocked: walls, roofs and cars hide, windows and props don't. */
export function sightBlocked(world: World, a: Vec3, b: Vec3): boolean {
  return (
    world.bullets.firstHit(a, b, (i) => {
      const s = world.solids[i] as Solid;
      return s.prop === null && s.material !== 'glass' ? segmentSolid(a, b, s) : null;
    }) !== null
  );
}

/** Entry fraction of the segment a→b into a solid, or null on a miss. */
export function segmentSolid(a: Vec3, b: Vec3, s: Solid): number | null {
  const o = s.orientation;
  if (!o) return segmentBox(a, b, s.min, s.max);
  return segmentBox(toLocal(o, a), toLocal(o, b), [-o.half[0], -o.half[1], -o.half[2]], o.half);
}

/**
 * Where the line through a→b enters and leaves a solid, as fractions of a→b:
 * entry within the segment (0 if `a` is inside), exit possibly beyond `b`.
 * Null if the segment never reaches it.
 */
export function solidSpan(a: Vec3, b: Vec3, s: Solid): { enter: number; exit: number } | null {
  const o = s.orientation;
  return o ? lineBox(toLocal(o, a), toLocal(o, b), [-o.half[0], -o.half[1], -o.half[2]], o.half) : lineBox(a, b, s.min, s.max);
}

function lineBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): { enter: number; exit: number } | null {
  let enter = 0;
  let exit = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = a[i] as number;
    const d = (b[i] as number) - o;
    const lo = min[i] as number;
    const hi = max[i] as number;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return null;
  }
  return enter <= 1 ? { enter, exit } : null;
}

/** Outward normal of the solid's face nearest to a point on its surface. */
export function solidNormal(s: Solid, p: Vec3): Vec3 {
  const o = s.orientation;
  if (!o) return faceNormal(s.min, s.max, p);
  const n = faceNormal([-o.half[0], -o.half[1], -o.half[2]], o.half, toLocal(o, p));
  const [ax, ay, az] = o.axes;
  return [ax[0] * n[0] + ay[0] * n[1] + az[0] * n[2], ax[1] * n[0] + ay[1] * n[1] + az[1] * n[2], ax[2] * n[0] + ay[2] * n[1] + az[2] * n[2]];
}

/** A world point in a rotated solid's own frame, centred on it. */
function toLocal(o: Orientation, p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - o.center[0], p[1] - o.center[1], p[2] - o.center[2]];
  return [dot(d, o.axes[0]), dot(d, o.axes[1]), dot(d, o.axes[2])];
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
