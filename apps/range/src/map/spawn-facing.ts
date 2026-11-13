import { STATS, createWorld, segmentSolid, viewDirection, type Solid, type SpawnPoint, type Vec3, type World } from '@duty-shooter/fps-core';
import { insidePolygon } from './definition';

/** The playable area's outline (x, z), or null for a map walled in by its own geometry. */
type Outline = readonly (readonly [number, number])[] | null;

/**
 * Which way a spawn looks. A life starts with a look at the ground ahead,
 * never with a wall filling the screen: a spawn whose view is shut within
 * `SHUT` turns by the smallest angle that opens it, so it stays as near as it
 * can to the way the map faced it (toward the fight). Spawns that already
 * look past `SHUT` keep their facing, so a back yard that faces its house
 * still does.
 */

/** A view closer than this (m) is a wall in the face. */
export const SHUT = 8;
/** How far a spawn may turn from the map's facing (rad): no further than looking past one shoulder. */
const SPREAD = (60 * Math.PI) / 180;
/** The turns tried, in steps of this (rad). */
const STEP = (5 * Math.PI) / 180;
/** Half the width of the view a turn must clear (rad): a slit between two walls is not a view to turn to. */
export const HALF_VIEW = (4 * Math.PI) / 180;
const FAR = 40;

/** How far along a line from (x, z) the play area goes, in steps of half a metre, up to `FAR`: a look over a low boundary wall at the desert is not a look into the map. */
function areaDepth(area: Outline, x: number, z: number, dx: number, dz: number): number {
  if (!area) return FAR;
  for (let t = 0.5; t < FAR; t += 0.5) if (!insidePolygon(area, x + dx * t, z + dz * t)) return t;
  return FAR;
}

/**
 * How far a person standing at `position` sees into the map along `yaw` (the
 * nearest wall, or the play area's edge), up to `FAR`: along the crosshair's
 * line, or across `halfView` either side of it.
 */
export function viewDepth(world: World, position: Vec3, yaw: number, area: Outline = null, halfView = 0): number {
  const eye: Vec3 = [position[0], position[1] + STATS.stance.standEyeHeight.value, position[2]];
  let depth = FAR;
  for (const turn of halfView > 0 ? [-halfView, 0, halfView] : [0]) {
    const d = viewDirection(yaw + turn, 0);
    const end: Vec3 = [eye[0] + d[0] * FAR, eye[1], eye[2] + d[2] * FAR];
    // What hides a person (as `sightBlocked`): walls and roofs, not windows or props.
    const hit = world.bullets.firstHit(eye, end, (i) => {
      const solid = world.solids[i]!;
      return solid.prop === null && solid.material !== 'glass' ? segmentSolid(eye, end, solid) : null;
    });
    const ground = world.terrain ? world.terrain.raycast(eye, end, hit?.t ?? 1) : null;
    depth = Math.min(depth, (ground ?? hit?.t ?? 1) * FAR, areaDepth(area, eye[0], eye[2], d[0], d[2]));
  }
  return depth;
}

/**
 * The facing a spawn takes: its own, unless the crosshair's line runs into a
 * wall within `SHUT` (a map that aims a spawn through a gap keeps its aim);
 * then the smallest turn whose whole few degrees of view see past `SHUT`.
 */
export function openFacing(world: World, spawn: SpawnPoint, area: Outline = null): number {
  const own = viewDepth(world, spawn.position, spawn.yaw, area);
  if (own >= SHUT) return spawn.yaw;
  let best = { yaw: spawn.yaw, depth: own };
  for (let k = 1; k * STEP <= SPREAD + 1e-9; k++) {
    for (const yaw of [spawn.yaw + k * STEP, spawn.yaw - k * STEP]) {
      const depth = viewDepth(world, spawn.position, yaw, area, HALF_VIEW);
      if (depth >= SHUT) return yaw;
      if (depth > best.depth) best = { yaw, depth };
    }
  }
  return best.yaw;
}

/** A map's spawns, each turned to look into the open (see `openFacing`). */
export function facingOpen<S extends { ffa: readonly SpawnPoint[]; teams: readonly [readonly SpawnPoint[], readonly SpawnPoint[]] | null }>(
  spawns: S,
  solids: readonly Solid[],
  area: Outline,
): S {
  const world = createWorld(solids);
  const turn = (set: readonly SpawnPoint[]): SpawnPoint[] => set.map((s) => ({ ...s, yaw: openFacing(world, s, area) }));
  return { ...spawns, ffa: turn(spawns.ffa), teams: spawns.teams ? [turn(spawns.teams[0]), turn(spawns.teams[1])] : null };
}
