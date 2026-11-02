import { sightBlocked } from '../combat/projectiles';
import type { Vec3 } from '../math';
import type { World } from '../world';

/**
 * Whether a bot's eye at `from` can see `to`. Everything a bot believes it saw
 * comes through here, so soft cover (`world.concealment`, from ticket 29's
 * foliage) hides a body from it the moment a map supplies some. Bullets don't
 * ask: `sightBlocked` and the shot itself stay with what's solid.
 */
export function botSees(world: World, from: Vec3, to: Vec3): boolean {
  return !sightBlocked(world, from, to) && world.concealment?.hides(from, to) !== true;
}
