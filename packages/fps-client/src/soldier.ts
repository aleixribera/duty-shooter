import { STATS, isShellReload, type PlayerOutput, type WeaponId } from '@duty-shooter/fps-core';
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KIT_RIGS } from './viewmodel/kit';
import { LEFT_PALM, RIGHT_PALM, palmFrame } from './viewmodel/m4a1';

/**
 * The third-person soldier: the Blender model from tools/soldier/soldier.py
 * (rigid pieces hanging from named joints), dressed in a look and posed every
 * frame. The gun is placed first, its stock in the right shoulder pocket and
 * its barrel along the aim, then both arms reach its grip points with
 * two-bone IK, so every weapon sits in the hands in every pose.
 */

export interface Look {
  readonly uniform: number;
  readonly vest: number;
  readonly skin: number;
  readonly helmet: number;
  readonly boots: number;
  /** Shoulder pads: the team colour, where there is one. */
  readonly accent: number;
  readonly glove?: number;
  readonly lens?: number;
}

type V3 = readonly [number, number, number];

/** A palm placement in gun space (see palmFrame): where it sits, the way it faces, and toward the wrist. */
interface Palm {
  readonly pos: V3;
  readonly normal: V3;
  readonly wrist: V3;
}

/** How a soldier holds one weapon, in its gun space (metres, +Y up, muzzle along -Z). */
export interface Hold {
  /** The grip and the support hand, shared with the first-person rigs. */
  readonly right: Palm;
  readonly left: Palm;
  /** The butt plate's centre, which sits in the shoulder pocket; null for the pistol, held out in both hands. */
  readonly stock: V3 | null;
  /** Where the support hand takes the magazine, or on the shotgun pushes shells in. */
  readonly mag: Palm;
  /** How far the support hand rides the pump back when the gun cycles. */
  readonly pump: number;
  /** How far back along the handguard or pump the support hand may slide when the gun is out past its reach. */
  readonly slack: number;
}

const v3 = (v: Vector3): V3 => [v.x, v.y, v.z];

/** Butt plates and magazine bases measured from the weapon models (tools/weapon, the M4A1's builder). */
export const HOLDS: Readonly<Record<WeaponId, Hold>> = {
  m4a1: {
    right: { pos: v3(RIGHT_PALM.pos), normal: v3(RIGHT_PALM.normal), wrist: v3(RIGHT_PALM.wrist) },
    left: { pos: v3(LEFT_PALM.pos), normal: v3(LEFT_PALM.normal), wrist: v3(LEFT_PALM.wrist) },
    stock: [0, -0.035, 0.264],
    mag: { pos: [-0.016, -0.15, -0.15], normal: [1, 0, 0], wrist: [-0.4, -0.5, 0.6] },
    pump: 0,
    slack: 0.12,
  },
  smg: {
    right: KIT_RIGS.smg.right,
    left: KIT_RIGS.smg.left,
    stock: [0, -0.022, 0.099],
    mag: { pos: [-0.016, -0.12, -0.004], normal: [1, 0, 0], wrist: [-0.4, -0.5, 0.6] },
    pump: 0,
    slack: 0.05,
  },
  shotgun: {
    right: KIT_RIGS.shotgun.right,
    left: KIT_RIGS.shotgun.left,
    stock: [0, -0.065, 0.393],
    mag: { pos: [0, -0.04, -0.085], normal: [0, 1, 0], wrist: [-0.6, -0.3, 0.7] },
    pump: KIT_RIGS.shotgun.travel ?? 0,
    slack: 0.16,
  },
  sniper: {
    right: KIT_RIGS.sniper.right,
    left: KIT_RIGS.sniper.left,
    stock: [0, -0.035, 0.457],
    mag: { pos: [-0.016, -0.055, -0.075], normal: [1, 0, 0], wrist: [-0.4, -0.5, 0.6] },
    pump: 0,
    slack: 0.12,
  },
  pistol: {
    right: KIT_RIGS.pistol.right,
    left: KIT_RIGS.pistol.left,
    stock: null,
    mag: { pos: [-0.014, -0.112, 0.02], normal: [1, 0, 0], wrist: [-0.4, -0.6, 0.5] },
    pump: 0,
    slack: 0,
  },
};

