import { STATS, isShellReload, mantleDuration, type PlayerOutput, type Vec3, type WeaponId } from '@duty-shooter/fps-core';
import {
  type AnimationClip,
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  type Interpolant,
  type KeyframeTrack,
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
import { attribute, float, mix, mx_noise_float, positionGeometry, smoothstep } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KIT_RIGS } from './viewmodel/kit';
import { LEFT_PALM, RIGHT_PALM, palmFrame } from './viewmodel/m4a1';

/**
 * The third-person soldier: the Blender model from tools/soldier/soldier.py
 * (rigid pieces hanging from named joints), dressed in a look and posed every
 * frame. The gun is placed first, its stock in the right shoulder pocket and
 * its barrel along the aim, then both arms reach its grip points with
 * two-bone IK, so every weapon sits in the hands in every pose. The two poses
 * with no gun in them, the Downed crawl and the Revive, are clips authored in
 * the same generator and laid over all of that; so are the deaths, which take
 * the body over from whatever pose it died in (`die`, then `fall`).
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

/** The clips the model carries, by name: `crawl`, `revive`, the mantles' `climb` and `vault`, and the deaths. */
type Clips = ReadonlyMap<string, Clip>;
/** A clip's joints, each with where it turns and sits at any moment. */
interface Clip {
  readonly duration: number;
  readonly joints: readonly { readonly joint: Joint; readonly turn: Interpolant; readonly at: Interpolant | null }[];
}

/** A track as three builds it; its typings leave the sampler out. */
type SampledTrack = KeyframeTrack & { createInterpolant(): Interpolant };

function readClips(animations: readonly AnimationClip[]): Clips {
  const clips = new Map<string, Clip>();
  for (const a of animations) {
    const track = (name: string) => (a.tracks.find((t) => t.name === name) as SampledTrack | undefined)?.createInterpolant() ?? null;
    const joints = JOINTS.flatMap((joint) => {
      const turn = track(`${joint}.quaternion`);
      return turn ? [{ joint, turn, at: track(`${joint}.position`) }] : [];
    });
    clips.set(a.name, { duration: a.duration, joints });
  }
  return clips;
}

/** Metres a whole crawl cycle (a reach with each arm) covers. */
const CRAWL_STRIDE = 0.8;
/** A clip played once stops just short of its end: `#wear` takes time in loops. */
const MANTLE_END = 0.999;
/** Past a mantle's length by this much (s), a body still mantling is on its next one (as the camera reads it). */
const MANTLE_AGAIN = 0.05;
/** The clip is up over the gun pose from about here: the gun goes away out of sight of the pose it left. */
const GUN_AWAY = 0.5;

/**
 * The deaths: thrown onto the back by a shot from the front, pitched onto the chest by one from behind, or folding
 * onto one side where it stood. A body takes this long (s) to leave the pose it died in for the clip's.
 */
type Death = 'fallBack' | 'fallFront' | 'crumple';
const DEATH_BLEND = 0.16;
/** A push (the killing shot's, see PlayersView.hit) below this throws nobody anywhere. */
const DEATH_PUSH = 0.4;
/** Metres a body needs clear to fall its length, and to fold onto its side. */
const DEATH_LENGTH = 1.5;
const DEATH_WIDTH = 0.9;
/**
 * What a body rests on (m): the thickness about the hips, the shoulders, the head (a point in the neck's frame),
 * and about each limb's joints and ends (points in the wrist's and the ankle's frames).
 */
const LIES = { hips: 0.13, shoulder: 0.11, head: 0.13, elbow: 0.055, wrist: 0.05, hand: 0.03, knee: 0.09, ankle: 0.08, sole: 0.012 } as const;
const HEAD = new Vector3(0, 0.14, 0);
const FINGERS = new Vector3(0, -0.03, -0.1);
const HEEL = new Vector3(0, -0.068, 0.07);
const TOE = new Vector3(0, -0.068, -0.17);
const ORIGIN = new Vector3();
/** A clip's joint on the other side of the body, for playing it mirrored. */
const MIRRORED = Object.fromEntries(JOINTS.map((j) => [j, (j.endsWith('L') ? `${j.slice(0, -1)}R` : j.endsWith('R') ? `${j.slice(0, -1)}L` : j) as Joint])) as Record<Joint, Joint>;

