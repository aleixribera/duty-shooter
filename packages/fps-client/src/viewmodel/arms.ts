/**
 * Procedural first-person arms: tactical gloves (two-tone fabric with
 * knuckle padding and segmented fingers), combat-shirt sleeves rolled to the
 * forearm, bare forearms. One SkinnedMesh (3 materials, 3 draw calls) driven
 * by a two-bone IK per arm.
 *
 * Arms space = the space of `root` (meant to be parented to the viewmodel
 * camera: camera at the origin looking down -Z).
 *
 * Hand / palm frame convention (same as the gun's grip sockets): origin at
 * the centre of the palm surface, palm faces -Y, straight fingers point -Z,
 * the wrist is toward +Z, thumb at -X (right hand) / +X (left hand).
 */
import {
  Bone,
  Group,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import type { BufferGeometry, Object3D } from 'three/webgpu';
import { abs, float, mix, mx_fractal_noise_float, mx_noise_float, positionGeometry, sin, smoothstep, vec3 } from 'three/tsl';
import { GeoBuilder, Part, Y, appendPart, basis, bumpNormal, grid, qAxis, surfNode, vnoise2 } from './meshkit';
import type { GridSample, SkinRef } from './meshkit';

export interface ArmsModel {
  readonly root: Group;
  /** Places the hands: each hand's palm matches the target's world transform exactly (two-bone IK from fixed shoulders; elbows bend outward/down naturally). Targets are Object3Ds anywhere in the scene graph. */
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

/** Per-joint curl at grip = 1: [index, middle, ring, pinky, thumb] x [base, mid, tip] (radians). */
const GRIP_RIGHT: readonly (readonly [number, number, number])[] = [
  [0.3, 0.95, 0.45],
  [1.3, 1.5, 0.55],
  [1.35, 1.5, 0.55],
  [1.4, 1.45, 0.55],
  [0.35, 0.55, 0.45],
];
const GRIP_LEFT: readonly (readonly [number, number, number])[] = [
  [0.85, 1.05, 0.5],
  [0.95, 1.1, 0.5],
  [1.0, 1.1, 0.5],
  [1.05, 1.1, 0.5],
  [0.15, 0.25, 0.2],
];
const GRIP_OPEN: readonly [number, number, number] = [0.08, 0.14, 0.08];

// Bone indices within one arm.
const B_UPPER = 0;
const B_FORE = 1;
const B_HAND = 2;
const B_FINGER0 = 3; // 4 fingers x 3 bones
const B_THUMB = 15; // 3 bones
const BONES_PER_ARM = 18;

// ---------------------------------------------------------------------------
// Skin weights
// ---------------------------------------------------------------------------

function sstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Weight along the arm by arm coordinate `a` (distance from the shoulder in the rest pose). */
function armWeight(a: number): SkinRef {
  if (a < L1 + 0.05) return { i0: B_UPPER, i1: B_FORE, w1: sstep(L1 - 0.04, L1 + 0.04, a) };
  return { i0: B_FORE, i1: B_HAND, w1: sstep(L1 + L2 - 0.03, L1 + L2 + 0.012, a) };
}

/** Weight along a finger chain by distance t from its base joint. */
function chainWeight(t: number, len: readonly [number, number, number], first: number, parent: number, baseBlend: number): SkinRef {
  if (t < len[0] * 0.5) return { i0: parent, i1: first, w1: sstep(-baseBlend, baseBlend * 0.6, t) };
  if (t < len[0] + len[1] * 0.5) return { i0: first, i1: first + 1, w1: sstep(len[0] - 0.0045, len[0] + 0.0045, t) };
  return { i0: first + 1, i1: first + 2, w1: sstep(len[0] + len[1] - 0.004, len[0] + len[1] + 0.004, t) };
}

// ---------------------------------------------------------------------------
// Geometry (right arm; the left arm is its mirror image)
// ---------------------------------------------------------------------------

function superellipse(th: number, a: number, b: number, n: number): [number, number] {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

function lerpTable(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      const u = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * u;
    }
  }
  return table[table.length - 1]![1];
}

/** Sleeve from behind the shoulder to the rolled cuff, in arm coordinates (rest: along -Z from the shoulder). */
function sleeve(): Part {
  const a0 = -0.07;
  const a1 = L1 + 0.105;
  const n = 90;
  const segs = 40;
  const radius: readonly (readonly [number, number])[] = [
    [-0.07, 0.054],
    [0.05, 0.052],
    [0.2, 0.047],
    [L1 - 0.02, 0.045],
    [L1 + 0.04, 0.0435],
    [L1 + 0.058, 0.044],
  ];
  return grid(n, segs, (i, j, s) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const th = (j / segs) * Math.PI * 2;
    let r = lerpTable(radius, a);
    let ao = 1;
    let tint = 1;
    // Wrinkles: long soft folds plus bunching around the elbow.
    const folds = vnoise2(a * 32, th * 2.2) * 0.0018 + vnoise2(a * 70 + 13, th * 4) * 0.0008;
    const elbow = Math.exp(-(((a - L1) / 0.05) ** 2));
    const bunch = Math.sin(a * 260 + vnoise2(th * 3, a * 20) * 2.5) * 0.0012 * elbow;
    r += folds + bunch;
    // Rolled cuff: three thick rolls of fabric then tuck down to the skin.
    if (a > L1 + 0.055) {
      const u = (a - (L1 + 0.055)) / (a1 - (L1 + 0.055));
      const rolls = Math.abs(Math.sin(u * Math.PI * 3));
      r = 0.0445 + 0.0032 * rolls * (1 - u * 0.3) - 0.0085 * sstep(0.82, 1, u) + vnoise2(th * 3, u * 4) * 0.0012;
      ao = 0.55 + 0.45 * rolls;
      tint = 0.9 + 0.1 * rolls;
    }
    ao *= 1 - 0.25 * Math.max(0, -bunch / 0.0012) * elbow;
    const [x, y] = superellipse(th, r, r * 0.94, 2);
    s.x = SHOULDER_R.x + x;
    s.y = SHOULDER_R.y + y;
    s.z = SHOULDER_R.z - a;
    s.tint = tint;
    s.ao = ao;
    s.wear = 0;
  });
}

