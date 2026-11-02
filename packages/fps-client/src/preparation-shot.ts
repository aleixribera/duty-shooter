import { PREPARATION, anglesOf, viewDirection, type Vec3 } from '@duty-shooter/fps-core';

/**
 * A Battle Royale's Preparation as a camera: the island from high above as the
 * Ring ignites, then your Squad standing at its spawn, lit, and in the last
 * seconds the dive from the sky to your own eyes, where control snaps to you.
 * Pure, so a test can walk it; the game puts the camera where it says.
 */

/** Seconds the island shot holds before the camera goes to the Squad. */
export const ISLAND_SECONDS = 7;
/** The Ring ignites over these seconds of the island shot. */
const IGNITE = [0.5, 4.5] as const;
/** The dive starts this far behind and above your eyes (m). */
const DIVE_BACK = 90;
const DIVE_UP = 230;

export type PreparationStage = 'island' | 'squad' | 'dive';

/** Where the Preparation is: its stage, seconds since it began and until play, and how far through the dive (0 to 1). */
export interface PreparationTime {
  readonly stage: PreparationStage;
  readonly elapsed: number;
  readonly left: number;
  readonly dive: number;
}

/** The Preparation's time from when it began, when it ends (the server's `countdownEnds`) and now, all in simulation seconds. */
export function preparationTime(start: number, ends: number, now: number): PreparationTime {
  const elapsed = Math.max(0, now - start);
  const left = Math.max(0, ends - now);
  if (left <= PREPARATION.dive) return { stage: 'dive', elapsed, left, dive: Math.min(1, Math.max(0, 1 - left / PREPARATION.dive)) };
  return { stage: elapsed < ISLAND_SECONDS ? 'island' : 'squad', elapsed, left, dive: 0 };
}

/** What the camera works from: the Ring's first circle, your eyes and facing at your spawn, and where your Squad stands. */
export interface PreparationScene {
  readonly island: { readonly x: number; readonly z: number; readonly radius: number };
  readonly eye: Vec3;
  readonly yaw: number;
  /** Your Squad's feet, you included. */
  readonly squad: readonly Vec3[];
}

export interface PreparationShot {
  readonly stage: PreparationStage;
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  /** The Ring's brightness, 0 (not yet lit) to 1. */
  readonly ring: number;
  /** A key light on the Squad (world position), while the camera is on them. */
  readonly light: Vec3 | null;
  /** How thick the distance haze is (1 as in play): thin from high up, so the island reads, thickening as you land. */
  readonly haze: number;
}

/** The haze from high above the island. */
const HIGH_HAZE = 0.3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Slow from the hang, fastest in the fall, and soft on landing. */
const fall = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
const lookFrom = (from: Vec3, to: Vec3) => anglesOf([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);

export function preparationShot(scene: PreparationScene, time: PreparationTime): PreparationShot {
  const { eye, yaw } = scene;
  if (time.stage === 'island') {
    const { x, z, radius } = scene.island;
    // From your side of the island, turning slowly round it.
    const angle = Math.atan2(eye[2] - z, eye[0] - x) + time.elapsed * 0.035;
    const position: Vec3 = [x + Math.cos(angle) * radius * 0.95, radius * 0.7 + 60, z + Math.sin(angle) * radius * 0.95];
    return { stage: 'island', position, ...lookFrom(position, [x, 0, z]), ring: smooth(IGNITE[0], IGNITE[1], time.elapsed), light: null, haze: HIGH_HAZE };
  }
  if (time.stage === 'squad') {
    const n = Math.max(1, scene.squad.length);
    const feet = scene.squad.length ? scene.squad : [[eye[0], eye[1] - 1.6, eye[2]] as Vec3];
    const mean = (k: 0 | 1 | 2) => feet.reduce((sum, p) => sum + p[k], 0) / n;
    const centre: Vec3 = [mean(0), mean(1) + 1.2, mean(2)];
    // In front of them, facing back, pushing in slowly; aimed a little to their left so they stand right of the picker.
    const f = viewDirection(yaw, 0);
    const push = clamp01((time.elapsed - ISLAND_SECONDS) / 8);
    const away = 5.4 - push * 0.9;
    const position: Vec3 = [centre[0] + f[0] * away, centre[1] + 0.35, centre[2] + f[2] * away];
    const camYaw = yaw + Math.PI;
    const right: Vec3 = [Math.cos(camYaw), 0, -Math.sin(camYaw)];
    const aim: Vec3 = [centre[0] - right[0] * 1.5, centre[1], centre[2] - right[2] * 1.5];
    const light: Vec3 = [position[0] + right[0] * 2, position[1] + 2.2, position[2] + right[2] * 2];
    return { stage: 'squad', position, ...lookFrom(position, aim), ring: 1, light, haze: 1 };
  }
  const u = fall(time.dive);
  const back = viewDirection(yaw, 0);
  // Behind you, but never out past the Ring: a spawn near the shore faces in, so behind is out to sea.
  const { x, z, radius } = scene.island;
  const limit = Math.max(radius * 0.9, Math.hypot(eye[0] - x, eye[2] - z));
  let reach = DIVE_BACK;
  while (reach > 0 && Math.hypot(eye[0] - back[0] * reach - x, eye[2] - back[2] * reach - z) > limit) reach -= 5;
  const top: Vec3 = [eye[0] - back[0] * reach, eye[1] + DIVE_UP, eye[2] - back[2] * reach];
  const position: Vec3 = [top[0] + (eye[0] - top[0]) * u, top[1] + (eye[1] - top[1]) * u, top[2] + (eye[2] - top[2]) * u];
  // Down the line of the fall, levelling out to your own view as you land.
  const down = lookFrom(top, eye).pitch;
  const level = smooth(0.72, 1, time.dive);
  return { stage: 'dive', position, yaw, pitch: down * (1 - level), ring: 1, light: null, haze: HIGH_HAZE + (1 - HIGH_HAZE) * u };
}
