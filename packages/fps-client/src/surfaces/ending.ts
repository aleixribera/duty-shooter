import { anglesOf, type Vec3 } from '@duty-shooter/fps-core';
import type { EndingShot } from './types';

/** Where the camera is and looks `t` s into an ending shot: easing out from its start to its end, then holding there. */
export function shotPose(shot: EndingShot, t: number): { position: Vec3; yaw: number; pitch: number } {
  const u = Math.min(1, Math.max(0, t / shot.seconds));
  const k = 1 - (1 - u) * (1 - u);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const position = lerp(shot.from, shot.to);
  const look = lerp(shot.lookFrom, shot.lookTo);
  return { position, ...anglesOf([look[0] - position[0], look[1] - position[1], look[2] - position[2]]) };
}
