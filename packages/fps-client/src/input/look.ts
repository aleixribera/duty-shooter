import { STATS } from '@duty-shooter/fps-core';

/** View angles in radians, as the usercmd carries them: yaw positive to the left, pitch positive up. */
export interface ViewAngles {
  readonly yaw: number;
  readonly pitch: number;
}

/** Raw mouse movement in counts; x positive to the right, y positive down (as `movementX/Y`). */
export interface MouseCounts {
  readonly x: number;
  readonly y: number;
}

const DEG = Math.PI / 180;
const MAX_PITCH = STATS.input.maxPitch.value * DEG;

/**
 * Applies mouse counts to the view on MW2019's sensitivity scale: each count
 * turns `yawPerCount × sensitivity` degrees, the same on both axes. Pitch is
 * clamped to the view limit; yaw is kept in (-π, π].
 */
export function applyLook(view: ViewAngles, counts: MouseCounts, sensitivity: number): ViewAngles {
  const perCount = STATS.input.yawPerCount.value * sensitivity * DEG;
  let yaw = view.yaw - counts.x * perCount;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, view.pitch - counts.y * perCount));
  return { yaw, pitch };
}

/** Centimetres of mouse travel for a full turn at a sensitivity and mouse DPI. */
export function cmPer360(sensitivity: number, dpi: number): number {
  return (360 / (STATS.input.yawPerCount.value * sensitivity * dpi)) * 2.54;
}

/**
 * MW2019's FOV slider is horizontal degrees at 16:9, with Hor+ scaling for
 * other aspects: the vertical FOV is fixed by the slider. Returns that
 * vertical FOV in degrees (what a Three.js PerspectiveCamera takes).
 */
export function verticalFov(horizontalDeg: number): number {
  return (2 * Math.atan(Math.tan((horizontalDeg * DEG) / 2) * (9 / 16))) / DEG;
}
