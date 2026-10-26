import type { Vec3 } from '../math';
import type { Solid, World } from '../world';

/**
 * Collision of the player's hull against the solids that block players.
 * The hull is an axis-aligned box; solids are axis-aligned or turned about
 * the vertical axis, so every test is a separating-axis test on the ground
 * plane (the world X and Z axes and the solid's own two axes) plus the
 * vertical overlap. Moves are exact sweeps, so a fast player never tunnels
 * through a thin solid.
 */

/** Numerical slack for touching faces. Not a gameplay value. */
export const EPSILON = 1e-6;
/** Below this, a move does not travel along an axis at all (numerical). */
const PARALLEL = 1e-9;

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

/** A direction on the ground plane. */
export type Flat = readonly [x: number, z: number];

/** True when the hull and solid overlap vertically by more than EPSILON (touching faces do not overlap). */
function overlapsY(pos: Vec3, hull: Hull, s: Solid): boolean {
  return pos[1] < s.max[1] - EPSILON && pos[1] + hull.height > s.min[1] + EPSILON;
}

/**
 * The hull's and the solid's extents along one ground-plane axis. Axis 0 is
 * world X, 1 is world Z, 2 and 3 are a rotated solid's own x and z axes.
 */
function project(pos: Vec3, hull: Hull, s: Solid, axis: number): { normal: Flat; hMin: number; hMax: number; sMin: number; sMax: number } {
  const o = s.orientation;
  const w = hull.halfWidth;
  if (axis < 2) {
    const i = axis === 0 ? 0 : 2;
    return { normal: axis === 0 ? [1, 0] : [0, 1], hMin: pos[i] - w, hMax: pos[i] + w, sMin: s.min[i], sMax: s.max[i] };
  }
  const a = o!.axes[axis === 2 ? 0 : 2];
  const n: Flat = [a[0], a[2]];
  const hc = pos[0] * n[0] + pos[2] * n[1];
  const hr = w * (Math.abs(n[0]) + Math.abs(n[1]));
  const sc = o!.center[0] * n[0] + o!.center[2] * n[1];
  const sr = axis === 2 ? o!.half[0] : o!.half[2];
  return { normal: n, hMin: hc - hr, hMax: hc + hr, sMin: sc - sr, sMax: sc + sr };
}

function axesOf(s: Solid): number {
  return s.orientation ? 4 : 2;
}

/** True when the hull's ground-plane footprint overlaps the solid's by more than EPSILON. */
function overlapsFlat(pos: Vec3, hull: Hull, s: Solid): boolean {
  for (let axis = 0; axis < axesOf(s); axis++) {
    const p = project(pos, hull, s, axis);
    if (!(p.hMax > p.sMin + EPSILON && p.hMin < p.sMax - EPSILON)) return false;
  }
  return true;
}

function nearby(world: World, x0: number, z0: number, x1: number, z1: number): readonly number[] {
  return world.movement.inRect(x0, z0, x1, z1);
}

/** True when the hull at `pos` overlaps any solid that blocks players. */
export function hullBlocked(world: World, pos: Vec3, hull: Hull): boolean {
  const w = hull.halfWidth;
  for (const i of nearby(world, pos[0] - w, pos[2] - w, pos[0] + w, pos[2] + w)) {
    const s = world.solids[i] as Solid;
    if (overlapsY(pos, hull, s) && overlapsFlat(pos, hull, s)) return true;
  }
  return false;
}

export interface SweepResult {
  /** How far the hull can move along the axis (same sign as the request, never longer). */
  readonly moved: number;
  /** True when a solid stopped the hull short of the requested distance. */
  readonly hit: boolean;
}

/**
 * Sweeps the hull vertically by `delta`. Solids the hull already penetrates
 * are ignored, so a hull that starts inside geometry can move out.
 */
export function sweepY(world: World, pos: Vec3, hull: Hull, delta: number): SweepResult {
  if (delta === 0) return { moved: 0, hit: false };
  const w = hull.halfWidth;
  let allowed = Math.abs(delta);
  let hit = false;
  for (const i of nearby(world, pos[0] - w, pos[2] - w, pos[0] + w, pos[2] + w)) {
    const s = world.solids[i] as Solid;
    if (!overlapsFlat(pos, hull, s)) continue;
    const gap = delta > 0 ? s.min[1] - (pos[1] + hull.height) : pos[1] - s.max[1];
    if (gap < -EPSILON) continue;
    const clamped = Math.max(0, gap);
    if (clamped <= allowed) {
      allowed = clamped;
      hit = true;
    }
  }
  return { moved: Math.sign(delta) * allowed, hit };
}

/** Where the first solid stops a ground-plane move: the distance along it, and the face normal (pointing back at the hull). */
interface Contact {
  readonly distance: number;
  readonly normal: Flat;
}

/**
 * The first contact of the hull moving `length` metres along the unit
 * ground-plane direction `dir`, or null if it gets there freely. A solid
 * stops the hull where their surfaces touch. Solids the hull already
 * penetrates are ignored (so it can move out), and so are solids it only
 * touches while moving along or away from them (so it slides).
 */
