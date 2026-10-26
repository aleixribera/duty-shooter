import { STATS } from '@duty-shooter/fps-core';
import { DirectionalLight, Euler, Group, HemisphereLight, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3, type Texture } from 'three/webgpu';
import { Spring } from '../spring';
import { buildArms, type ArmsModel } from './arms';
import { M4A1_BOLT_TRAVEL, M4A1_CHARGING_HANDLE_TRAVEL, buildM4A1, type M4A1Model } from './m4a1';
import type { ViewmodelState } from './state';

const W = STATS.weapon;
const DEG = Math.PI / 180;

/** A gun pose offset: position (m, view space) and rotation (radians: pitch, yaw, roll). */
interface Pose {
  readonly p: readonly [number, number, number];
  readonly r: readonly [number, number, number];
}

const ZERO: Pose = { p: [0, 0, 0], r: [0, 0, 0] };

/** A keyframe: time (s), gun offset, and optionally where the left hand is and how the magazine sits. */
interface Key {
  readonly t: number;
  readonly pose: Pose;
  /** 0 = left hand on the handguard, 1 = on the magazine. */
  readonly hand?: number;
  /** Magazine offset from its seat, in gun space (m). */
  readonly mag?: readonly [number, number, number];
  /** Charging handle pull, 0..1. */
  readonly charge?: number;
  /** Bolt held back (empty), 0..1. */
  readonly bolt?: number;
  /** 0..1: the left hand reaches the bolt catch. */
  readonly catchPress?: number;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Samples a track at `t`: smoothstep between neighbouring keys. Missing optional channels hold their last value. */
function sample(track: readonly Key[], t: number) {
  const first = track[0] as Key;
  let a = first;
  let b = first;
  for (const k of track) {
    if (k.t <= t) a = k;
    if (k.t >= t) {
      b = k;
      break;
    }
    b = k;
  }
  const f = b.t === a.t ? 0 : ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  const ch = (get: (k: Key) => number | undefined, fallback: number) => lerp(get(a) ?? fallback, get(b) ?? get(a) ?? fallback, f);
  const v3 = (get: (k: Key) => readonly [number, number, number] | undefined): [number, number, number] => {
    const va = get(a) ?? [0, 0, 0];
    const vb = get(b) ?? va;
    return [lerp(va[0], vb[0], f), lerp(va[1], vb[1], f), lerp(va[2], vb[2], f)];
  };
  return {
    pose: { p: v3((k) => k.pose.p), r: v3((k) => k.pose.r) } as Pose,
    hand: ch((k) => k.hand, 0),
    mag: v3((k) => k.mag),
    charge: ch((k) => k.charge, 0),
    bolt: ch((k) => k.bolt, 0),
    catchPress: ch((k) => k.catchPress, 0),
  };
}

const pose = (p: [number, number, number], r: [number, number, number]): Pose => ({ p, r });

/**
 * Keyframe tracks, authored in code. Every duration comes from the stats
 * file, so the animation lands its add-ammo point exactly when the
 * simulation adds the ammo.
 */
function reloadTrack(empty: boolean): Key[] {
  const add = empty ? W.emptyReloadAddAmmo.value : W.tacticalReloadAddAmmo.value;
  const end = empty ? W.emptyReloadDuration.value : W.tacticalReloadDuration.value;
  const tilt = pose([0.02, 0.03, 0.02], [0.12, 0.18, 0.55]);
  const down: [number, number, number] = [0.04, -0.32, 0.12];
  const keys: Key[] = [
    { t: 0, pose: ZERO, hand: 0, mag: [0, 0, 0], bolt: empty ? 1 : 0 },
    { t: 0.22, pose: tilt, hand: 0.6 },
    { t: 0.3, pose: tilt, hand: 1, mag: [0, 0, 0] },
    // Mag out and away (the "mag out" sound sits at 0.32 s).
    { t: 0.42, pose: pose([0.02, 0.035, 0.02], [0.14, 0.2, 0.58]), hand: 1, mag: [0, -0.07, 0.01] },
    { t: add * 0.45, pose: tilt, hand: 1, mag: down },
    // A fresh mag comes up and seats.
    { t: add * 0.72, pose: tilt, hand: 1, mag: [0, -0.09, 0.015] },
    { t: add - (empty ? 0.55 : 0.22), pose: pose([0.02, 0.045, 0.02], [0.16, 0.2, 0.55]), hand: 1, mag: [0, 0, 0] },
  ];
  if (empty) {
    // Bolt release: the left hand slaps the bolt catch and the bolt runs home.
    keys.push({ t: add - 0.35, pose: pose([0.02, 0.03, 0.02], [0.1, 0.24, 0.42]), hand: 1, catchPress: 0.6, bolt: 1 });
    keys.push({ t: add - 0.08, pose: pose([0.02, 0.025, 0.0], [0.06, 0.26, 0.4]), hand: 1, catchPress: 1, bolt: 1 });
    keys.push({ t: add, pose: pose([0.015, 0.035, 0.01], [0.13, 0.22, 0.42]), hand: 1, catchPress: 1, bolt: 0 });
  } else {
    keys.push({ t: add, pose: pose([0.02, 0.025, 0.02], [0.1, 0.2, 0.55]), hand: 1, mag: [0, 0, 0] });
  }
  keys.push({ t: add + (end - add) * 0.4, pose: pose([0.01, 0.01, 0.01], [0.05, 0.08, 0.2]), hand: 0.2, catchPress: 0 });
  keys.push({ t: end, pose: ZERO, hand: 0, bolt: 0, catchPress: 0 });
  return keys;
}

function inspectTrack(): Key[] {
  const d = W.inspectDuration.value;
  return [
    { t: 0, pose: ZERO },
    { t: d * 0.12, pose: pose([-0.06, 0.05, 0.06], [0.1, 0.7, -0.55]) },
    { t: d * 0.36, pose: pose([-0.07, 0.06, 0.07], [0.15, 0.85, -0.6]) },
    { t: d * 0.48, pose: pose([-0.03, 0.04, 0.05], [0.25, -0.45, 0.8]) },
    { t: d * 0.68, pose: pose([-0.03, 0.05, 0.05], [0.3, -0.55, 0.9]) },
    // Press check: a short charging-handle pull.
    { t: d * 0.78, pose: pose([0.0, 0.03, 0.03], [0.12, 0.12, 0.25]), charge: 0 },
    { t: d * 0.82, pose: pose([0.0, 0.035, 0.035], [0.14, 0.12, 0.25]), charge: 0.45 },
    { t: d * 0.87, pose: pose([0.0, 0.03, 0.03], [0.1, 0.1, 0.2]), charge: 0 },
    { t: d, pose: ZERO, charge: 0 },
  ];
}

function drawTrack(): Key[] {
  const d = W.drawTime.value;
  return [
    { t: 0, pose: pose([0.05, -0.28, 0.1], [-0.9, 0.3, 0.5]) },
    { t: d * 0.75, pose: pose([0, -0.01, 0.01], [0.04, 0, -0.04]) },
    { t: d, pose: ZERO },
  ];
}

function meleeTrack(): Key[] {
  const hit = STATS.melee.impactTime.value;
  const d = STATS.melee.duration.value;
  return [
    { t: 0, pose: ZERO },
    { t: hit * 0.45, pose: pose([0.06, 0.02, 0.06], [0.1, -0.35, -0.3]) },
    { t: hit, pose: pose([-0.16, 0.03, -0.12], [0.05, 0.9, 0.5]) },
    { t: hit + 0.15, pose: pose([-0.13, 0.02, -0.08], [0.05, 0.8, 0.45]) },
    { t: d, pose: ZERO },
  ];
}

const TRACKS = {
  tactical: reloadTrack(false),
  empty: reloadTrack(true),
  inspect: inspectTrack(),
  draw: drawTrack(),
  melee: meleeTrack(),
};

/** Where the gun sits in view space at hipfire. */
const HIP = new Vector3(0.13, -0.15, -0.43);
const HIP_ROT = new Euler(0.02, 0.035, -0.02, 'YXZ');
/** Distance from the eye to the rear sight when aimed. */
const EYE_RELIEF = 0.22;

/**
 * The first-person M4A1 and arms: keyframed actions driven by the weapon
 * state, layered with sway, turn inertia, movement bob, a spring recoil kick
 * and a landing dip. Drawn in its own scene with its own camera and FOV.
 */
export class Viewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(52, 16 / 9, 0.01, 10);
  /** Everything visible: hide it when the player is dead. */
  readonly root = new Group();
  readonly gun: M4A1Model;
  readonly arms: ArmsModel;
  readonly #pivot = new Group();
  readonly #leftTarget = new Object3D();
  readonly #magRest = new Vector3();
  readonly #boltRest = new Vector3();
  readonly #chargeRest = new Vector3();
  readonly #catchRest = new Quaternion();
  readonly #adsOffset: Vector3;
  // Procedural layers.
  readonly #swayX = new Spring(90, 12);
  readonly #swayY = new Spring(90, 12);
  readonly #kickZ = new Spring(320, 20);
  readonly #kickPitch = new Spring(260, 16);
  readonly #kickYaw = new Spring(260, 18);
  readonly #dip = new Spring(120, 11);
  #bobPhase = 0;
  #bobAmount = 0;
  #sprint = 0;
  #tactical = 0;
  #boltCycle = 1;
  #time = 0;

