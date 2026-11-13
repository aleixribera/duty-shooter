import { STATS, createWorld, segmentSolid, viewDirection, type Solid, type SpawnPoint, type Vec3, type World } from '@duty-shooter/fps-core';
import { insidePolygon } from './definition';

/** The playable area's outline (x, z), or null for a map walled in by its own geometry. */
type Outline = readonly (readonly [number, number])[] | null;

/**
 * Which way a spawn looks. A life starts with a look at the ground ahead,
 * never with a wall filling the screen or something under its nose: a spawn
 * whose view is shut within `SHUT`, or whose screen opens shut close up
 * (`screenShut`), turns by the smallest angle that opens it, so it stays as
 * near as it can to the way the map faced it (toward the fight). Spawns that
 * already look past `SHUT` with an open screen keep their facing, so a back
 * yard that faces its house still does.
 */

/** A view closer than this (m) is a wall in the face. */
export const SHUT = 8;
/** How far a spawn may turn from the map's facing (rad): no further than looking past one shoulder. */
const SPREAD = (60 * Math.PI) / 180;
/** How far a spawn may turn to open its screen (rad): a wall beside the view is better than a view away from the fight. */
const SCREEN_SPREAD = (30 * Math.PI) / 180;
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

/** Nearer than this (m), something in the middle of the screen is under the player's nose: a wall's corner, a mannequin. */
export const CLOSE = 3;
/** Half the middle of the screen (rad): its middle half at the default 90° field of view, where the eye rests. */
const MIDDLE = (25 * Math.PI) / 180;
/** Within this (m), a wall fills its part of the screen. */
export const NEAR = 5;
/** How much of the screen may be walls within `NEAR`: more, and the life opens on a wall beside the view. */
export const FILL = 0.4;
/** Half the screen's width (rad), short of its edges at the default 90° field of view, and the step across it. */
const FAN = (40 * Math.PI) / 180;
const FAN_STEP = (5 * Math.PI) / 180;
/** Below the eye, the heights the screen is sampled at (m): the eye's line and a shoulder's, above a waist-high fence or low cover, which a player sees over. */
const ROWS = [0, 0.3];

/**
 * What a standing person at `position` looking along `yaw` sees close up,
 * along a fan of lines across the screen at eye and shoulder height: the share
 * of the screen filled by something within `NEAR` (`fill`), and whether
 * something stands within `CLOSE` in its middle (`nose`). Walls, props, bodies
 * and the ground count; windows don't, as what lies beyond them shows.
 */
export function closeView(world: World, position: Vec3, yaw: number): { fill: number; nose: boolean } {
  let shut = 0;
  let total = 0;
  let nose = false;
  for (const drop of ROWS) {
    const eye: Vec3 = [position[0], position[1] + STATS.stance.standEyeHeight.value - drop, position[2]];
    for (let k = -Math.round(FAN / FAN_STEP); k <= Math.round(FAN / FAN_STEP); k++) {
      const turn = k * FAN_STEP;
      const d = viewDirection(yaw + turn, 0);
      const end: Vec3 = [eye[0] + d[0] * NEAR, eye[1], eye[2] + d[2] * NEAR];
      const hit = world.bullets.firstHit(eye, end, (i) => (world.solids[i]!.material !== 'glass' ? segmentSolid(eye, end, world.solids[i]!) : null));
      const ground = world.terrain ? world.terrain.raycast(eye, end, hit?.t ?? 1) : null;
      const t = ground ?? hit?.t ?? null;
      total++;
      if (t === null) continue;
      shut++;
      if (Math.abs(turn) <= MIDDLE + 1e-9 && t * NEAR < CLOSE) nose = true;
    }
  }
  return { fill: shut / total, nose };
}

/** Whether a life starting at `position` looking along `yaw` opens with its nose on something, or on a screen that is mostly wall. */
export function screenShut(world: World, position: Vec3, yaw: number): boolean {
  const view = closeView(world, position, yaw);
  return view.nose || view.fill > FILL;
}

/**
 * The facing a spawn takes: its own, unless the crosshair's line runs into a
 * wall within `SHUT` (a map that aims a spawn through a gap keeps its aim) or
 * the screen opens shut (`screenShut`); then the smallest turn whose whole few
 * degrees of view see past `SHUT` with the screen open (within `SCREEN_SPREAD`).
 * When no turn opens the screen, a spawn whose own line looks past `SHUT` keeps its facing, and one
 * whose line is shut takes the least turn that sees past `SHUT`.
 */
export function openFacing(world: World, spawn: SpawnPoint, area: Outline = null): number {
  const own = viewDepth(world, spawn.position, spawn.yaw, area);
  if (own >= SHUT && !screenShut(world, spawn.position, spawn.yaw)) return spawn.yaw;
  let deep: number | null = null;
  let best = { yaw: spawn.yaw, depth: own };
  // A spawn whose own line is deep only turns to open its screen, so it looks no further than that.
  const spread = own >= SHUT ? SCREEN_SPREAD : SPREAD;
  for (let k = 1; k * STEP <= spread + 1e-9; k++) {
    for (const yaw of [spawn.yaw + k * STEP, spawn.yaw - k * STEP]) {
      const depth = viewDepth(world, spawn.position, yaw, area, HALF_VIEW);
      if (depth >= SHUT) {
        if (k * STEP <= SCREEN_SPREAD + 1e-9 && !screenShut(world, spawn.position, yaw)) return yaw;
        deep ??= yaw;
      }
      if (depth > best.depth) best = { yaw, depth };
    }
  }
  if (own >= SHUT) return spawn.yaw;
  return deep ?? best.yaw;
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