function sweepFlat(world: World, pos: Vec3, hull: Hull, dir: Flat, length: number): Contact | null {
  const w = hull.halfWidth;
  const ex = pos[0] + dir[0] * length;
  const ez = pos[2] + dir[1] * length;
  let best: Contact | null = null;
  for (const i of nearby(world, Math.min(pos[0], ex) - w, Math.min(pos[2], ez) - w, Math.max(pos[0], ex) + w, Math.max(pos[2], ez) + w)) {
    const s = world.solids[i] as Solid;
    if (!overlapsY(pos, hull, s)) continue;
    let enter = -Infinity;
    let exit = Infinity;
    let normal: Flat = [0, 0];
    let penetrating = true;
    let blocks = true;
    for (let axis = 0; axis < axesOf(s) && blocks; axis++) {
      const p = project(pos, hull, s, axis);
      const r = dir[0] * p.normal[0] + dir[1] * p.normal[1];
      const depth = Math.min(p.hMax - p.sMin, p.sMax - p.hMin);
      if (Math.abs(r) < PARALLEL) {
        // The move does not travel along this axis: it separates them for good, or never does.
        if (!(depth > EPSILON)) blocks = false;
        continue;
      }
      if (depth <= EPSILON) {
        penetrating = false;
        // Touching or apart along this axis: only a move toward the solid can meet it.
        const below = p.hMin + p.hMax < p.sMin + p.sMax;
        if (below ? r < 0 : r > 0) blocks = false;
      }
      const e1 = r > 0 ? (p.sMin - p.hMax) / r : (p.sMax - p.hMin) / r;
      const e2 = r > 0 ? (p.sMax - p.hMin) / r : (p.sMin - p.hMax) / r;
      if (e1 > enter) {
        enter = e1;
        normal = r > 0 ? [-p.normal[0], -p.normal[1]] : p.normal;
      }
      exit = Math.min(exit, e2);
    }
    if (!blocks || penetrating) continue;
    const distance = Math.max(0, enter);
    if (exit <= distance || distance >= length) continue;
    if (!best || distance < best.distance) best = { distance, normal };
  }
  return best;
}

export interface MoveResult {
  readonly pos: Vec3;
  /** Faces the move ran into, in order; empty when nothing stopped it. */
  readonly normals: readonly Flat[];
}

/**
 * Moves horizontally by (dx, dz), sliding along whatever stops the hull:
 * after each contact the rest of the move loses its part into the face. Two
 * faces that pinch the move (a corner) stop it.
 */
export function slideMove(world: World, pos: Vec3, hull: Hull, dx: number, dz: number): MoveResult {
  let p = pos;
  let rx = dx;
  let rz = dz;
  const normals: Flat[] = [];
  for (let bump = 0; bump < 4; bump++) {
    const length = Math.hypot(rx, rz);
    if (length < 1e-12) break;
    const contact = sweepFlat(world, p, hull, [rx / length, rz / length], length);
    if (!contact) {
      p = [p[0] + rx, p[1], p[2] + rz];
      break;
    }
    const f = contact.distance / length;
    p = [p[0] + rx * f, p[1], p[2] + rz * f];
    rx *= 1 - f;
    rz *= 1 - f;
    const n = contact.normal;
    normals.push(n);
    const into = rx * n[0] + rz * n[1];
    if (into < 0) {
      rx -= n[0] * into;
      rz -= n[1] * into;
    }
    if (normals.some((m) => rx * m[0] + rz * m[1] < -1e-12)) break;
  }
  return { pos: p, normals };
}

/** Removes the parts of a ground-plane velocity that run into the given faces. */
export function clipVelocity(vx: number, vz: number, normals: readonly Flat[]): Flat {
  let x = vx;
  let z = vz;
  for (const n of normals) {
    const into = x * n[0] + z * n[1];
    if (into < 0) {
      x -= n[0] * into;
      z -= n[1] * into;
    }
  }
  // Pinched in a corner: nothing left that does not run into a face.
  if (normals.some((n) => x * n[0] + z * n[1] < -1e-9)) return [0, 0];
  return [x, z];
}

/**
 * How far the hull, moving along the unit ground-plane direction `dir` from
 * `origin`, travels before its footprint touches the solid's (0 if it already
 * does), or null if it never does. Ignores height.
 */
export function distanceToFootprint(origin: Vec3, dir: Flat, s: Solid, hull: Hull): number | null {
  let enter = -Infinity;
  let exit = Infinity;
  for (let axis = 0; axis < axesOf(s); axis++) {
    const p = project(origin, hull, s, axis);
    // The hull centre against the solid's extent grown by the hull's own.
    const o = axis === 0 ? origin[0] : axis === 1 ? origin[2] : origin[0] * p.normal[0] + origin[2] * p.normal[1];
    const grow = axis < 2 ? hull.halfWidth : hull.halfWidth * (Math.abs(p.normal[0]) + Math.abs(p.normal[1]));
    const lo = p.sMin - grow;
    const hi = p.sMax + grow;
    const d = dir[0] * p.normal[0] + dir[1] * p.normal[1];
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

/** Solids that block players near a point, for callers with their own tests (mantling). */
export function solidsNear(world: World, pos: Vec3, radius: number): readonly number[] {
  return nearby(world, pos[0] - radius, pos[2] - radius, pos[0] + radius, pos[2] + radius);
}

export function offset(pos: Vec3, axis: Axis, delta: number): Vec3 {
  const out: [number, number, number] = [pos[0], pos[1], pos[2]];
  out[axis] += delta;
  return out;
}
