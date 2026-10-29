import { STATS, anglesOf, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { PerspectiveCamera } from 'three/webgpu';
import { adsFovDeg, verticalFov, type Settings } from './settings';
import { Spring } from './spring';
import type { EndingShot } from './surfaces';

const DEG = Math.PI / 180;

/** Where the camera is and looks `t` s into an ending shot: easing out from its start to its end, then holding there. */
export function shotPose(shot: EndingShot, t: number): { position: Vec3; yaw: number; pitch: number } {
  const u = Math.min(1, Math.max(0, t / shot.seconds));
  const k = 1 - (1 - u) * (1 - u);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const position = lerp(shot.from, shot.to);
  const look = lerp(shot.lookFrom, shot.lookTo);
  return { position, ...anglesOf([look[0] - position[0], look[1] - position[1], look[2] - position[2]]) };
}

/** Movement FOV, as a multiplier: a touch wider at speed, eased in and out, and never while aiming. */
const MOVE_FOV: Partial<Record<PlayerOutput['movement'], number>> = { sprint: 1.04, tacticalSprint: 1.08, slide: 1.06 };

export interface CameraFrame {
  /** The local player's outputs at the previous and latest tick. */
  readonly prev: PlayerOutput;
  readonly cur: PlayerOutput;
  /** How far the frame is between them, in [0, 1). */
  readonly alpha: number;
  /** View angles from the mouse right now (applied every frame). */
  readonly look: { readonly yaw: number; readonly pitch: number };
  /** The usercmd angles that produced `cur`; the difference to cur's angles is recoil and flinch. */
  readonly cmd: { readonly yaw: number; readonly pitch: number };
  /** Prediction-correction offset still being smoothed out (networked play). */
  readonly correction?: Vec3;
  /** Frame time in seconds. */
  readonly dt: number;
}

/**
 * The first-person camera: eye position interpolated between ticks, mouse
 * look applied every frame on top of the simulation's recoil and flinch,
 * smooth step-ups, a landing dip, slide tilt, ADS zoom, a slightly wider
 * view at speed and shot shake.
 */
export class FirstPersonCamera {
  readonly camera: PerspectiveCamera;
  #smoothY: number | null = null;
  #offsetYaw = 0;
  #offsetPitch = 0;
  #roll = 0;
  readonly #dip = new Spring(140, 16);
  readonly #shakePitch = new Spring(260, 22);
  readonly #shakeYaw = new Spring(260, 22);
  readonly #shakeRoll = new Spring(200, 18);
  #fovScale = 1;

  constructor() {
    this.camera = new PerspectiveCamera(70, 16 / 9, 0.03, 2500);
    this.camera.rotation.order = 'YXZ';
  }

  /** Landing: dips the view in proportion to the fall height. */
  land(fallHeight: number): void {
    this.#dip.velocity -= Math.min(4, 0.6 + fallHeight * 0.55);
  }

  /** Visual shot shake (degrees), separate from the simulation's recoil. */
  kick(pitch: number, yaw: number, roll: number): void {
    this.#shakePitch.velocity += pitch * DEG * 30;
    this.#shakeYaw.velocity += yaw * DEG * 30;
    this.#shakeRoll.velocity += roll * DEG * 30;
  }

  update(frame: CameraFrame, settings: Settings): { position: Vec3; yaw: number; pitch: number } {
    const { prev, cur, alpha, dt } = frame;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const c = frame.correction ?? [0, 0, 0];
    const feet: Vec3 = [lerp(prev.position[0], cur.position[0]) + c[0], lerp(prev.position[1], cur.position[1]) + c[1], lerp(prev.position[2], cur.position[2]) + c[2]];
    const eyeY = feet[1] + lerp(prev.eyeHeight, cur.eyeHeight);

    // Step-ups: on the ground, ease the eye up instead of snapping.
    const grounded = cur.movement !== 'airborne' && cur.movement !== 'mantle' && cur.movement !== 'ladder';
    if (this.#smoothY === null || !grounded || eyeY < this.#smoothY || eyeY - this.#smoothY > STATS.movement.stepHeight.value * 1.5) {
      this.#smoothY = eyeY;
    } else {
      this.#smoothY += (eyeY - this.#smoothY) * (1 - Math.exp(-dt / 0.045));
    }

    this.#dip.update(dt);
    this.#shakePitch.update(dt);
    this.#shakeYaw.update(dt);
    this.#shakeRoll.update(dt);

    // Recoil and flinch from the simulation, eased over a couple of frames so kicks are not single-frame pops.
    const targetYaw = cur.yaw - frame.cmd.yaw;
    const targetPitch = cur.pitch - frame.cmd.pitch;
    const k = 1 - Math.exp(-dt / 0.025);
    this.#offsetYaw += (targetYaw - this.#offsetYaw) * k;
    this.#offsetPitch += (targetPitch - this.#offsetPitch) * k;

    const rollTarget = cur.movement === 'slide' ? STATS.slide.cameraRoll.value * DEG : 0;
    this.#roll += (rollTarget - this.#roll) * (1 - Math.exp(-dt / 0.08));

    // A scope's sway moves the round off the aim: the view drifts with it, so the reticle shows where it goes.
    const swayYaw = lerp(prev.weapon.sway[0], cur.weapon.sway[0]);
    const swayPitch = lerp(prev.weapon.sway[1], cur.weapon.sway[1]);
    const yaw = frame.look.yaw + this.#offsetYaw + swayYaw;
    const pitch = Math.max(-89 * DEG, Math.min(89 * DEG, frame.look.pitch + this.#offsetPitch + swayPitch));
    const cam = this.camera;
    cam.position.set(feet[0], this.#smoothY + this.#dip.value * 0.06, feet[2]);
    cam.rotation.set(pitch + this.#shakePitch.value, yaw + this.#shakeYaw.value, this.#roll + this.#shakeRoll.value);

    const ads = cur.weapon.ads;
    const eased = ads * ads * (3 - 2 * ads);
    const hip = verticalFov(settings.fov);
    const aimed = verticalFov(adsFovDeg(settings, STATS.weapons[cur.weapon.id].handling.zoom.value));
    const moveTarget = 1 + ((MOVE_FOV[cur.movement] ?? 1) - 1) * (1 - eased);
    this.#fovScale += (moveTarget - this.#fovScale) * (1 - Math.exp(-dt / 0.15));
    const fov = (hip + (aimed - hip) * eased) * this.#fovScale;
    if (Math.abs(cam.fov - fov / DEG) > 1e-4) {
      cam.fov = fov / DEG;
      cam.updateProjectionMatrix();
    }
    return { position: [cam.position.x, cam.position.y, cam.position.z], yaw, pitch };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
