import type { Vec3 } from '../math';
import { STATS } from '../stats';
import type { Solid, World } from '../world';
import { EPSILON, distanceToFootprint, hullBlocked, solidsNear, standingHeight, type Hull } from './collision';

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

/** Metres between looks at the ground ahead for a bank's foot and crest. */
const BANK_STEP = 0.1;

export interface Ledge {
  readonly band: MantleBand;
  /** Where the feet end up: standing on the ledge, one hull width past its face. */
  readonly destination: Vec3;
}

/**
 * The terrain's version of a ledge: a bank past the slope limit that starts
 * within reach and tops out at ground a player can stand on, in a height
 * band, with the hull fitting there. A slope a player can walk has no bank,
 * so jumping on it is a jump, and a steep face with no top within the
 * highest band has none either, so a mantle never climbs one.
 */
function bankAhead(world: World, feet: Vec3, dir: readonly [number, number], hull: Hull): { band: MantleBand; destination: Vec3; distance: number; height: number } | null {
  const t = world.terrain;
  if (!t) return null;
  const at = (d: number) => [feet[0] + dir[0] * d, feet[2] + dir[1] * d] as const;
  const rising = (d: number) => {
    const [x, z] = at(d);
    return t.steepAt(x, z) && t.heightAt(x, z) > feet[1] + EPSILON;
  };
  let foot = 0;
  while (foot <= MT.reach.value + hull.halfWidth && !rising(foot)) foot += BANK_STEP;
  if (foot > MT.reach.value + hull.halfWidth) return null;
  let crest = foot;
  const furthest = foot + MT.highClimbMaxHeight.value;
  while (crest <= furthest && rising(crest)) crest += BANK_STEP;
  if (crest > furthest) return null;
  const [x, z] = at(crest + 2 * hull.halfWidth);
  const top = t.heightAt(x, z);
  const band = bandFor(top - feet[1]);
  if (!band || t.steepAt(x, z) || hullBlocked(world, [x, top, z], hull) || hullBlocked(world, [feet[0], top, feet[2]], hull)) return null;
  return { band, destination: [x, top, z], distance: Math.max(0, foot - hull.halfWidth), height: top - feet[1] };
}

/**
 * Looks for a ledge to mantle in the view direction: a solid's top within
 * one of the height bands, whose face is within reach of the hull, with room
 * to rise above the player and to stand on top. Standing on top may mean a
 * step up onto what lies beyond the edge (a sloped roof's fine player clip
 * steps). The nearest such ledge wins, a bank of terrain among them.
 */
export function findLedge(world: World, feet: Vec3, yaw: number, hull: Hull): Ledge | null {
  const dir = [-Math.sin(yaw), -Math.cos(yaw)] as const;
  let best: { ledge: Ledge; distance: number; height: number } | null = null;
  for (const i of solidsNear(world, feet, MT.reach.value + 2 * hull.halfWidth)) {
    const b = world.solids[i] as Solid;
    const height = b.max[1] - feet[1];
    const band = bandFor(height);
    if (!band) continue;
    const distance = distanceToFootprint(feet, dir, b, hull);
    if (distance === null || distance > MT.reach.value) continue;
    const advance = distance + 2 * hull.halfWidth;
    const x = feet[0] + dir[0] * advance;
    const z = feet[2] + dir[1] * advance;
    const top = standingHeight(world, [x, b.max[1], z], hull, b.max[1] + STATS.movement.stepHeight.value);
    if (top === null || hullBlocked(world, [feet[0], top, feet[2]], hull)) continue;
    const destination: Vec3 = [x, top, z];
    if (!best || distance < best.distance - EPSILON || (Math.abs(distance - best.distance) <= EPSILON && height < best.height)) {
      best = { ledge: { band, destination }, distance, height };
    }
  }
  const bank = bankAhead(world, feet, dir, hull);
  if (bank && (!best || bank.distance < best.distance)) return { band: bank.band, destination: bank.destination };
  return best?.ledge ?? null;
}
