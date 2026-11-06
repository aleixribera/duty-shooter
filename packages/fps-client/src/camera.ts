import { STATS, mantleDuration, type MantleBand, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { PerspectiveCamera } from 'three/webgpu';
import { adsFovDeg, verticalFov, type Settings } from './settings';
import { Spring } from './spring';
export { shotPose } from './surfaces/ending';

const DEG = Math.PI / 180;

/** Movement FOV, as a multiplier: a touch wider at speed, eased in and out, and never while aiming. */
const MOVE_FOV: Partial<Record<PlayerOutput['movement'], number>> = { sprint: 1.04, slide: 1.06 };
/** Downed, the view lies this far over (degrees), head on the ground. */
const DOWNED_ROLL = 12;

/** The view's nod down at the ledge and lean as the body goes over (degrees), at the highest band; the lower bands do less. */
const MANTLE_NOD = 6;
const MANTLE_LEAN = 3.5;
/** Past a mantle's length by this much (s), a body still mantling is on its next one. */
export const MANTLE_AGAIN = 0.05;
const MANTLE_SIZE: Readonly<Record<MantleBand, number>> = { lowVault: 0.45, waist: 0.75, highClimb: 1 };

/**
 * The view through a mantle (ticket 67), `t` seconds into a `band` one: the
 * eyes go down to the ledge as the hands find it and come up as the body goes
 * over, leaning a little to the side the weight goes. Pitch and roll in
 * radians, nothing at either end.
 */
export function mantleView(band: MantleBand, t: number): { pitch: number; roll: number } {
  const f = Math.min(1, Math.max(0, t / mantleDuration(band)));
  const size = MANTLE_SIZE[band];
  return { pitch: -MANTLE_NOD * DEG * size * Math.sin(Math.PI * f) ** 2, roll: MANTLE_LEAN * DEG * size * Math.sin(2 * Math.PI * f) * (1 - f) };
}

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
 * smooth step-ups, a landing dip, slide and Downed tilt, ADS zoom, a slightly
 * wider view at speed and shot shake.
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
  /** Seconds into the mantle under way, or null. */
  #mantleTime: number | null = null;

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

    // A mantle: time from its start, and a small settle on the top once it's over. Still mantling past its
    // length is the next one, started on the tick the last arrived.
    if (cur.movement === 'mantle') {
      this.#mantleTime = (this.#mantleTime ?? 0) + dt;
      if (cur.mantle && this.#mantleTime > mantleDuration(cur.mantle) + MANTLE_AGAIN) this.#mantleTime -= mantleDuration(cur.mantle);
    } else if (this.#mantleTime !== null) {
      this.#mantleTime = null;
      this.#dip.velocity -= 0.9;
    }
    const mantle = cur.mantle && this.#mantleTime !== null ? mantleView(cur.mantle, this.#mantleTime) : null;

    const rollTarget = cur.downed ? DOWNED_ROLL * DEG : cur.movement === 'slide' ? STATS.slide.cameraRoll.value * DEG : 0;
    this.#roll += (rollTarget - this.#roll) * (1 - Math.exp(-dt / 0.08));

    // A scope's sway moves the round off the aim: the view drifts with it, so the reticle shows where it goes.
    const swayYaw = lerp(prev.weapon.sway[0], cur.weapon.sway[0]);
    const swayPitch = lerp(prev.weapon.sway[1], cur.weapon.sway[1]);
    const yaw = frame.look.yaw + this.#offsetYaw + swayYaw;
    const pitch = Math.max(-89 * DEG, Math.min(89 * DEG, frame.look.pitch + this.#offsetPitch + swayPitch + (mantle?.pitch ?? 0)));
    const cam = this.camera;
    cam.position.set(feet[0], this.#smoothY + this.#dip.value * 0.06, feet[2]);
    cam.rotation.set(pitch + this.#shakePitch.value, yaw + this.#shakeYaw.value, this.#roll + this.#shakeRoll.value + (mantle?.roll ?? 0));

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