/** Bare forearm from under the rolled sleeve to the wrist (arm coordinates). */
function forearm(): Part {
  const a0 = L1 + 0.075;
  const a1 = L1 + L2 + 0.015;
  const n = 40;
  const segs = 32;
  const width: readonly (readonly [number, number])[] = [
    [a0, 0.04],
    [L1 + 0.12, 0.0405],
    [L1 + 0.2, 0.036],
    [L1 + L2 - 0.02, 0.0295],
    [a1, 0.0285],
  ];
  const height: readonly (readonly [number, number])[] = [
    [a0, 0.036],
    [L1 + 0.12, 0.0345],
    [L1 + 0.2, 0.028],
    [L1 + L2 - 0.02, 0.0215],
    [a1, 0.021],
  ];
  return grid(n, segs, (i, j, s) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const th = (j / segs) * Math.PI * 2;
    const w = lerpTable(width, a);
    const h = lerpTable(height, a);
    // Muscle bulge on the top-outer side near the elbow.
    const bulge = 1 + 0.06 * Math.exp(-(((a - (L1 + 0.11)) / 0.05) ** 2)) * Math.max(0, Math.cos(th - 0.6));
    const [x, y] = superellipse(th, w * bulge, h * bulge, 2.2);
    s.x = SHOULDER_R.x + x;
    s.y = SHOULDER_R.y + y;
    s.z = SHOULDER_R.z - a;
    s.tint = 1 + 0.06 * vnoise2(a * 40, th * 3);
    s.ao = 1;
  });
}

/** Glove cuff with velcro strap, in hand-bone space (wrist at the origin, forearm toward +Z). */
function gloveCuff(): Part {
  const z0 = 0.052;
  const z1 = -0.012;
  const n = 30;
  const segs = 36;
  return grid(n, segs, (i, j, s) => {
    const z = z0 + ((z1 - z0) * i) / (n - 1);
    const th = (j / segs) * Math.PI * 2;
    const flare = sstep(0.03, z0, z);
    let a = 0.0325 + 0.003 * flare;
    let b = 0.0245 + 0.0035 * flare;
    let tint = 1;
    let ao = 1;
    // Velcro strap band.
    const strap = sstep(0.008, 0.0105, z) * (1 - sstep(0.0315, 0.034, z));
    a += 0.0019 * strap;
    b += 0.0019 * strap;
    tint = 1 - strap;
    // Rolled lip at the open end.
    if (z > z0 - 0.004) {
      const u = (z - (z0 - 0.004)) / 0.004;
      a += 0.0012 * Math.sin(u * Math.PI);
      b += 0.0012 * Math.sin(u * Math.PI);
      ao = 0.8;
    }
    // Fabric creases.
    const crease = vnoise2(z * 160, th * 3) * 0.0006;
    const [x, y] = superellipse(th, a + crease, b + crease, 2.4);
    s.x = x;
    s.y = y;
    s.z = z;
    s.tint = tint;
    s.ao = ao * (1 - 0.3 * Math.max(0, -crease / 0.0006));
    s.wear = strap;
  });
}

