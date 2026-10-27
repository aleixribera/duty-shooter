import type { Vec3 } from '../math';
import type { Stance } from '../movement/pmove';
import { STATS } from '../stats';

/** The MW2019 hit zones. */
export type HitZone = 'head' | 'neck' | 'upperTorso' | 'lowerTorso' | 'arm' | 'leg';

/** A hitbox in the player's local frame: x right, y up from the feet, z forward. */
interface LocalBox {
  readonly zone: HitZone;
  readonly min: Vec3;
  readonly max: Vec3;
}

const local = (zone: HitZone, min: Vec3, max: Vec3): LocalBox => ({ zone, min, max });

/**
 * Standing hitboxes, sized to the standing hull (1.78 m) and eye height
 * (1.52 m). Arms sit forward, as a soldier holding a rifle at the ready.
 */
const STANDING: readonly LocalBox[] = [
  local('head', [-0.11, 1.46, -0.12], [0.11, 1.76, 0.13]),
  local('neck', [-0.07, 1.36, -0.07], [0.07, 1.46, 0.07]),
  local('upperTorso', [-0.21, 1.06, -0.13], [0.21, 1.36, 0.13]),
  local('lowerTorso', [-0.19, 0.86, -0.12], [0.19, 1.06, 0.12]),
  local('arm', [-0.31, 1.0, -0.08], [-0.21, 1.36, 0.3]),
  local('arm', [0.21, 1.0, -0.08], [0.31, 1.36, 0.3]),
  local('leg', [-0.19, 0, -0.1], [-0.01, 0.86, 0.1]),
  local('leg', [0.01, 0, -0.1], [0.19, 0.86, 0.1]),
];

/** Prone hitboxes: the body lies along the facing direction, head forward of the feet position. */
const PRONE: readonly LocalBox[] = [
  local('head', [-0.11, 0.06, 0.62], [0.11, 0.34, 0.88]),
  local('neck', [-0.07, 0.06, 0.52], [0.07, 0.24, 0.62]),
  local('upperTorso', [-0.21, 0, 0.12], [0.21, 0.28, 0.52]),
  local('lowerTorso', [-0.19, 0, -0.1], [0.19, 0.25, 0.12]),
  local('arm', [-0.36, 0, 0.3], [-0.21, 0.24, 0.9]),
  local('arm', [0.21, 0, 0.3], [0.36, 0.24, 0.9]),
  local('leg', [-0.19, 0, -0.98], [-0.01, 0.2, -0.1]),
  local('leg', [0.01, 0, -0.98], [0.19, 0.2, -0.1]),
];

/** What a hitbox test needs to know about one player at one moment. */
export interface HitPose {
  readonly position: Vec3;
  readonly yaw: number;
  readonly stance: Stance;
  readonly eyeHeight: number;
}

export interface BodyHit {
  readonly zone: HitZone;
  /** Fraction along the segment where it enters the hitbox, in [0, 1]. */
  readonly t: number;
}

/** The pose's hitboxes, with standing and crouching boxes squashed to the current eye height. */
function boxesFor(pose: HitPose): readonly LocalBox[] {
  if (pose.stance === 'prone' && pose.eyeHeight <= STATS.stance.crouchEyeHeight.value) return PRONE;
  const k = pose.eyeHeight / STATS.stance.standEyeHeight.value;
  if (Math.abs(k - 1) < 1e-9) return STANDING;
  return STANDING.map((b) => local(b.zone, [b.min[0], b.min[1] * k, b.min[2]], [b.max[0], b.max[1] * k, b.max[2]]));
}

/** The pose's hitboxes in its local frame (x right, y up from the feet, z forward): what a shot is tested against. */
export function hitboxes(pose: HitPose): readonly { readonly zone: HitZone; readonly min: Vec3; readonly max: Vec3 }[] {
  return boxesFor(pose);
}

/** World point to the pose's local frame (x right, y up, z forward). */
function toLocal(pose: HitPose, p: Vec3): Vec3 {
  const dx = p[0] - pose.position[0];
  const dz = p[2] - pose.position[2];
  const s = Math.sin(pose.yaw);
  const c = Math.cos(pose.yaw);
  // forward = (-s, -c), right = (c, -s) on the X/Z plane.
  return [dx * c - dz * s, p[1] - pose.position[1], -dx * s - dz * c];
}

/** Entry fraction of the segment a→b into an axis-aligned box, or null on a miss. */
export function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): number | null {
  let enter = 0;
  let exit = 1;
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
  return enter;
}

/** The first hitbox the segment a→b enters, or null. */
export function hitBody(pose: HitPose, a: Vec3, b: Vec3): BodyHit | null {
  const la = toLocal(pose, a);
  const lb = toLocal(pose, b);
  let best: BodyHit | null = null;
  for (const box of boxesFor(pose)) {
    const t = segmentBox(la, lb, box.min, box.max);
    if (t !== null && (!best || t < best.t)) best = { zone: box.zone, t };
  }
  return best;
}

/** World-space centre of the first hitbox of `zone`, for aiming in tests and for bots. */
export function zoneCentre(pose: HitPose, zone: HitZone): Vec3 {
  const box = boxesFor(pose).find((b) => b.zone === zone);
  if (!box) throw new Error(`no ${zone} hitbox`);
  return boxCentre(pose, box);
}

/** World-space centre of every hitbox, with its zone (a blast tests each part). */
export function partCentres(pose: HitPose): { readonly zone: HitZone; readonly centre: Vec3 }[] {
  return boxesFor(pose).map((box) => ({ zone: box.zone, centre: boxCentre(pose, box) }));
}

function boxCentre(pose: HitPose, box: LocalBox): Vec3 {
  const x = (box.min[0] + box.max[0]) / 2;
  const y = (box.min[1] + box.max[1]) / 2;
  const z = (box.min[2] + box.max[2]) / 2;
  const s = Math.sin(pose.yaw);
  const c = Math.cos(pose.yaw);
  return [pose.position[0] + x * c - z * s, pose.position[1] + y, pose.position[2] - x * s - z * c];
}