  constructor(environment: Texture | null = null) {
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.8;
    this.scene.add(new HemisphereLight(0xe8eef5, 0x4a4640, 0.8));
    const key = new DirectionalLight(0xfff2e0, 2.2);
    key.position.set(-0.6, 1, 0.4);
    const rim = new DirectionalLight(0xbfd4ff, 0.8);
    rim.position.set(0.8, 0.3, -1);
    this.scene.add(key, rim, this.camera);
    this.camera.rotation.order = 'YXZ';

    this.gun = buildM4A1({ detail: 'high' });
    this.arms = buildArms();
    this.#pivot.add(this.gun.root);
    this.root.add(this.#pivot, this.arms.root, this.#leftTarget);
    this.scene.add(this.root);
    this.#magRest.copy(this.gun.magazine.position);
    this.#boltRest.copy(this.gun.bolt.position);
    this.#chargeRest.copy(this.gun.chargingHandle.position);
    this.#catchRest.copy(this.gun.boltCatch.quaternion);
    // Aimed: the gun moves so the sight line runs down the camera's axis.
    const rear = this.gun.sockets.rearSight.position;
    this.#adsOffset = new Vector3(-rear.x, -rear.y, -EYE_RELIEF - rear.z);
    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  get muzzle(): Object3D {
    return this.gun.sockets.muzzle;
  }

  get ejectionPort(): Object3D {
    return this.gun.sockets.ejectionPort;
  }

  /** A shot: spring kick and the bolt cycling. */
  fire(): void {
    this.#kickZ.velocity += 1.6;
    this.#kickPitch.velocity += 2.4 + Math.random() * 0.6;
    this.#kickYaw.velocity += (Math.random() - 0.5) * 1.2;
    this.#boltCycle = 0;
  }

  land(fallHeight: number): void {
    this.#dip.velocity -= Math.min(1.6, 0.4 + fallHeight * 0.25);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Advances the animation. `worldVerticalFov` (radians) only nudges the viewmodel FOV with the player's setting. */
  update(state: ViewmodelState, dt: number, worldVerticalFov: number): void {
    this.#time += dt;
    const ads = ease(Math.min(1, Math.max(0, state.ads)));
    const sprinting = state.movement === 'sprint' || state.movement === 'tacticalSprint';
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    this.#sprint += ((sprinting && state.action !== 'melee' ? 1 : 0) - this.#sprint) * k(0.09);
    this.#tactical += ((state.movement === 'tacticalSprint' ? 1 : 0) - this.#tactical) * k(0.1);

    // Viewmodel FOV: a little narrower when aimed, so the sights fill more of the view.
    const fov = (54 - ads * 10) * DEG + (worldVerticalFov - 49 * DEG) * 0.25;
    if (Math.abs(this.camera.fov - fov / DEG) > 1e-3) {
      this.camera.fov = fov / DEG;
      this.camera.updateProjectionMatrix();
    }

    // Action keyframes.
    let track: Key[] | null = null;
    if (state.action === 'reload') track = state.reload === 'empty' ? TRACKS.empty : TRACKS.tactical;
    else if (state.action === 'inspect') track = TRACKS.inspect;
    else if (state.action === 'draw') track = TRACKS.draw;
    else if (state.action === 'melee') track = TRACKS.melee;
    const s = track ? sample(track, state.actionTime) : sample([{ t: 0, pose: ZERO }], 0);
    const boltLocked = state.ammo === 0 && state.action !== 'reload' ? 1 : s.bolt;

    // Procedural layers.
    const calm = 1 - ads * 0.85;
    this.#swayX.update(dt, Math.max(-0.05, Math.min(0.05, -state.lookDelta.yaw * 0.9)));
    this.#swayY.update(dt, Math.max(-0.04, Math.min(0.04, state.lookDelta.pitch * 0.9)));
    this.#kickZ.update(dt);
    this.#kickPitch.update(dt);
    this.#kickYaw.update(dt);
    this.#dip.update(dt);
    const moving = state.grounded ? Math.min(1, state.speed / 7) : 0;
    this.#bobAmount += (moving - this.#bobAmount) * k(0.12);
    this.#bobPhase += dt * (5.2 + state.speed * 0.95);
    const bob = this.#bobAmount * calm * (1 + this.#sprint * 0.8);
    const bobX = Math.sin(this.#bobPhase) * 0.012 * bob;
    const bobY = -Math.abs(Math.cos(this.#bobPhase)) * 0.014 * bob;
    const breathe = Math.sin(this.#time * 1.4) * 0.0015 * calm;
    this.#boltCycle = Math.min(1, this.#boltCycle + dt / (60 / W.fireRate.value));

    // Sprint: gun canted and lowered; tactical sprint: held up by the shoulder.
    const sprintP = new Vector3(-0.04, -0.05, 0.04).lerp(new Vector3(0.0, 0.03, 0.02), this.#tactical);
    const sprintR = new Euler(-0.35, 0.65, 0.35).toArray().map((v, i) => lerp(v as number, ([1.05, 0.35, 0.9] as number[])[i] as number, this.#tactical));

    const base = HIP.clone().lerp(this.#adsOffset, ads);
    const p = s.pose.p;
    const r = s.pose.r;
    const actionWeight = 1 - ads * 0.6;
    this.#pivot.position.set(
      base.x + p[0] * actionWeight + sprintP.x * this.#sprint + bobX + this.#swayX.value * 0.6 * calm,
      base.y + p[1] * actionWeight + sprintP.y * this.#sprint + bobY + breathe + this.#swayY.value * 0.5 * calm + this.#dip.value * 0.03,
      base.z + p[2] * actionWeight + sprintP.z * this.#sprint + this.#kickZ.value * 0.025 * (1 - ads * 0.4),
    );
    const hipRot = 1 - ads;
    this.#pivot.rotation.set(
      HIP_ROT.x * hipRot + (r[0] ?? 0) * actionWeight + (sprintR[0] ?? 0) * this.#sprint + this.#kickPitch.value * 0.02 * (1 - ads * 0.5) + this.#swayY.value * 0.6,
      HIP_ROT.y * hipRot + (r[1] ?? 0) * actionWeight + (sprintR[1] ?? 0) * this.#sprint + this.#kickYaw.value * 0.01 + this.#swayX.value * 0.8,
      HIP_ROT.z * hipRot + (r[2] ?? 0) * actionWeight + (sprintR[2] ?? 0) * this.#sprint + bobX * 2 + this.#swayX.value * 1.2 * calm,
      'YXZ',
    );

    // Moving parts.
    this.gun.magazine.position.set(this.#magRest.x + s.mag[0], this.#magRest.y + s.mag[1], this.#magRest.z + s.mag[2]);
    this.gun.magazine.visible = !(state.action === 'reload' && s.mag[1] < -0.25);
    const cycle = this.#boltCycle < 1 ? Math.sin(this.#boltCycle * Math.PI) : 0;
    this.gun.bolt.position.set(this.#boltRest.x, this.#boltRest.y, this.#boltRest.z + M4A1_BOLT_TRAVEL * Math.max(boltLocked, cycle, s.charge));
    this.gun.chargingHandle.position.set(this.#chargeRest.x, this.#chargeRest.y, this.#chargeRest.z + M4A1_CHARGING_HANDLE_TRAVEL * s.charge);
    this.gun.boltCatch.quaternion.copy(this.#catchRest).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.25 * s.catchPress));

    // Hands: right on the grip; left on the handguard, the magazine or the bolt catch.
    this.root.updateMatrixWorld(true);
    const guard = this.gun.sockets.leftHandguard;
    const onMag = this.gun.magazine;
    const guardPos = guard.getWorldPosition(new Vector3());
    const guardQ = guard.getWorldQuaternion(new Quaternion());
    // The palm wraps the magazine from the front-left, slightly below its seat.
    const magPos = onMag.localToWorld(new Vector3(-0.012, -0.075, -0.01));
    const magQ = onMag.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(0, 0, -Math.PI / 2)));
    const catchPos = this.gun.boltCatch.localToWorld(new Vector3(-0.025, 0.0, 0.0));
    const target = this.#leftTarget;
    target.position.copy(guardPos).lerp(magPos, s.hand).lerp(catchPos, s.catchPress);
    target.quaternion.copy(guardQ).slerp(magQ, s.hand);
    target.updateMatrixWorld(true);
    this.arms.setGrip(1, s.hand > 0.3 && s.hand < 0.95 ? 0.5 : s.catchPress > 0.5 ? 0.3 : 1);
    this.arms.solve(this.gun.sockets.rightGrip, target);
    this.root.visible = state.alive;
  }

  dispose(): void {
    this.gun.dispose();
    this.arms.dispose();
  }
}