/** Back of hand + palm, hand-bone space. */
function palm(): Part {
  const z0 = 0.014;
  const z1 = -0.105;
  const zr = -0.087; // start of the rounded front
  const n = 34;
  const segs = 40;
  const width: readonly (readonly [number, number])[] = [
    [-0.105, 0.044],
    [-0.085, 0.0445],
    [-0.06, 0.043],
    [-0.02, 0.0375],
    [0.014, 0.0335],
  ];
  const height: readonly (readonly [number, number])[] = [
    [-0.105, 0.0135],
    [-0.085, 0.0145],
    [-0.05, 0.0165],
    [0.014, 0.0165],
  ];
  return grid(n, segs, (i, j, s) => {
    const z = z0 + ((z1 - z0) * i) / (n - 1);
    const th = (j / segs) * Math.PI * 2;
    let a = lerpTable(width, z);
    let b = lerpTable(height, z);
    if (z < zr) {
      const u = Math.min(1, (zr - z) / (zr - z1));
      const k = Math.sqrt(Math.max(0, 1 - u * u));
      a *= 0.3 + 0.7 * k;
      b *= k;
    }
    let [x, y] = superellipse(th, a, b, 2.6);
    // Thenar bulge (palm side, thumb side, near the wrist).
    const thenar = Math.exp(-(((z + 0.03) / 0.03) ** 2)) * Math.max(0, -Math.sin(th)) * Math.max(0, -Math.cos(th));
    y -= 0.006 * thenar;
    x -= 0.003 * thenar;
    // Knuckle pad (back of hand), segmented.
    const top = Math.max(0, Math.sin(th));
    const padZ = sstep(-0.068, -0.074, z) * (1 - sstep(-0.094, -0.1, z));
    const padX = 1 - sstep(0.032, 0.04, Math.abs(x));
    const seg = 0.75 + 0.25 * Math.cos((x / 0.0195) * Math.PI * 2);
    const pad = padZ * padX * sstep(0.45, 0.8, top);
    y += 0.0026 * pad * seg;
    // Back-of-hand armour plate (raised, between wrist and knuckles).
    const plate = sstep(-0.012, -0.02, z) * (1 - sstep(-0.058, -0.064, z)) * sstep(0.55, 0.85, top) * (1 - sstep(0.026, 0.034, Math.abs(x)));
    y += 0.0014 * plate;
    const palmSide = sstep(0.1, -0.35, Math.sin(th));
    s.x = x;
    s.y = y;
    s.z = z;
    s.tint = Math.min(1 - palmSide * 0.85, 1 - pad * 0.95, 1 - plate * 0.9);
    s.ao = 1 - 0.25 * thenar;
    s.wear = Math.max(pad, plate) * 0.6;
  });
}