/** How much camouflage each slot's cloth takes, and how rough it is. */
const SLOT_FINISH: Readonly<Record<string, readonly [number, number]>> = {
  uniform: [1, 0.92],
  trousers: [1, 0.92],
  vest: [0.45, 0.8],
  pouch: [0.45, 0.8],
  strap: [0, 0.75],
  skin: [0, 0.62],
  helmet: [0.6, 0.66],
  boots: [0, 0.58],
  sole: [0, 0.8],
  accent: [0, 0.7],
  lens: [0, 0.18],
  glove: [0, 0.74],
};
/** The baked shade (the model's colour attribute) is this strong: 0 would ignore it. */
const SHADE = 0.85;

/**
 * The body's material: each vertex's colour is its slot's, already darkened by the model's baked shade; over it,
 * in the body's own space so it stays put as the soldier moves, a camouflage of darker blotches and paler flecks
 * on the cloth and a fine weave everywhere, and each slot's own roughness. The shoulder pads take none of it:
 * they are the team's colour and have to read as one flat mark.
 */
function bodyMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  const finish = attribute('finish', 'vec2');
  const camo = finish.x;
  const blotch = smoothstep(0.02, 0.1, mx_noise_float(positionGeometry.mul(7.5)));
  const fleck = smoothstep(0.16, 0.24, mx_noise_float(positionGeometry.mul(13).add(11.3)));
  const weave = mx_noise_float(positionGeometry.mul(170)).mul(0.05).add(1);
  const cloth = mix(float(1), float(0.7), blotch.mul(camo)).mul(mix(float(1), float(1.26), fleck.mul(camo))).mul(camo.mul(0.08).add(1));
  // Over the vertex colours, which the material multiplies in itself.
  material.colorNode = cloth.mul(weave);
  material.roughnessNode = finish.y.add(blotch.mul(camo).mul(0.04));
  return material;
}

let model: Object3D | null = null;
let clips: Clips = new Map();
let loading: Promise<void> | null = null;

/** Fetches the soldier model once; soldiers are built from it once it is in. */
export function loadSoldierModel(): Promise<void> {
  loading ??= new GLTFLoader()
    .loadAsync(new URL('./assets/soldier.glb', import.meta.url).href)
    .then(({ scene, animations }) => {
      model = scene;
      clips = readClips(animations);
    })
    .catch((error: unknown) => {
      console.warn('Unable to load the soldier model:', error);
    });
  return loading;
}