// --- The rig (tools/soldier/soldier.py) ---------------------------------------
const JOINTS = ['hips', 'spine', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;
type Joint = (typeof JOINTS)[number];
/** Shoulder to elbow, elbow to wrist. */
const L1 = 0.3;
const L2 = 0.28;
/** Hip to knee, knee to ankle. */
const THIGH = 0.42;
const SHIN = 0.34;
/** The palm's centre in the wrist's frame (the palm frame). */
const PALM = new Vector3(0, -0.018, -0.055);
/** The shoulder pocket in the spine's frame, at hipfire and aimed; the pistol's grip, held out. */
const POCKET_HIP = new Vector3(0.09, 0.31, -0.15);
const POCKET_ADS = new Vector3(0.04, 0.41, -0.14);
const POCKET_LOW = new Vector3(0.09, 0.26, -0.17);
const PISTOL_HIP = new Vector3(0.05, 0.25, -0.4);
const PISTOL_ADS = new Vector3(0.03, 0.43, -0.45);
/** Mag pouches on the vest, and the shells on the belt, for the support hand on a reload. */
const VEST_POUCH = new Vector3(-0.085, 0.14, -0.2);
const BELT_SHELLS = new Vector3(-0.16, 0.07, -0.1);

let model: Object3D | null = null;
let loading: Promise<void> | null = null;

/** Fetches the soldier model once; soldiers are built from it once it is in. */
export function loadSoldierModel(): Promise<void> {
  loading ??= new GLTFLoader()
    .loadAsync(new URL('./assets/soldier.glb', import.meta.url).href)
    .then(({ scene }) => {
      model = scene;
    })
    .catch((error: unknown) => {
      console.warn('Unable to load the soldier model:', error);
    });
  return loading;
}

/** Uses an already parsed soldier model (tests read the GLB from disk). */
export function useSoldierModel(scene: Object3D): void {
  model = scene;
  loading = Promise.resolve();
}

export function soldierModel(): Object3D | null {
  return model;
}

const shade = (hex: number, k: number) => new Color(hex).multiplyScalar(k);

/** A piece's colour: its material names the look's slot it wears. */
function slotColour(look: Look, slot: string): Color {
  switch (slot) {
    case 'uniform': return new Color(look.uniform);
    case 'trousers': return shade(look.uniform, 0.88);
    case 'vest': return new Color(look.vest);
    case 'pouch': return shade(look.vest, 0.86);
    case 'strap': return shade(look.vest, 0.62);
    case 'skin': return new Color(look.skin);
    case 'helmet': return new Color(look.helmet);
    case 'boots': return new Color(look.boots);
    case 'sole': return shade(look.boots, 0.6);
    case 'accent': return new Color(look.accent);
    case 'lens': return new Color(look.lens ?? 0x172128);
    case 'glove': return new Color(look.glove ?? 0x2b2a27);
    default: return new Color(look.uniform);
  }
}

/** Gun-space palm placements as positions and turns, worked out once per weapon. */
interface PalmFrame {
  readonly pos: Vector3;
  readonly q: Quaternion;
}
const frames = new Map<Palm, PalmFrame>();
function frame(p: Palm): PalmFrame {
  let f = frames.get(p);
  if (!f) {
    const o = new Object3D();
    const pos = new Vector3(...p.pos);
    palmFrame(o, pos, new Vector3(...p.normal), new Vector3(...p.wrist));
    f = { pos, q: o.quaternion.clone() };
    frames.set(p, f);
  }
  return f;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** 0 at the ends, 1 in the middle. */
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

// Scratch objects for the per-frame pose.
const X = new Vector3(1, 0, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();

export class Soldier {
  readonly root = new Group();
  /** The pieces the soldier is drawn from (hidden; the ragdoll throws them), by part name. */
  readonly parts = new Map<string, Mesh>();
  readonly #bones = {} as Record<Joint, Bone>;
  readonly #rest = {} as Record<Joint, Vector3>;
  readonly #gunMount = new Group();
  readonly #materials: MeshStandardNodeMaterial[] = [];
  #body: SkinnedMesh | null = null;
  #phase = 0;
  #strideBlend = 0;
  #flash = 0;
  #pitch = 0;
  #crouch = 0;
  #prone = 0;
  #slide = 0;
  #sprint = 0;
  #air = 0;
  #ads = 0;
  #lower = 1;
  #reload = 0;
  #inspect = 0;
  #dt = 0;
  /** The support palm, eased, in gun space. */
  readonly #left = { pos: new Vector3(), q: new Quaternion(), set: false };
  /** How far each wrist ended from its grip after the last pose (m): left, right. */
  readonly handError: [number, number] = [0, 0];

  #gun: Mesh | null = null;
  #gunId: WeaponId | null = null;

  constructor(template: Object3D, look: Look) {
    const materials = new Map<string, MeshStandardNodeMaterial>();
    const material = (slot: string) => {
      let m = materials.get(slot);
      if (!m) {
        m = new MeshStandardNodeMaterial({ color: slotColour(look, slot), roughness: slot === 'lens' ? 0.3 : 0.8, metalness: 0 });
        m.name = slot;
        materials.set(slot, m);
        this.#materials.push(m);
      }
      return m;
    };
    const copy = (from: Object3D, to: Object3D) => {
      for (const child of from.children) {
        const mesh = child as Mesh;
        if (mesh.isMesh) {
          const slot = (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material).name;
          // The geometry is the template's, shared by every soldier.
          const piece = new Mesh(mesh.geometry, material(slot));
          piece.name = mesh.name;
          piece.position.copy(mesh.position);
          piece.quaternion.copy(mesh.quaternion);
          piece.castShadow = true;
          to.add(piece);
          this.parts.set(mesh.name, piece);
          continue;
        }
        if (!(JOINTS as readonly string[]).includes(child.name)) continue;
        const bone = new Bone();
        bone.name = child.name;
        bone.position.copy(child.position);
        to.add(bone);
        this.#bones[child.name as Joint] = bone;
        this.#rest[child.name as Joint] = bone.position.clone();
        copy(child, bone);
      }
    };
    const hips = template.getObjectByName('hips');
    if (!hips?.parent) throw new Error('The soldier model has no hips');
    copy(hips.parent, this.root);
    this.root.add(this.#gunMount);
    this.#skin();
  }

  /**
   * Draws the whole soldier as one skinned mesh: each piece rides its joint
   * as a rigidly weighted bone, in its slot's colour. One draw call (two with
   * its shadow); the pieces stay, hidden, for the ragdoll to throw.
   */
  #skin(): void {
    const bones = JOINTS.map((j) => this.#bones[j]);
    this.root.updateMatrixWorld(true);
    const geometries: BufferGeometry[] = [];
    for (const piece of this.parts.values()) {
      const index = bones.indexOf(piece.parent as Bone);
      const source = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry;
      const g = new BufferGeometry();
      g.setAttribute('position', source.getAttribute('position').clone());
      if (source.getAttribute('normal')) g.setAttribute('normal', source.getAttribute('normal').clone());
      else g.computeVertexNormals();
      if (source !== piece.geometry) source.dispose();
      g.applyMatrix4(piece.matrixWorld);
      const c = (piece.material as MeshStandardNodeMaterial).color;
      const n = g.getAttribute('position').count;
      const colour = new Float32Array(n * 3);
      const skinIndex = new Uint16Array(n * 4);
      const skinWeight = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        colour.set([c.r, c.g, c.b], v * 3);
        skinIndex[v * 4] = index;
        skinWeight[v * 4] = 1;
      }
      g.setAttribute('color', new BufferAttribute(colour, 3));
      g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
      g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
      geometries.push(g);
    }
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) return;
    const material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    this.#materials.push(material);
    const body = new SkinnedMesh(merged, material);
    body.name = 'body';
    body.castShadow = true;
    this.root.add(body);
    body.updateMatrixWorld(true);
    body.bind(new Skeleton(bones));
    // Posed, a soldier reaches about a metre and a half from its feet (prone, rifle forward).
    body.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.6);
    this.#body = body;
    for (const piece of this.parts.values()) piece.visible = false;
  }

  hitFlash(): void {
    this.#flash = 1;
  }

  /** The weapon in hand: `gun` is a shared model (see GunModels), drawn on the gun mount outside the skinned body. */
  get gunId(): WeaponId | null {
    return this.#gunId;
  }

  /** The gun's place in the soldier's root (for tests and tools). */
  get gunMount(): Object3D {
    return this.#gunMount;
  }

  hold(id: WeaponId, gun: Mesh | null): void {
    this.#gun?.removeFromParent();
    this.#gun = gun;
    this.#gunId = gun ? id : null;
    this.#left.set = false;
    if (gun) this.#gunMount.add(gun);
  }

  update(p: PlayerOutput, dt: number): void {
    const b = this.#bones;
    this.root.position.set(p.position[0], p.position[1], p.position[2]);
    this.root.rotation.y = p.yaw;
    this.#dt = dt;
    const ease = (cur: number, target: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
    const speed = Math.hypot(p.velocity[0], p.velocity[2]);
    const w = p.weapon;
    this.#crouch = ease(this.#crouch, p.stance === 'crouch' ? 1 : 0, 0.08);
    this.#prone = ease(this.#prone, p.stance === 'prone' && p.eyeHeight < STATS.stance.crouchEyeHeight.value ? 1 : 0, 0.12);
    this.#slide = ease(this.#slide, p.movement === 'slide' ? 1 : 0, 0.06);
    this.#sprint = ease(this.#sprint, p.movement === 'sprint' || p.movement === 'tacticalSprint' ? 1 : 0, 0.1);
    this.#air = ease(this.#air, p.movement === 'airborne' || p.movement === 'mantle' ? 1 : 0, 0.08);
    this.#pitch = ease(this.#pitch, p.pitch, 0.05);
    this.#ads = ease(this.#ads, w?.ads ?? 0, 0.06);

    // Stride: legs swing with distance travelled.
    const stride = 1.6 - this.#prone * 0.7;
    this.#phase += (speed * dt * Math.PI) / stride;
    const targetSwing = Math.min(1, speed / 3) * (1 - this.#slide) * (1 - this.#air);
    this.#strideBlend = ease(this.#strideBlend, targetSwing, 0.12);
    const s = Math.sin(this.#phase) * this.#strideBlend * (0.55 + this.#sprint * 0.35);

    // Crouch lowers the hips and folds the legs; prone lays the body along its facing, up on the elbows.
    const crouchDrop = this.#crouch * 0.34 + this.#slide * 0.4;
    const prone = this.#prone;
    b.hips.position.y = 0.86 - crouchDrop - prone * 0.7 + Math.abs(Math.sin(this.#phase)) * this.#strideBlend * 0.018 * (1 - prone);
    b.hips.rotation.x = -prone * (Math.PI / 2) * 0.98 + this.#slide * 0.5;
    b.hipL.rotation.x = s + this.#crouch * 1.15 + this.#slide * 1.3 + this.#air * 0.6;
    b.hipR.rotation.x = -s + this.#crouch * 0.55 + this.#slide * 1.1 + this.#air * 0.2;
    b.kneeL.rotation.x = -Math.max(0, -s) * 1.2 - this.#crouch * 1.6 - this.#air * 1.1;
    b.kneeR.rotation.x = -Math.max(0, s) * 1.2 - this.#crouch * 0.9 - this.#slide * 0.3 - this.#air * 0.6;
    if (prone > 0.01) {
      b.hipL.rotation.x = s * 0.3 * prone + b.hipL.rotation.x * (1 - prone);
      b.hipR.rotation.x = -s * 0.3 * prone + b.hipR.rotation.x * (1 - prone);
      b.kneeL.rotation.x *= 1 - prone;
      b.kneeR.rotation.x *= 1 - prone;
    }
    // Crouched, the feet stay planted: a kneel on the right knee when still, short steps when moving.
    const planted = this.#crouch * (1 - this.#slide) * (1 - prone) * (1 - this.#air);
    if (planted > 0.01) {
      const step = this.#strideBlend;
      const sw = Math.sin(this.#phase);
      const cw = Math.cos(this.#phase);
      for (const [side, hip, knee, kneel, walk] of [
        ['L', b.hipL, b.kneeL, [0.09, -0.32], [0.09 + 0.06 * Math.max(0, cw), -0.05 - 0.22 * sw]],
        ['R', b.hipR, b.kneeR, [0.12, 0.3], [0.09 + 0.06 * Math.max(0, -cw), -0.05 + 0.22 * sw]],
      ] as const) {
        const y = kneel[0] + (walk[0] - kneel[0]) * step - (b.hips.position.y + this.#rest[`hip${side}`].y);
        const z = kneel[1] + (walk[1] - kneel[1]) * step;
        const d = Math.min(THIGH + SHIN - 0.001, Math.max(0.1, Math.hypot(y, z)));
        const thigh = Math.atan2(-z, -y) + Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)) - b.hips.rotation.x;
        const bend = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
        hip.rotation.x += (thigh - hip.rotation.x) * planted;
        knee.rotation.x += (-bend - knee.rotation.x) * planted;
      }
    }
    // Boots stay level with the ground; prone, the toes dig in.
    b.ankleL.rotation.x = -(b.hips.rotation.x + b.hipL.rotation.x + b.kneeL.rotation.x) * (1 - prone);
    b.ankleR.rotation.x = -(b.hips.rotation.x + b.hipR.rotation.x + b.kneeR.rotation.x) * (1 - prone);

    // The weapon's state: reloading, inspecting, lowered for a sprint, a draw or a holster.
    const hold = this.#gun && this.#gunId ? HOLDS[this.#gunId] : null;
    const action = w?.action ?? 'ready';
    const t = w?.actionTime ?? 0;
    const row = this.#gunId ? STATS.weapons[this.#gunId] : null;
    let lower = this.#sprint;
    if (row && action === 'draw') lower = Math.max(lower, 1 - smooth(t / row.handling.drawTime.value));
    if (row && action === 'holster') lower = Math.max(lower, smooth(t / row.handling.holsterTime.value));
    if (action === 'grenade') lower = Math.max(lower, 0.45);
    this.#lower = ease(this.#lower, lower, 0.06);
    this.#reload = ease(this.#reload, action === 'reload' ? 1 : 0, 0.1);
    this.#inspect = ease(this.#inspect, action === 'inspect' ? 1 : 0, 0.2);

    // Upper body: aim pitch, sprint lean, the torso bladed behind a long gun with the head turned back to the front.
    const aim = this.#pitch * (1 - this.#sprint * 0.8);
    const twist = hold ? (hold.stock ? -0.52 : -0.12) * (1 - this.#lower * 0.6) * (1 - prone * 0.5) : 0;
    b.spine.rotation.set(this.#sprint * -0.25 + aim * 0.45 - this.#slide * 0.2 + prone * 0.42, twist, -s * 0.045 * (1 - prone));
    const cheek = hold?.stock ? this.#ads * (1 - this.#lower) : 0;
    b.neck.rotation.set(aim * 0.4 + prone * 1.0 - cheek * 0.22, -twist * 0.85, cheek * 0.2);

    this.root.updateMatrixWorld(true);
    if (hold) this.#holdGun(hold, p, aim, action, t);
    else this.#restArms();

    this.#flash = Math.max(0, this.#flash - dt * 6);
    const glow = new Color(0.9, 0.1, 0.05).multiplyScalar(this.#flash * 0.8);
    for (const m of this.#materials) m.emissive.copy(glow);
  }

  /** No gun (a range dummy, or the model still loading): arms at the sides. */
  #restArms(): void {
    const b = this.#bones;
    for (const [side, s] of [[-1, 'L'], [1, 'R']] as const) {
      b[`shoulder${s}`].position.copy(this.#rest[`shoulder${s}`]);
      b[`shoulder${s}`].rotation.set(0.08, 0, side * 0.1);
      b[`elbow${s}`].rotation.set(0.25, 0, 0);
      // Fingers down, palms in.
      b[`wrist${s}`].rotation.set(-Math.PI / 2, -side * (Math.PI / 2), 0, 'YXZ');
    }
    this.handError[0] = this.handError[1] = 0;
  }

  /** Places the gun along the aim, its stock in the shoulder, then puts both hands on it. */
  #holdGun(hold: Hold, p: PlayerOutput, aim: number, action: string, t: number): void {
    const b = this.#bones;
    const spine = b.spine;
    const yaw = this.root.quaternion;
    const lower = this.#lower;
    const reload = this.#reload;

    // The gun's turn: along the aim, canted for a reload or an inspect, swung down and across when lowered.
    const gunQ = new Quaternion().setFromEuler(_e.set(aim, 0, 0)).premultiply(yaw);
    if (reload > 0.001) gunQ.slerp(_q.setFromEuler(_e.set(aim + 0.28, 0.12, 0.5)).premultiply(yaw), reload);
    if (this.#inspect > 0.001) gunQ.slerp(_q.setFromEuler(_e.set(aim * 0.5 + 0.25, 0.55, 0.9)).premultiply(yaw), this.#inspect);
    const low = hold.stock ? _e.set(-0.9, 0.6, 0.45) : _e.set(-1.0, 0.25, 0);
    if (lower > 0.001) gunQ.slerp(_q.setFromEuler(low).premultiply(yaw), lower);

    // Where it sits: the stock in the shoulder pocket, or the pistol out at arm's length.
    const ads = this.#ads * (1 - lower);
    const anchor = hold.stock
      ? _a.copy(POCKET_HIP).lerp(POCKET_ADS, ads).lerp(POCKET_LOW, lower)
      : _a.copy(PISTOL_HIP).lerp(PISTOL_ADS, ads).lerp(_b.set(0.03, 0.22, -0.3), lower);
    if (reload > 0.001) anchor.add(_b.set(-0.04, -0.05, 0.07).multiplyScalar(reload));
    if (action === 'melee') anchor.z -= 0.06 * bump(t / STATS.melee.duration.value);
    spine.localToWorld(anchor);
    const grip = hold.stock ?? hold.right.pos;
    const gunPos = anchor.clone().sub(_b.set(grip[0], grip[1], grip[2]).applyQuaternion(gunQ));

    // On the mount, which hangs from the root.
    this.root.updateMatrixWorld(true);
    this.#gunMount.position.copy(this.root.worldToLocal(gunPos.clone()));
    this.#gunMount.quaternion.copy(_q.copy(this.root.quaternion).invert().multiply(gunQ));
    this.#gunMount.updateMatrixWorld(true);

    // The right hand on the grip.
    const right = frame(hold.right);
    const rightPos = right.pos.clone().applyQuaternion(gunQ).add(gunPos);
    const rightQ = gunQ.clone().multiply(right.q);
    this.handError[1] = this.#reach('R', rightPos, rightQ, _c.set(0.75, -0.55, 0.35).applyQuaternion(yaw));

    // The left hand: on the support, or about a reload or a throw; eased in gun space so it never snaps.
    const target = this.#supportTarget(hold, p, action, t);
    const toGun = gunQ.clone().invert();
    const localPos = target.pos.sub(gunPos).applyQuaternion(toGun);
    const localQ = toGun.multiply(target.q);
    const left = this.#left;
    if (!left.set) {
      left.pos.copy(localPos);
      left.q.copy(localQ);
      left.set = true;
    } else {
      const k = 1 - Math.exp(-this.#dt / 0.045);
      left.pos.lerp(localPos, k);
      left.q.slerp(localQ, k);
    }
    // Out of reach, the hand takes the handguard further back.
    const slid = left.pos.clone();
    const leftQ = gunQ.clone().multiply(left.q);
    const shoulderL = b.spine.localToWorld(this.#rest.shoulderL.clone());
    const palmOffset = PALM.clone().applyQuaternion(leftQ);
    for (let i = 0, back = 0; i < 4; i++) {
      const wristAt = slid.clone().applyQuaternion(gunQ).add(gunPos).sub(palmOffset);
      const over = wristAt.distanceTo(shoulderL) - ((L1 + L2) * 0.995 + 0.1) + 0.004;
      if (over <= 0 || back >= hold.slack) break;
      const step = Math.min(over * 1.3, hold.slack - back);
      slid.z += step;
      back += step;
    }
    const leftPos = slid.applyQuaternion(gunQ).add(gunPos);
    this.handError[0] = this.#reach('L', leftPos, leftQ, _c.set(-0.45, -0.85, 0.15).applyQuaternion(yaw));
  }

  /** Where the support palm goes (world space): the handguard, the pump, a magazine, a pouch, or a grenade's arc. */
  #supportTarget(hold: Hold, p: PlayerOutput, action: string, t: number): { pos: Vector3; q: Quaternion } {
    const gun = this.#gunMount.matrixWorld;
    const gunQ = this.#gunMount.getWorldQuaternion(new Quaternion());
    const onGun = (palm: Palm, slide = 0) => {
      const f = frame(palm);
      return { pos: f.pos.clone().add(_b.set(0, 0, slide)).applyMatrix4(gun), q: gunQ.clone().multiply(f.q) };
    };
    const onBody = (bone: Bone, at: Vector3) => ({ pos: bone.localToWorld(at.clone()), q: gunQ.clone().multiply(frame(hold.mag).q) });
    const between = (from: { pos: Vector3; q: Quaternion }, to: { pos: Vector3; q: Quaternion }, k: number) => {
      const e = smooth(k);
      return { pos: from.pos.lerp(to.pos, e), q: from.q.slerp(to.q, e) };
    };
    const support = () => onGun(hold.left);
    const row = this.#gunId ? STATS.weapons[this.#gunId] : null;
    const w = p.weapon;

    if (action === 'cycle' && hold.pump > 0 && row) {
      const cycle = row.handling.cycleTime?.value ?? 0.5;
      return onGun(hold.left, hold.pump * bump(t / cycle));
    }
    if (action === 'reload' && row) {
      const r = row.reload;
      if (isShellReload(r)) {
        // Shells from the belt into the loading port, one at a time.
        const shells = () => onBody(this.#bones.hips, BELT_SHELLS);
        if (t < r.start.value) return between(support(), shells(), t / r.start.value);
        const u = ((t - r.start.value) % r.perShell.value) / r.perShell.value;
        return u < 0.5 ? between(shells(), onGun(hold.mag), u / 0.4) : between(onGun(hold.mag), shells(), (u - 0.6) / 0.4);
      }
      const duration = w?.reload === 'empty' ? r.emptyDuration.value : r.tacticalDuration.value;
      const k = t / duration;
      const pouch = () => onBody(this.#bones.spine, VEST_POUCH);
      // Hand to the magazine, out to the pouch, a fresh one in, seated, and back to the handguard.
      if (k < 0.14) return between(support(), onGun(hold.mag), k / 0.14);
      if (k < 0.32) return between(onGun(hold.mag), pouch(), (k - 0.14) / 0.18);
      if (k < 0.52) return between(pouch(), onGun(hold.mag), (k - 0.32) / 0.2);
      if (k < 0.64) return onGun(hold.mag);
      return between(onGun(hold.mag), support(), (k - 0.64) / 0.18);
    }
    if (action === 'grenade' && p.grenade) {
      // Wound back over the shoulder while cooking, then thrown out in front.
      const back = onBody(this.#bones.spine, _c.set(-0.24, 0.52, 0.14));
      if (p.grenade.phase === 'cook') return between(support(), back, p.grenade.time / 0.35);
      const out = onBody(this.#bones.spine, _c.set(-0.12, 0.42, -0.58));
      return between(back, out, p.grenade.time / (STATS.grenade.throwTime.value * 0.6));
    }
    return support();
  }

  /**
   * Two-bone IK: the arm reaches so its palm lands on `palmPos` turned `palmQ`
   * (both world space), the elbow bending toward `pole`. A target past full
   * reach slides the shoulder up to 10 cm toward it. Returns how far the wrist
   * ended from where it needed to be.
   */
  #reach(s: 'L' | 'R', palmPos: Vector3, palmQ: Quaternion, pole: Vector3): number {
    const b = this.#bones;
    const shoulder = b[`shoulder${s}`];
    const elbow = b[`elbow${s}`];
    const wrist = b[`wrist${s}`];
    const spine = b.spine;
    const want = palmPos.clone().sub(PALM.clone().applyQuaternion(palmQ));
    shoulder.position.copy(this.#rest[`shoulder${s}`]);
    const S = spine.localToWorld(shoulder.position.clone());
    const full = (L1 + L2) * 0.995;
    const far = want.distanceTo(S);
    if (far > full) {
      S.addScaledVector(_b.copy(want).sub(S).normalize(), Math.min(far - full, 0.1));
      shoulder.position.copy(spine.worldToLocal(S.clone()));
    }
    const d = Math.min(full, Math.max(Math.abs(L1 - L2) + 0.02, want.distanceTo(S)));
    const dir = want.clone().sub(S).normalize();
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const n = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (n.lengthSq() < 1e-8) n.set(0, -1, 0).addScaledVector(dir, -dir.y);
    n.normalize();
    const E = S.clone().addScaledVector(dir, L1 * cosA).addScaledVector(n, L1 * sinA);
    const reached = S.clone().addScaledVector(dir, d);
    const u = E.clone().sub(S).normalize();
    const f = reached.clone().sub(E).normalize();
    // The upper arm hangs along its -Y; its +Z faces away from the bend so the elbow folds about +X.
    const z = f.clone().addScaledVector(u, -f.dot(u)).negate();
    if (z.lengthSq() < 1e-8) z.copy(n);
    z.normalize();
    const y = u.clone().negate();
    const x = new Vector3().crossVectors(y, z);
    const upperQ = new Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
    shoulder.quaternion.copy(spine.getWorldQuaternion(_q2).invert().multiply(upperQ));
    elbow.quaternion.setFromAxisAngle(X, Math.acos(Math.min(1, Math.max(-1, u.dot(f)))));
    const foreQ = upperQ.multiply(elbow.quaternion);
    wrist.quaternion.copy(foreQ.invert().multiply(palmQ));
    return want.distanceTo(reached);
  }

  dispose(): void {
    // The pieces' geometry belongs to the shared model; only the merged body is this soldier's.
    this.#gun?.removeFromParent();
    this.#body?.geometry.dispose();
    for (const m of this.#materials) m.dispose();
  }
}
