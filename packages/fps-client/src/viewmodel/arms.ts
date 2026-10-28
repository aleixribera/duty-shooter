/**
 * First-person arms: a combat-shirt sleeve and a tactical glove (fabric
 * back, suede palm, rubber finger pads, moulded knuckle guard, wrist strap),
 * modelled and baked in Blender (tools/weapon/arms.py) as the right arm. The
 * left arm is its mirror image. Both are skinned to one skeleton driven by a
 * two-bone IK per arm. The elbow is a hinge; the forearm's roll toward the
 * hand (the radius turning over the ulna) is spread over three twist bones
 * so the sleeve turns along its length instead of wringing at the elbow.
 * Fingers curl with their joints coupled the way a hand closes: the tip
 * joint follows the middle one, the fingers draw together as they close, and
 * the little finger leads.
 *
 * Arms space = the space of `root` (meant to be parented to the viewmodel
 * camera: camera at the origin looking down -Z).
 *
 * Hand / palm frame convention (same as the gun's grip sockets): origin at
 * the centre of the palm surface, palm faces -Y, straight fingers point -Z,
 * the wrist is toward +Z, thumb at -X (right hand) / +X (left hand).
 */
import {
  BufferAttribute,
  Bone,
  Group,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import type { BufferGeometry, Material, Object3D, Texture } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Y, basis, qAxis } from './meshkit';