/** A finger (or thumb) as one tube along local -Z from its base joint, rounded tip. */
function fingerTube(len: readonly [number, number, number], r0: number, rTip: number, padSegments: number, thumb: boolean): Part {
  const total = len[0] + len[1] + len[2];
  const tStart = thumb ? -0.014 : -0.012;
  const n = 46;
  const segs = 22;
  return grid(n, segs, (i, j, s) => {
    const u = i / (n - 1);
    // Denser sampling near the tip for a round cap.
    const t = tStart + (total - tStart) * (1 - (1 - u) * (1 - u) * 0.15 - 0.85 * (1 - u));
    const th = (j / segs) * Math.PI * 2;
    const along = Math.max(0, t) / total;
    let r = r0 + (rTip - r0) * along;
    // Joint bulges.
    r *= 1 + 0.05 * Math.exp(-(((t - len[0]) / 0.006) ** 2)) + 0.035 * Math.exp(-(((t - len[0] - len[1]) / 0.005) ** 2));
    // Rounded tip.
    const capStart = total - rTip;
    if (t > capStart) {
      const k = (t - capStart) / rTip;
      r *= Math.sqrt(Math.max(0, 1 - Math.min(1, k) ** 2));
    }
    r = Math.max(r, 0.00005);
    const top = Math.sin(th);
    // Padding on the back of the segments.
    let pad = 0;
    for (let k = 0; k < padSegments; k++) {
      const a = k === 0 ? 0.004 : len[0] + 0.004;
      const b = k === 0 ? len[0] - 0.005 : len[0] + len[1] - 0.004;
      pad = Math.max(pad, sstep(a, a + 0.003, t) * (1 - sstep(b - 0.003, b, t)));
    }
    pad *= sstep(0.35, 0.75, top);
    const rr = r + 0.0015 * pad;
    const [x, y] = superellipse(th, rr, rr * 0.88, 2.2);
    // Seam lines along the sides.
    const seam = Math.exp(-((Math.cos(th) * Math.cos(th) > 0.995 ? 0 : 1) * 9));
    const palmSide = sstep(0.2, -0.3, top);
    const tipReinforce = sstep(capStart - 0.01, capStart - 0.004, t);
    s.x = x;
    s.y = y;
    s.z = -t;
    s.tint = Math.min(1 - palmSide * 0.85, 1 - pad * 0.95, 1 - tipReinforce * 0.8, 1 - seam * 0.5);
    s.wear = pad * 0.5 + tipReinforce * 0.3;
    s.ao = 1 - 0.3 * Math.exp(-(((t - len[0]) / 0.004) ** 2)) * palmSide;
  });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function gloveMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const s = surfNode();
  const p = positionGeometry;
  const weave = sin(p.x.mul(2300).add(p.z.mul(900))).mul(sin(p.y.mul(2300).sub(p.z.mul(1100))));
  const grain = mx_noise_float(p.mul(420));
  const blot = mx_fractal_noise_float(p.mul(35), 3, 2, 0.5);
  const coyote = vec3(0.21, 0.16, 0.108).mul(blot.mul(0.1).add(1));
  const black = vec3(0.03, 0.029, 0.028).mul(grain.mul(0.15).add(1));
  const scuff = smoothstep(0.35, 0.8, s.y.add(grain.mul(0.25)));
  m.colorNode = mix(black, coyote, s.x).mul(scuff.mul(0.35).add(1)).mul(weave.mul(0.05).add(1));
  m.roughnessNode = mix(float(0.62), float(0.9), s.x).add(grain.mul(0.04)).sub(scuff.mul(0.08));
  m.metalnessNode = float(0);
  m.aoNode = s.z;
  m.normalNode = bumpNormal(weave.mul(0.000012).mul(s.x).add(grain.mul(0.00002)));
  return m;
}

function sleeveMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const s = surfNode();
  const p = positionGeometry;
  const grain = mx_noise_float(p.mul(380));
  const blot = mx_fractal_noise_float(p.mul(25), 3, 2, 0.5);
  // Ripstop grid.
  const gx = smoothstep(0.93, 1.0, abs(sin(p.x.mul(560).add(p.y.mul(160)))));
  const gz = smoothstep(0.93, 1.0, abs(sin(p.z.mul(560))));
  const grid2 = gx.max(gz);
  const base = vec3(0.105, 0.112, 0.082).mul(blot.mul(0.14).add(1)).mul(grain.mul(0.05).add(1));
  m.colorNode = base.mul(s.x).mul(grid2.mul(0.08).add(1));
  m.roughnessNode = float(0.92).add(grain.mul(0.04));
  m.metalnessNode = float(0);
  m.aoNode = s.z;
  m.normalNode = bumpNormal(grid2.mul(0.00003).add(grain.mul(0.000015)));
  return m;
}

function skinMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const s = surfNode();
  const p = positionGeometry;
  const pores = mx_noise_float(p.mul(900));
  const blot = mx_fractal_noise_float(p.mul(30), 3, 2, 0.5);
  const base = vec3(0.56, 0.38, 0.29).mul(blot.mul(0.08).add(1));
  m.colorNode = base.mul(s.x);
  m.roughnessNode = float(0.55).add(pores.mul(0.06)).add(blot.mul(0.05));
  m.metalnessNode = float(0);
  m.aoNode = s.z;
  m.normalNode = bumpNormal(pores.mul(0.000006).add(blot.mul(0.00004)));
  return m;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface ArmRig {
  upper: Bone;
  fore: Bone;
  hand: Bone;
  fingers: Bone[][]; // 4 fingers + thumb, 3 bones each
  restFinger: Quaternion[]; // rest rotation of each chain's first bone
  shoulder: Vector3;
  pole: Vector3;
  sign: 1 | -1;
}