/** Uses an already parsed soldier model (tests read the GLB from disk). */
export function useSoldierModel(scene: Object3D, animations: readonly AnimationClip[] = []): void {
  model = scene;
  clips = readClips(animations);
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
const _q3 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _glow = new Color();

export class Soldier {
  readonly root = new Group();
  /** The pieces the soldier is drawn from (hidden: the far stand-in is boxed from them), by part name. */
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
  /** How far the soldier is into each clip's pose, eased, 0 to 1. */
  #crawl = 0;
  #revive = 0;
  /** Each clip's own time, in loops. */
  #crawled = 0;
  #revived = 0;
  /** The mantle under way or last made (ticket 67): its clip, how far into it the body is (s), and the clip's weight. */
  #mantleClip: 'climb' | 'vault' = 'climb';
  #mantleTime = 0;
  #mantleSeconds = 1;
  #mantling = false;
  #mantle = 0;
  #dt = 0;
  /** The death under way or done: its clip, where in it the body is and joined it (s), mirrored or not, and the pose it took the body from. */
  #death: { clip: Clip; time: number; start: number; mirror: boolean; from: { q: Quaternion; at: Vector3 }[] } | null = null;
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
   * as a rigidly weighted bone, in its slot's colour under the model's baked
   * shade. One draw call (two with its shadow).
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
      g.applyMatrix4(piece.matrixWorld);
      const shadeAt = source.getAttribute('color');
      const c = (piece.material as MeshStandardNodeMaterial).color;
      const [camo, roughness] = SLOT_FINISH[(piece.material as MeshStandardNodeMaterial).name] ?? [0, 0.8];
      const n = g.getAttribute('position').count;
      const colour = new Float32Array(n * 3);
      const finish = new Float32Array(n * 2);
      const skinIndex = new Uint16Array(n * 4);
      const skinWeight = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const k = shadeAt ? 1 - SHADE + SHADE * shadeAt.getX(v) : 1;
        colour.set([c.r * k, c.g * k, c.b * k], v * 3);
        finish.set([camo, roughness], v * 2);
        skinIndex[v * 4] = index;
        skinWeight[v * 4] = 1;
      }
      if (source !== piece.geometry) source.dispose();
      g.setAttribute('color', new BufferAttribute(colour, 3));
      g.setAttribute('finish', new BufferAttribute(finish, 2));
      g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
      g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
      geometries.push(g);
    }
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) return;
    const material = bodyMaterial();
    this.#materials.push(material);
    const body = new SkinnedMesh(merged, material);
    body.name = 'body';
    body.castShadow = true;
    this.root.add(body);
    body.updateMatrixWorld(true);
    body.bind(new Skeleton(bones));
    // Posed, a soldier reaches about a metre and a half from its feet (prone, rifle forward; fallen, laid out).
    body.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.7);
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

  /** Moves the soldier to where `p` stands and turns it their way, leaving the pose as it was (a soldier posed less often than drawn). */
  place(p: PlayerOutput): void {
    this.root.position.set(p.position[0], p.position[1], p.position[2]);
    this.root.rotation.y = p.yaw;
  }

  /** Whether the body and the gun in hand cast into the sun's shadow map. */
  castShadows(on: boolean): void {
    if (this.#body) this.#body.castShadow = on;
    if (this.#gun) this.#gun.castShadow = on;
  }

  update(p: PlayerOutput, dt: number): void {
    const b = this.#bones;
    // Below, joints only set what their own pose moves: a clip's turns have to be gone first.
    if (this.#crawl + this.#revive + this.#mantle > 0) {
      for (const joint of JOINTS) {
        b[joint].position.copy(this.#rest[joint]);
        b[joint].rotation.set(0, 0, 0);
      }
    }
    this.root.position.set(p.position[0], p.position[1], p.position[2]);
    this.root.rotation.y = p.yaw;
    this.#dt = dt;
    const ease = (cur: number, target: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
    const speed = Math.hypot(p.velocity[0], p.velocity[2]);
    const w = p.weapon;
    this.#crouch = ease(this.#crouch, p.stance === 'crouch' ? 1 : 0, 0.08);
    this.#prone = ease(this.#prone, p.stance === 'prone' && p.eyeHeight < STATS.stance.crouchEyeHeight.value ? 1 : 0, 0.12);
    this.#slide = ease(this.#slide, p.movement === 'slide' ? 1 : 0, 0.06);
    this.#sprint = ease(this.#sprint, p.movement === 'sprint' ? 1 : 0, 0.1);
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
    this.#playClips(p, speed, ease);

    this.#flash = Math.max(0, this.#flash - dt * 6);
    const glow = new Color(0.9, 0.1, 0.05).multiplyScalar(this.#flash * 0.8);
    for (const m of this.#materials) m.emissive.copy(glow);
  }

  /** Whether the soldier has been killed (`die`): it is a body from then on, moved by `fall`. */
  get dead(): boolean {
    return this.#death !== null;
  }

  /**
   * Kills the soldier in the pose it is in. `push` is the killing shot's (world space, see PlayersView.hit): from
   * the front it throws the body onto its back, from behind onto its chest, and from the side, or with no push to
   * speak of, the body folds onto its side where it stood. `room(right, back)` says whether the body may come to
   * lie that far (m) to the soldier's right and behind it: with a wall there it folds up short of it instead.
   * `fall` plays the death from then on; `update` is over for this soldier.
   */
  die(push: Vec3, room: (right: number, back: number) => boolean = () => true): void {
    const b = this.#bones;
    const yaw = this.root.rotation.y;
    // The soldier faces -Z turned by its yaw; its right is +X turned the same.
    const back = push[0] * Math.sin(yaw) + push[2] * Math.cos(yaw);
    const right = push[0] * Math.cos(yaw) - push[2] * Math.sin(yaw);
    const size = Math.hypot(back, right);
    const low = this.#prone > 0.5 || this.#crawl > 0.5;
    let name: Death = low ? 'fallFront' : size < DEATH_PUSH || Math.abs(back) < size * 0.5 ? 'crumple' : back > 0 ? 'fallBack' : 'fallFront';
    if (!low && name !== 'crumple' && !room(0, name === 'fallBack' ? DEATH_LENGTH : -DEATH_LENGTH)) name = 'crumple';
    // The fold lands on the right side: mirrored, on the left, the way the push went or wherever there is room.
    let mirror = name === 'crumple' && (size < DEATH_PUSH ? Math.random() < 0.5 : right < 0);
    if (name === 'crumple' && !room(mirror ? -DEATH_WIDTH : DEATH_WIDTH, 0) && room(mirror ? DEATH_WIDTH : -DEATH_WIDTH, 0)) mirror = !mirror;
    const clip = clips.get(name);
    this.#gunMount.visible = false;
    if (!clip) return;
    // A body already low joins the fall part-way down.
    const start = Math.min(0.8, Math.max(0, 1 - b.hips.position.y / 0.8)) * clip.duration;
    this.#death = { clip, time: start, start, mirror, from: JOINTS.map((j) => ({ q: b[j].quaternion.clone(), at: b[j].position.clone() })) };
  }

  /** Carries the death on by `dt` seconds. Returns how far through its fall the body is, 0 to 1 (1: lying still). */
  fall(dt: number): number {
    const d = this.#death;
    this.#flash = Math.max(0, this.#flash - dt * 6);
    const glow = _glow.setRGB(0.9, 0.1, 0.05).multiplyScalar(this.#flash * 0.8);
    for (const m of this.#materials) m.emissive.copy(glow);
    if (!d) return 1;
    d.time = Math.min(d.clip.duration, d.time + dt);
    const done = d.time / d.clip.duration;
    // A fall gathers speed: the clip's keys are even, so its early ones are held longer.
    const t = Math.pow(done, 1.35) * d.clip.duration * MANTLE_END;
    const w = smooth((d.time - d.start) / DEATH_BLEND);
    JOINTS.forEach((joint, i) => {
      const bone = this.#bones[joint];
      const from = d.from[i]!;
      bone.quaternion.copy(from.q);
      // Whatever the gun's hold had slid (a shoulder reaching) goes back where it belongs.
      bone.position.lerpVectors(from.at, this.#rest[joint], joint === 'hips' ? 0 : w);
    });
    for (const { joint, turn, at } of d.clip.joints) {
      const bone = this.#bones[d.mirror ? MIRRORED[joint] : joint];
      _q.fromArray(turn.evaluate(t));
      if (d.mirror) _q.set(_q.x, -_q.y, -_q.z, _q.w);
      bone.quaternion.slerp(_q, w);
      if (at) {
        _a.fromArray(at.evaluate(t));
        if (d.mirror) _a.x = -_a.x;
        bone.position.lerp(_a, w);
      }
    }
    this.#restOnGround();
    return done;
  }

  /**
   * Keeps a falling body out of the ground it falls on (the root's own level: PlayersView lays the root along
   * a slope). The clips were made for one starting pose and are joined from any, so first the trunk is lifted
   * onto whatever it would rest on, then each limb is swung up from its shoulder or hip until its joints clear,
   * and the hands and toes after them.
   */
  #restOnGround(): void {
    const b = this.#bones;
    let lack = LIES.hips - b.hips.position.y;
    for (const s of ['L', 'R'] as const) lack = Math.max(lack, LIES.shoulder - this.#inRoot(b.spine, this.#rest[`shoulder${s}`], _a).y);
    lack = Math.max(lack, LIES.head - this.#inRoot(b.neck, HEAD, _a).y);
    if (lack > 0) b.hips.position.y += lack;
    // Twice: lifting a limb's far joint can dip its near one again.
    for (let pass = 0; pass < 2; pass++) {
      for (const s of ['L', 'R'] as const) {
        this.#clear(b[`shoulder${s}`], b[`elbow${s}`], ORIGIN, LIES.elbow);
        this.#clear(b[`shoulder${s}`], b[`wrist${s}`], ORIGIN, LIES.wrist);
        this.#clear(b[`wrist${s}`], b[`wrist${s}`], FINGERS, LIES.hand);
        this.#clear(b[`hip${s}`], b[`knee${s}`], ORIGIN, LIES.knee);
        this.#clear(b[`hip${s}`], b[`ankle${s}`], ORIGIN, LIES.ankle);
        this.#clear(b[`ankle${s}`], b[`ankle${s}`], HEEL, LIES.sole);
        this.#clear(b[`ankle${s}`], b[`ankle${s}`], TOE, LIES.sole);
      }
    }
  }

  /** Where `at`, a point in `bone`'s frame, is in the root's. */
  #inRoot(bone: Object3D, at: Vector3, out: Vector3): Vector3 {
    out.copy(at);
    for (let o: Object3D | null = bone; o && o !== this.root; o = o.parent) out.applyQuaternion(o.quaternion).add(o.position);
    return out;
  }

  /** Swings `bone` up about a level axis through itself, just far enough that the point `at` of `end`'s frame is `radius` clear of the ground under the root. */
  #clear(bone: Bone, end: Object3D, at: Vector3, radius: number): void {
    const point = this.#inRoot(end, at, _a);
    const lack = radius - point.y;
    if (lack <= 0) return;
    const reach = point.sub(this.#inRoot(bone, ORIGIN, _b));
    const length = reach.length();
    if (length < 1e-4) return;
    const rise = Math.asin(Math.min(1, (reach.y + lack) / length)) - Math.asin(Math.max(-1, reach.y / length));
    const level = Math.hypot(reach.x, reach.z);
    _q.setFromAxisAngle(level > 1e-4 ? _c.set(-reach.z / level, 0, reach.x / level) : _c.set(1, 0, 0), rise);
    // The swing is in the root's frame: carried into that of the bone's parent.
    const parent = _q2.identity();
    for (let o = bone.parent; o && o !== this.root; o = o.parent) parent.premultiply(o.quaternion);
    bone.quaternion.premultiply(_q.premultiply(_q3.copy(parent).invert()).multiply(parent));
  }

  /** Lays the crawl, the Revive or a mantle over the pose worked out so far, and puts the gun away under them. */
  #playClips(p: PlayerOutput, speed: number, ease: (cur: number, target: number, tau: number) => number): void {
    this.#crawl = ease(this.#crawl, p.downed ? 1 : 0, 0.14);
    this.#revive = ease(this.#revive, p.reviving != null ? 1 : 0, 0.14);
    // Tiny weights left by the easing are done with.
    if (this.#crawl < 0.001) this.#crawl = 0;
    if (this.#revive < 0.001) this.#revive = 0;
    this.#crawled += (speed * this.#dt) / CRAWL_STRIDE;
    this.#revived += this.#dt / (clips.get('revive')?.duration ?? 1);
    this.#wear(clips.get('crawl'), this.#crawled, this.#crawl);
    this.#wear(clips.get('revive'), this.#revived, this.#revive);
    // A mantle plays its clip once, by how far through it the body is; a new one starts it over. The climb takes both
    // hands, so the gun goes away for it; the vault keeps it in the right hand.
    const band = p.movement === 'mantle' ? p.mantle : null;
    if (band && !this.#mantling) {
      this.#mantleClip = band === 'lowVault' ? 'vault' : 'climb';
      this.#mantleSeconds = mantleDuration(band);
      this.#mantleTime = 0;
    }
    this.#mantling = band !== null;
    if (band) this.#mantleTime += this.#dt;
    // Still mantling past its length is the next one, started on the tick the last arrived.
    if (band && this.#mantleTime > this.#mantleSeconds + MANTLE_AGAIN) {
      this.#mantleTime -= this.#mantleSeconds;
      this.#mantleClip = band === 'lowVault' ? 'vault' : 'climb';
      this.#mantleSeconds = mantleDuration(band);
    }
    this.#mantle = ease(this.#mantle, band ? 1 : 0, band ? 0.05 : 0.1);
    if (this.#mantle < 0.001) this.#mantle = 0;
    this.#wear(clips.get(this.#mantleClip), Math.min(MANTLE_END, this.#mantleTime / this.#mantleSeconds), this.#mantle);
    const climb = this.#mantleClip === 'climb' ? this.#mantle : 0;
    this.#gunMount.visible = Math.max(this.#crawl, this.#revive, climb) < GUN_AWAY;
  }

  #wear(clip: Clip | undefined, loops: number, weight: number): void {
    if (!clip || weight === 0) return;
    const t = (loops % 1) * clip.duration;
    for (const { joint, turn, at } of clip.joints) {
      const bone = this.#bones[joint];
      bone.quaternion.slerp(_q.fromArray(turn.evaluate(t)), weight);
      if (at) bone.position.lerp(_a.fromArray(at.evaluate(t)), weight);
    }
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