export interface ArmsModel {
  readonly root: Group;
  /** Places the hands: each hand's palm matches the target's world transform exactly (two-bone IK from the shoulders, elbows bend outward/down; a target beyond 93% of full reach slides that shoulder toward it, which the default left hand on the handguard does by about 14 cm, like a bladed stance). Targets are Object3Ds anywhere in the scene graph. */
  solve(rightTarget: Object3D, leftTarget: Object3D): void;
  /** Finger curl 0 (open) .. 1 (closed grip) per hand, for reload/inspect poses. */
  setGrip(right: number, left: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Proportions (metres)
// ---------------------------------------------------------------------------

/** Shoulder to elbow. */
const L1 = 0.33;
/** Elbow to wrist. */
const L2 = 0.3;
/** Palm surface centre in the hand bone's frame (hand bone origin = wrist). */
const PALM = new Vector3(0, -0.0165, -0.05);
const SHOULDER_R = new Vector3(0.2, -0.25, 0.1);
const POLE_R = new Vector3(0.6, -1, 0.15);
/** Fraction of full reach kept as a minimum elbow bend (shoulder slides forward otherwise). */
const MAX_REACH = 0.93;
/** Weight of the hand orientation in the elbow pole hint. */
const HAND_HINT = 1.2;

interface FingerDef {
  readonly base: readonly [number, number, number];
  readonly len: readonly [number, number, number];
  readonly r: number;
  readonly splay: number;
}

const FINGERS: readonly FingerDef[] = [
  { base: [-0.0292, 0.0012, -0.093], len: [0.044, 0.026, 0.022], r: 0.0098, splay: 0.05 },
  { base: [-0.0097, 0.0016, -0.097], len: [0.048, 0.03, 0.023], r: 0.0101, splay: 0.012 },
  { base: [0.0098, 0.0012, -0.0945], len: [0.045, 0.029, 0.022], r: 0.0096, splay: -0.03 },
  { base: [0.0281, -0.0008, -0.0875], len: [0.036, 0.022, 0.02], r: 0.0086, splay: -0.08 },
];
const THUMB_BASE: readonly [number, number, number] = [-0.0255, -0.009, -0.019];
const THUMB_DIR = new Vector3(-0.62, -0.34, -0.71).normalize();
const THUMB_LEN: readonly [number, number, number] = [0.044, 0.033, 0.028];
const THUMB_R: readonly [number, number, number] = [0.0128, 0.0113, 0.0103];

/**
 * Per-joint curl at grip = 1: [index, middle, ring, pinky, thumb] x
 * [base, mid, tip] (radians), plus an optional base splay toward the little
 * finger (radians, negative) blended in with the grip.
 */
type GripRow = readonly [number, number, number, number?];
const GRIP_RIGHT: readonly GripRow[] = [
  // Index across the front of the trigger.
  [0.1, 1.0, 0.6, -0.45],
  [1.05, 1.35, 0.45],
  [1.05, 1.35, 0.45],
  [1.05, 1.35, 0.45],
  [0.35, 0.55, 0.45],
];
const GRIP_LEFT: readonly GripRow[] = [
  [0.3, 0.6, 0.3],
  [0.6, 0.95, 0.45],
  [0.65, 1.0, 0.45],
  [0.75, 1.0, 0.45],
  [0.8, 0.8, 0.5],
];
const GRIP_OPEN: readonly [number, number, number] = [0.08, 0.14, 0.08];
/** How far the tip joint follows the middle one (tendon coupling, about 2/3 in a real finger). */
const DIP_COUPLING = 0.67;
/** Joint limits (radians): knuckle, middle and tip joints of a finger. */
const FINGER_MAX: readonly [number, number, number] = [1.6, 1.9, 1.3];
/** Splay each finger loses toward the middle finger as it closes (index, middle, ring, pinky). */
const CONVERGE: readonly number[] = [-0.05, 0, 0.04, 0.1];
/** How far behind the little finger each finger starts closing (index, middle, ring, pinky, thumb), as a fraction of the grip. */
const CASCADE: readonly number[] = [0.14, 0.09, 0.04, 0, 0.1];
/** Forearm roll range of the right arm about the forearm's +Z, from the hinge frame (0 = back of the hand toward the elbow crease, fully pronated; negative = supinating). */
const ROLL_MIN = -250 * (Math.PI / 180);

// Bones per arm: upper arm, forearm, hand, 4 fingers x 3, thumb x 3, 3 forearm twist bones.
const BONES_PER_ARM = 21;
const TWIST_BONES = 3;
/** Bone names within one arm, in index order; the Blender model's vertex groups use the same names. */
const BONE_NAMES: readonly string[] = [
  'upper', 'fore', 'hand',
  ...[0, 1, 2, 3].flatMap((k) => [0, 1, 2].map((j) => `f${k}_${j}`)),
  'thumb_0', 'thumb_1', 'thumb_2',
  'twist0', 'twist1', 'twist2',
];

const XAXIS = new Vector3(1, 0, 0);
const ZAXIS = new Vector3(0, 0, 1);

const ARMS_URL = new URL('./assets/arms.glb', import.meta.url).href;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface ArmRig {
  upper: Bone;
  fore: Bone;
  hand: Bone;
  /** Children of the forearm at a third, two thirds and all of the way to the wrist. */
  twist: Bone[];
  fingers: Bone[][]; // 4 fingers + thumb, 3 bones each
  restFinger: Quaternion[]; // rest rotation of each chain's first bone
  shoulder: Vector3;
  pole: Vector3;
  sign: 1 | -1;
}

function mirrorQ(q: Quaternion, sign: 1 | -1): Quaternion {
  return sign > 0 ? q.clone() : new Quaternion(q.x, -q.y, -q.z, q.w);
}

function thumbRest(): Quaternion {
  // Local -Z along the thumb, local -Y toward the flex direction (palm / fingers).
  const z = THUMB_DIR.clone().negate();
  const flex = new Vector3(0.75, -0.65, -0.1).normalize();
  const y = flex.clone().sub(z.clone().multiplyScalar(flex.dot(z))).normalize().negate();
  const x = new Vector3().crossVectors(y, z).normalize();
  return new Quaternion().setFromRotationMatrix(basis(x, y, z));
}

function buildRig(sign: 1 | -1, bones: Bone[], shoulderAt: Vector3): ArmRig {
  const mx = (v: readonly [number, number, number]): Vector3 => new Vector3(v[0] * sign, v[1], v[2]);
  const side = sign > 0 ? 'R_' : 'L_';
  const upper = new Bone();
  const shoulder = shoulderAt.clone();
  // Bind pose is built around the default shoulder; IK uses `shoulder`.
  upper.position.set(SHOULDER_R.x * sign, SHOULDER_R.y, SHOULDER_R.z);
  const fore = new Bone();
  fore.position.set(0, 0, -L1);
  upper.add(fore);
  const hand = new Bone();
  hand.position.set(0, 0, -L2);
  fore.add(hand);
  bones.push(upper, fore, hand);
  const fingers: Bone[][] = [];
  const restFinger: Quaternion[] = [];
  for (const f of FINGERS) {
    const b1 = new Bone();
    b1.position.copy(mx(f.base));
    const rq = mirrorQ(qAxis(Y, f.splay), sign);
    b1.quaternion.copy(rq);
    const b2 = new Bone();
    b2.position.set(0, 0, -f.len[0]);
    const b3 = new Bone();
    b3.position.set(0, 0, -f.len[1]);
    hand.add(b1);
    b1.add(b2);
    b2.add(b3);
    fingers.push([b1, b2, b3]);
    restFinger.push(rq);
    bones.push(b1, b2, b3);
  }
  const t1 = new Bone();
  t1.position.copy(mx(THUMB_BASE));
  const tq = mirrorQ(thumbRest(), sign);
  t1.quaternion.copy(tq);
  const t2 = new Bone();
  t2.position.set(0, 0, -THUMB_LEN[0]);
  const t3 = new Bone();
  t3.position.set(0, 0, -THUMB_LEN[1]);
  hand.add(t1);
  t1.add(t2);
  t2.add(t3);
  fingers.push([t1, t2, t3]);
  restFinger.push(tq);
  bones.push(t1, t2, t3);
  const twist: Bone[] = [];
  for (let i = 0; i < TWIST_BONES; i++) {
    const b = new Bone();
    b.position.set(0, 0, (-L2 * (i + 1)) / TWIST_BONES);
    fore.add(b);
    twist.push(b);
    bones.push(b);
  }
  bones.slice(-BONES_PER_ARM).forEach((b, i) => {
    b.name = side + BONE_NAMES[i]!;
  });
  return {
    upper,
    fore,
    hand,
    twist,
    fingers,
    restFinger,
    shoulder,
    pole: new Vector3(POLE_R.x * sign, POLE_R.y, POLE_R.z),
    sign,
  };
}

interface ArmPart {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/**
 * The loaded right arm's skinned meshes, each merged with its mirror image for
 * the left arm, their joints renumbered onto this module's bone order.
 */
function armParts(scene: Object3D): ArmPart[] {
  scene.updateMatrixWorld(true);
  const parts: ArmPart[] = [];
  scene.traverse((o) => {
    const source = o as SkinnedMesh;
    if (!source.isSkinnedMesh) return;
    const names = source.skeleton.bones.map((b) => b.name);
    const remap = names.map((n) => {
      const i = BONE_NAMES.indexOf(n);
      if (i < 0) throw new Error(`Unknown arm bone: ${n}`);
      return i;
    });
    const right = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
    right.applyMatrix4(source.matrixWorld);
    const joints = right.getAttribute('skinIndex');
    for (let i = 0; i < joints.count; i++) {
      for (let c = 0; c < 4; c++) joints.setComponent(i, c, remap[joints.getComponent(i, c)]!);
    }
    parts.push({ geometry: mergeGeometries([right, mirrored(right)]) ?? right, material: source.material as Material });
    source.geometry.dispose();
  });
  return parts;
}

/** `g` mirrored across x = 0 onto the left arm's bones (non-indexed, so winding flips per triangle). */
function mirrored(g: BufferGeometry): BufferGeometry {
  const m = g.clone();
  const flipX = (name: string, w: boolean): void => {
    const a = m.getAttribute(name) as BufferAttribute | undefined;
    if (!a) return;
    for (let i = 0; i < a.count; i++) {
      a.setX(i, -a.getX(i));
      if (w) a.setW(i, -a.getW(i));
    }
  };
  flipX('position', false);
  flipX('normal', false);
  flipX('tangent', true);
  const joints = m.getAttribute('skinIndex');
  for (let i = 0; i < joints.count; i++) {
    for (let c = 0; c < 4; c++) joints.setComponent(i, c, joints.getComponent(i, c) + BONES_PER_ARM);
  }
  // Swap the second and third corner of every triangle so the faces still point outward.
  for (const name of Object.keys(m.attributes)) {
    const a = m.getAttribute(name) as BufferAttribute;
    const n = a.itemSize;
    const arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let c = 0; c < n; c++) {
        const i1 = (t + 1) * n + c;
        const i2 = (t + 2) * n + c;
        const tmp = arr[i1]!;
        arr[i1] = arr[i2]!;
        arr[i2] = tmp;
      }
    }
  }
  return m;
}

function disposeParts(parts: readonly ArmPart[]): void {
  for (const { geometry, material } of parts) {
    geometry.dispose();
    for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
    material.dispose();
  }
}

export interface ArmsOptions {
  /** Right shoulder joint in arms space (default (0.2, -0.25, 0.1)). */
  readonly rightShoulder?: Vector3;
  /** Left shoulder joint (default: mirror of the right one). */
  readonly leftShoulder?: Vector3;
}

export function buildArms(options: ArmsOptions = {}): ArmsModel {
  const rs = options.rightShoulder ?? SHOULDER_R;
  const ls = options.leftShoulder ?? new Vector3(-rs.x, rs.y, rs.z);
  const root = new Group();
  root.name = 'Arms';

  const bones: Bone[] = [];
  const right = buildRig(1, bones, rs);
  const left = buildRig(-1, bones, ls);

  // The skeleton in its rest pose, in arms space; the model is bound to it once it loads.
  const rigRoot = new Group();
  rigRoot.name = 'armsRig';
  rigRoot.add(right.upper, left.upper);
  root.add(rigRoot);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const meshes: SkinnedMesh[] = [];
  let disposed = false;
  void new GLTFLoader().loadAsync(ARMS_URL).then(({ scene }) => {
    const parts = armParts(scene);
    if (disposed) {
      disposeParts(parts);
      return;
    }
    for (const { geometry, material } of parts) {
      const mesh = new SkinnedMesh(geometry, material);
      mesh.name = `arms:${material.name}`;
      mesh.frustumCulled = false;
      rigRoot.add(mesh);
      mesh.bind(skeleton, new Matrix4());
      meshes.push(mesh);
    }
  }).catch((error: unknown) => {
    console.warn('Unable to load the arms model:', error);
  });

  // Scratch objects.
  const meshInv = new Matrix4();
  const tm = new Matrix4();
  const P = new Vector3();
  const Qh = new Quaternion();
  const scl = new Vector3();
  const W = new Vector3();
  const S = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  const E = new Vector3();
  const hint = new Vector3();
  const dirU = new Vector3();
  const dirF = new Vector3();
  const yU = new Vector3();
  const yF = new Vector3();
  const yF0 = new Vector3();
  const xA = new Vector3();
  const zA = new Vector3();
  const qU = new Quaternion();
  const qF = new Quaternion();
  const qTmp = new Quaternion();
  const bm = new Matrix4();

  const solveArm = (rig: ArmRig, target: Object3D): void => {
    tm.multiplyMatrices(meshInv, target.matrixWorld);
    tm.decompose(P, Qh, scl);
    // Wrist position from the palm target.
    W.copy(PALM).applyQuaternion(Qh);
    W.subVectors(P, W);
    S.copy(rig.shoulder);
    let d = W.distanceTo(S);
    const maxR = (L1 + L2) * MAX_REACH;
    const minR = Math.abs(L1 - L2) + 0.08;
    if (d > maxR || d < minR) {
      const want = d > maxR ? maxR : minR;
      u.subVectors(W, S);
      if (u.lengthSq() < 1e-12) u.set(0, 0, -1);
      u.normalize();
      S.copy(W).addScaledVector(u, -want);
      d = want;
    }
    u.subVectors(W, S).normalize();
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    // Elbow hint: the configured pole (down/outward) blended with the
    // direction the wrist points, which keeps the wrist bend small.
    hint.set(0, 0, 1).applyQuaternion(Qh).multiplyScalar(HAND_HINT).add(rig.pole);
    v.copy(hint).addScaledVector(u, -hint.dot(u));
    if (v.lengthSq() < 1e-8) v.set(0, -1, 0).addScaledVector(u, u.y);
    v.normalize();
    E.copy(S).addScaledVector(u, L1 * cosA).addScaledVector(v, L1 * sinA);
    dirU.subVectors(E, S).normalize();
    dirF.subVectors(W, E).normalize();
    // Upper arm: -Z along the bone, +Y toward the inside of the elbow bend.
    zA.copy(dirU).negate();
    yU.copy(v).negate().addScaledVector(dirU, v.dot(dirU)).normalize();
    xA.crossVectors(yU, zA).normalize();
    qU.setFromRotationMatrix(bm.makeBasis(xA, yU, zA));
    // Forearm: a hinge at the elbow, +Y toward the inside of the bend like the upper arm.
    zA.copy(dirF).negate();
    yF0.copy(v).negate().addScaledVector(dirF, v.dot(dirF)).normalize();
    xA.crossVectors(yF0, zA).normalize();
    qF.setFromRotationMatrix(bm.makeBasis(xA, yF0, zA));
    // Its roll toward the back of the hand, kept inside what a forearm can turn
    // and spread over the twist bones; the hand bone takes the rest exactly.
    yF.set(0, 1, 0).applyQuaternion(Qh);
    yF.addScaledVector(dirF, -yF.dot(dirF));
    let roll = 0;
    if (yF.lengthSq() > 1e-8) {
      yF.normalize();
      roll = Math.atan2(xA.crossVectors(yF0, yF).dot(zA), yF0.dot(yF)) * rig.sign;
      while (roll < ROLL_MIN) roll += 2 * Math.PI;
      while (roll >= ROLL_MIN + 2 * Math.PI) roll -= 2 * Math.PI;
      roll *= rig.sign;
    }
    rig.upper.position.copy(S);
    rig.upper.quaternion.copy(qU);
    rig.fore.quaternion.copy(qTmp.copy(qU).invert().multiply(qF));
    rig.hand.quaternion.copy(qTmp.copy(qF).invert().multiply(Qh));
    rig.twist.forEach((b, i) => b.quaternion.setFromAxisAngle(ZAXIS, (roll * (i + 1)) / TWIST_BONES));
  };

  const curl = (rig: ArmRig, g: number, table: readonly GripRow[]): void => {
    const grip = Math.max(0, Math.min(1, g));
    rig.fingers.forEach((chain, ci) => {
      const full = table[ci]!;
      const thumb = ci === 4;
      // The little finger closes first and the index last; eased so each finger settles.
      const lag = CASCADE[ci]!;
      const t = Math.max(0, Math.min(1, (grip - lag) / (1 - lag)));
      const k = t * t * (3 - 2 * t);
      const angles = [0, 1, 2].map((j) => GRIP_OPEN[j]! + (full[j]! - GRIP_OPEN[j]!) * k);
      if (!thumb) {
        // The tip joint can't bend on its own: it follows the middle joint.
        angles[2] = Math.max(angles[2]!, angles[1]! * DIP_COUPLING * k + GRIP_OPEN[2]! * (1 - k));
        for (let j = 0; j < 3; j++) angles[j] = Math.min(angles[j]!, FINGER_MAX[j]!);
      }
      chain.forEach((b, j) => {
        const bend = qAxis(XAXIS, -angles[j]!);
        if (j === 0) {
          const spread = ((full[3] ?? 0) + (thumb ? 0 : CONVERGE[ci]!)) * k * rig.sign;
          b.quaternion.copy(rig.restFinger[ci]!).multiply(qAxis(Y, spread)).multiply(bend);
        }
        else b.quaternion.copy(bend);
      });
    });
  };

  curl(right, 1, GRIP_RIGHT);
  curl(left, 1, GRIP_LEFT);

  return {
    root,
    solve(rightTarget: Object3D, leftTarget: Object3D): void {
      rightTarget.updateWorldMatrix(true, false);
      leftTarget.updateWorldMatrix(true, false);
      rigRoot.updateWorldMatrix(true, false);
      meshInv.copy(rigRoot.matrixWorld).invert();
      solveArm(right, rightTarget);
      solveArm(left, leftTarget);
      rigRoot.updateMatrixWorld(true);
    },
    setGrip(r: number, l: number): void {
      curl(right, r, GRIP_RIGHT);
      curl(left, l, GRIP_LEFT);
    },
    dispose(): void {
      disposed = true;
      disposeParts(meshes.map((m) => ({ geometry: m.geometry, material: m.material as Material })));
      skeleton.dispose();
    },
  };
}