const MIRROR = new Matrix4().makeScale(-1, 1, 1);

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
  const upper = new Bone();
  upper.name = sign > 0 ? 'R_upper' : 'L_upper';
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
  return {
    upper,
    fore,
    hand,
    fingers,
    restFinger,
    shoulder,
    pole: new Vector3(POLE_R.x * sign, POLE_R.y, POLE_R.z),
    sign,
  };
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

  const geoBuilder = new GeoBuilder();
  const materials = [gloveMaterial(), sleeveMaterial(), skinMaterial()];

  // Rest-pose world matrices of the bones (mesh at identity).
  const holder = new Group();
  holder.add(right.upper, left.upper);
  holder.updateMatrixWorld(true);

  const sleevePart = sleeve();
  const forearmPart = forearm();
  const cuffPart = gloveCuff();
  const palmPart = palm();
  const fingerParts = FINGERS.map((f) => fingerTube(f.len, f.r, f.r * 0.86, 2, false));
  const thumbPart = fingerTube(THUMB_LEN, THUMB_R[0], THUMB_R[2], 1, true);
  // Thumb metacarpal is mostly inside the palm: keep the visible part narrower.
  const thumbPadded = appendPart(new Part(), thumbPart);

  const armA = (p: Vector3): SkinRef => armWeight(SHOULDER_R.z - p.z);
  const handA = (p: Vector3): SkinRef => armWeight(L1 + L2 - p.z);

  const addGloves = (rig: ArmRig, offset: number): void => {
    const mirror = rig.sign > 0 ? undefined : MIRROR;
    const place = (b: Bone): Matrix4 => (mirror ? b.matrixWorld.clone().multiply(mirror) : b.matrixWorld.clone());
    geoBuilder.add(cuffPart, place(rig.hand), handA, offset);
    geoBuilder.add(palmPart, place(rig.hand), handA, offset);
    FINGERS.forEach((f, k) => {
      const first = B_FINGER0 + k * 3;
      geoBuilder.add(fingerParts[k]!, place(rig.fingers[k]![0]!), (p) => chainWeight(-p.z, f.len, first, B_HAND, 0.006), offset);
    });
    geoBuilder.add(thumbPadded, place(rig.fingers[4]![0]!), (p) => chainWeight(-p.z, THUMB_LEN, B_THUMB, B_HAND, 0.012), offset);
  };
  const addArm = (rig: ArmRig, offset: number, part: Part): void => {
    geoBuilder.add(part, rig.sign > 0 ? undefined : MIRROR, armA, offset);
  };

  geoBuilder.group(0);
  addGloves(right, 0);
  addGloves(left, BONES_PER_ARM);
  geoBuilder.group(1);
  addArm(right, 0, sleevePart);
  addArm(left, BONES_PER_ARM, sleevePart);
  geoBuilder.group(2);
  addArm(right, 0, forearmPart);
  addArm(left, BONES_PER_ARM, forearmPart);

  const geometry: BufferGeometry = geoBuilder.build();
  const mesh = new SkinnedMesh(geometry, materials);
  mesh.name = 'armsMesh';
  mesh.frustumCulled = false;
  mesh.add(right.upper, left.upper);
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  mesh.bind(skeleton);

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
    // Forearm: twist follows the back of the hand.
    zA.copy(dirF).negate();
    yF.set(0, 1, 0).applyQuaternion(Qh);
    yF.addScaledVector(dirF, -yF.dot(dirF));
    if (yF.lengthSq() < 1e-8) yF.copy(yU);
    yF.normalize();
    xA.crossVectors(yF, zA).normalize();
    qF.setFromRotationMatrix(bm.makeBasis(xA, yF, zA));
    rig.upper.position.copy(S);
    rig.upper.quaternion.copy(qU);
    rig.fore.quaternion.copy(qTmp.copy(qU).invert().multiply(qF));
    rig.hand.quaternion.copy(qTmp.copy(qF).invert().multiply(Qh));
  };

  const curl = (rig: ArmRig, g: number, table: readonly (readonly [number, number, number])[]): void => {
    const k = Math.max(0, Math.min(1, g));
    rig.fingers.forEach((chain, ci) => {
      const full = table[ci]!;
      chain.forEach((b, j) => {
        const angle = GRIP_OPEN[j]! + (full[j]! - GRIP_OPEN[j]!) * k;
        const bend = qAxis(new Vector3(1, 0, 0), -angle);
        if (j === 0) b.quaternion.copy(rig.restFinger[ci]!).multiply(bend);
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
      mesh.updateWorldMatrix(true, false);
      meshInv.copy(mesh.matrixWorld).invert();
      solveArm(right, rightTarget);
      solveArm(left, leftTarget);
      mesh.updateMatrixWorld(true);
    },
    setGrip(r: number, l: number): void {
      curl(right, r, GRIP_RIGHT);
      curl(left, l, GRIP_LEFT);
    },
    dispose(): void {
      geometry.dispose();
      for (const m of materials) m.dispose();
      skeleton.dispose();
    },
  };
}
