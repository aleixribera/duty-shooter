/**
 * A 3D vector as a plain tuple, so simulation outputs stay serialisable and
 * comparable with deep equality.
 *
 * World convention: 1 unit = 1 metre, Y is up (matching Three.js), and a
 * player facing yaw 0 looks down -Z.
 */
export type Vec3 = readonly [x: number, y: number, z: number];

export const ZERO: Vec3 = [0, 0, 0];

export const DEG = Math.PI / 180;

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Unit view direction for a yaw and pitch (yaw 0 looks down -Z, positive pitch looks up). */
export function viewDirection(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** Yaw and pitch of a direction (inverse of {@link viewDirection}). */
export function anglesOf(dir: Vec3): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(-dir[0], -dir[2]), pitch: Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) };
}

/** The shortest signed turn from angle a to angle b (radians, -π..π). */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
