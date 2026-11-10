import { sightBlocked, smokeHides, type SmokeCloud, type Vec3, type World } from '@duty-shooter/fps-core';

/**
 * Whether the aim helps (touch's slowdown and auto-fire, the pad's slowdown)
 * may know of a body at `to` from `eye`. A wall, soft cover or a standing
 * smoke hides it from them as it does from the player's own eyes: a stick
 * that slowed on a man inside a cloud would tell where he is.
 *
 * The clouds come from the grenades the client sees, at `time` on the
 * server's clock, because a client's predicting world keeps none of its own.
 */
export function aimSees(world: World, clouds: readonly SmokeCloud[], time: number, eye: Vec3, to: Vec3): boolean {
  if (sightBlocked(world, eye, to)) return false;
  if (world.concealment?.hides(eye, to)) return false;
  return !clouds.some((c) => smokeHides(c, eye, to, time));
}
