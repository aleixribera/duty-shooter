/**
 * Procedural stock M4A1 carbine (flat-top, BUIS rear, A2 front sight post,
 * 14.5" barrel with M4 cut, A2 birdcage, M4 handguards, 6-position stock,
 * A2 grip, 30-round GI magazine). No external assets.
 *
 * Gun space: metres, bore axis along Z (muzzle toward -Z), +Y up, +X right.
 * Origin: on the bore axis at the rear face of the upper receiver.
 */
import { Group, Mesh, MeshStandardNodeMaterial, Object3D, Quaternion, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material } from 'three/webgpu';
import { float, mix, mx_fractal_noise_float, mx_noise_float, positionGeometry, smoothstep, vec3 } from 'three/tsl';
import {
  GeoBuilder,
  NX,
  NZ,
  Part,
  X,
  Y,
  Z,
  aim,
  arc,
  basis,
  bevelStations,
  bumpNormal,
  capFace,
  circleRing,
  loft,
  mat,
  merge,
  polyRound,
  qAxis,
  radial,
  rectRing,
  surfNode,
  tube,
} from './meshkit';
import type { Corner, GridSample, RP, Ring, Station } from './meshkit';

export interface M4A1Model {
  readonly root: Group;
  readonly magazine: Object3D;
  readonly chargingHandle: Object3D;
  readonly bolt: Object3D;
  readonly boltCatch: Object3D;
  readonly sockets: {
    readonly muzzle: Object3D;
    readonly ejectionPort: Object3D;
    readonly rightGrip: Object3D;
    readonly leftHandguard: Object3D;
    readonly magWell: Object3D;
    readonly rearSight: Object3D;
    readonly frontSight: Object3D;
  };
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Key dimensions (gun space)
// ---------------------------------------------------------------------------

/** Upper receiver half width. */
const UW = 0.0145;
/** Lower receiver half width. */
const LW = 0.014;
const UPPER_TOP = 0.0215;
const UPPER_BOTTOM = -0.013;
const BORE_R = 0.0125;
const PORT_Y0 = -0.0075;
const PORT_Y1 = 0.0085;
const PORT_Z0 = -0.121;
const PORT_Z1 = -0.057;
const SIGHT_Y = 0.066;
const REAR_SIGHT_Z = -0.022;
const FRONT_SIGHT_Z = -0.3555;
const MUZZLE_Z = -0.576;
const MAG_ORIGIN = new Vector3(0, -0.0235, -0.134);
const BOLT_CATCH_PIVOT = new Vector3(-0.015, -0.0175, -0.104);

/** Palm placements (see palmFrame): position, palm-facing direction, wrist direction. */
const RIGHT_PALM = {
  pos: new Vector3(0.0152, -0.074, 0.004),
  normal: new Vector3(-1, 0, 0),
  wrist: new Vector3(0.15, -0.25, 0.95),
};
// Left palm: knuckles under the handguard, palm facing up and cupping its lower
// left, fingers up the right side, thumb along the left; forearm in from the left.
const LEFT_PALM = {
  pos: new Vector3(-0.0369, -0.0285, -0.2642),
  normal: new Vector3(0, 1, 0),
  wrist: new Vector3(-0.819, 0, 0.574),
};

/** Charging handle rearward travel when fully pulled (m). */
export const M4A1_CHARGING_HANDLE_TRAVEL = 0.072;
/** Bolt carrier rearward travel at full recoil stroke (m). */
export const M4A1_BOLT_TRAVEL = 0.08;

interface Q {
  readonly hi: boolean;
  readonly seg: number;
  readonly fil: number;
  readonly bs: number;
}
const HI: Q = { hi: true, seg: 40, fil: 15, bs: 3 };
const LO: Q = { hi: false, seg: 12, fil: 50, bs: 1 };

// Loft orientations: contour coordinates -> gun axes.
/** Side profile: contour (-z, y), extruded along gun X. */
const SIDE = basis(NZ, Y, X);
/** Top profile: contour (x, -z), extruded along gun Y. */
const TOP = basis(X, NZ, Y);

function sideRing(c: readonly Corner[], q: Q, tint = 1): Ring {
  return polyRound(
    c.map(([z, y, r]) => [-z, y, r] as Corner),
    q.fil,
    tint,
  );
}

interface LoftOpts {
  readonly x?: number;
  readonly segs?: number;
  readonly holes?: readonly (readonly Corner[])[];
  readonly holeTint?: number;
  readonly tint?: number;
  readonly ao?: number;
}

/** Side-profile prism: corners are (z, y, radius) in gun space; spans x ± halfW. */
function sideLoft(c: readonly Corner[], halfW: number, bevel: number, q: Q, o: LoftOpts = {}): Part {
  const ring = sideRing(c, q, o.tint ?? 1);
  const holes = (o.holes ?? []).map((h) => sideRing(h, q, o.holeTint ?? 0.4));
  const x = o.x ?? 0;
  return loft(ring, holes, bevelStations(x - halfW, x + halfW, bevel, o.segs ?? q.bs), { ao: o.ao ?? 1 }).transform(SIDE);
}

/** Top-profile prism: corners are (x, z, radius); spans y0..y1. */
function topLoft(c: readonly Corner[], y0: number, y1: number, bevel: number, q: Q, o: LoftOpts = {}): Part {
  const ring = polyRound(
    c.map(([x, z, r]) => [x, -z, r] as Corner),
    q.fil,
    o.tint ?? 1,
  );
  const holes = (o.holes ?? []).map((h) =>
    polyRound(
      h.map(([x, z, r]) => [x, -z, r] as Corner),
      q.fil,
      o.holeTint ?? 0.4,
    ),
  );
  return loft(ring, holes, bevelStations(y0, y1, bevel, o.segs ?? q.bs), { ao: o.ao ?? 1 }).transform(TOP);
}

/** Front-profile prism: ring in (x, y), spans z0..z1 along gun Z. */
function frontLoft(ring: Ring, holes: readonly Ring[], z0: number, z1: number, bevel: number, q: Q, segs?: number): Part {
  return loft(ring, holes, bevelStations(z0, z1, bevel, segs ?? q.bs));
}

/** Small round head/disc along an axis (local -Z of the profile points along `dir`). */
function disc(at: Vector3, dir: Vector3, r: number, h: number, q: Q): Part {
  const prof: RP[] = [
    { z: h * 0.4, r },
    { z: -h * 0.6, r },
    { z: -h * 0.9, r: r * 0.82, wear: 1 },
    { z: -h, r: r * 0.55 },
    { z: -h, r: 0.0001 },
  ];
  return radial(prof, Math.max(10, Math.round(q.seg * 0.5))).transform(mat(at.x, at.y, at.z, aim(dir)));
}

function angDist(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function sstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Upper receiver group
// ---------------------------------------------------------------------------

function upperReceiver(q: Q): Part {
  const outer: Corner[] = [
    [UW, UPPER_BOTTOM, 0.0025],
    [UW, UPPER_TOP, 0.002],
    [-UW, UPPER_TOP, 0.002],
    [-UW, UPPER_BOTTOM, 0.0025],
  ];
  if (!q.hi) {
    return frontLoft(polyRound(outer, q.fil), [], -0.18, 0, 0.001, q);
  }
  const outerRing = polyRound(outer, q.fil);
  const bore = circleRing(0, 0, BORE_R, 40, 0.6);
  const xb = Math.sqrt(BORE_R * BORE_R - PORT_Y0 * PORT_Y0);
  const xt = Math.sqrt(BORE_R * BORE_R - PORT_Y1 * PORT_Y1);
  const a0 = Math.atan2(PORT_Y0, xb); // ~ -37 deg
  const a1 = Math.atan2(PORT_Y1, xt) - Math.PI * 2; // ~ -317 deg (clockwise)
  // C-shaped section through the ejection port (right wall open).
  const cRing = polyRound(
    [
      [UW, PORT_Y1, 0.0007],
      [UW, UPPER_TOP, 0.002],
      [-UW, UPPER_TOP, 0.002],
      [-UW, UPPER_BOTTOM, 0.0025],
      [UW, UPPER_BOTTOM, 0.0025],
      [UW, PORT_Y0, 0.0007],
      [xb, PORT_Y0, 0],
      ...arc(0, 0, BORE_R, a0, a1, 30).slice(1, -1),
      [xt, PORT_Y1, 0],
    ],
    q.fil,
  );
  const front = loft(outerRing, [bore], bevelStations(-0.18, PORT_Z0, 0.0008, 3, false, true), { capEnd: false });
  const mid = loft(cRing, [], [
    { z: PORT_Z0, inset: 0, phi: 0, wear: 0 },
    { z: PORT_Z1, inset: 0, phi: 0, wear: 0 },
  ], { capStart: false, capEnd: false });
  const rear = loft(outerRing, [bore], bevelStations(PORT_Z1, 0, 0.0008, 3, true, false), { capStart: false });
  // Port end walls (the region of the right wall removed by the port).
  const wallPts: Corner[] = [
    [xb, PORT_Y0, 0],
    [UW, PORT_Y0, 0],
    [UW, PORT_Y1, 0],
    [xt, PORT_Y1, 0],
    ...arc(0, 0, BORE_R, Math.atan2(PORT_Y1, xt), a0, 12).slice(1, -1),
  ];
  const wallRing = polyRound(wallPts, q.fil);
  wallRing.w.forEach((_, i) => {
    wallRing.w[i] = (wallRing.p[i]![0] > UW - 1e-5 ? 1 : 0) as number;
  });
  const wallF = capFace(wallRing, [], PORT_Z0, 1);
  const wallR = capFace(wallRing, [], PORT_Z1, -1);
  return merge(front, mid, rear, wallF, wallR);
}

function picatinny(q: Q, z0: number, z1: number, teeth: number[]): Part {
  const tooth: Corner[] = [
    [-0.008, 0.021, 0],
    [0.008, 0.021, 0],
    [0.0106, 0.0236, 0.0004],
    [0.0106, 0.0252, 0.0004],
    [0.0082, 0.0276, 0.0004],
    [0.008, 0.03, 0.0005],
    [-0.008, 0.03, 0.0005],
    [-0.0082, 0.0276, 0.0004],
    [-0.0106, 0.0252, 0.0004],
    [-0.0106, 0.0236, 0.0004],
  ];
  if (!q.hi) {
    return frontLoft(polyRound(tooth, q.fil), [], z0, z1, 0.0005, q);
  }
  const base: Corner[] = [
    [-0.008, 0.021, 0],
    [0.008, 0.021, 0],
    [0.0106, 0.0236, 0.0004],
    [0.0106, 0.0252, 0.0004],
    [0.0096, 0.0262, 0.0003],
    [-0.0096, 0.0262, 0.0003],
    [-0.0106, 0.0252, 0.0004],
    [-0.0106, 0.0236, 0.0004],
  ];
  const parts: Part[] = [frontLoft(polyRound(base, q.fil), [], z0, z1, 0.0005, q)];
  const toothRing = polyRound(tooth, q.fil);
  for (const zc of teeth) parts.push(frontLoft(toothRing, [], zc - 0.0025, zc + 0.0025, 0.0004, q, 2));
  return merge(...parts);
}

function forwardAssist(q: Q): { housing: Part; button: Part } {
  const p1 = new Vector3(0.0148, 0.0102, -0.009); // rear end centre
  const p0 = new Vector3(0.0102, 0.0096, -0.06); // front (buried in the receiver)
  const dir = p0.clone().sub(p1).normalize();
  const m = mat(p1.x, p1.y, p1.z, aim(dir));
  const housing = radial(
    [
      { z: 0, r: 0.003, hard: true },
      { z: 0, r: 0.0058 },
      { z: -0.0005, r: 0.0064, wear: 1 },
      { z: -0.0013, r: 0.0066 },
      { z: -0.03, r: 0.0066 },
      { z: -0.043, r: 0.0052 },
      { z: -0.051, r: 0.0022 },
    ],
    q.seg,
  ).transform(m);
  const ribs = (th: number, z: number, s: GridSample): void => {
    if (z < 0.0075 && z > 0.0015) s.x += 0.00028 * (Math.cos(th * 18) > 0 ? 1 : 0);
  };
  const button = radial(
    [
      { z: 0.0087, r: 0.0001 },
      { z: 0.0087, r: 0.0038 },
      { z: 0.0084, r: 0.0049, wear: 1 },
      { z: 0.0078, r: 0.0053 },
      { z: 0.0075, r: 0.0053 },
      { z: 0.0015, r: 0.0053 },
      { z: 0.0012, r: 0.0046, hard: true },
      { z: -0.002, r: 0.0046 },
    ],
    q.hi ? q.seg + 20 : q.seg,
    q.hi ? ribs : undefined,
  ).transform(m);
  return { housing, button };
}

// ---------------------------------------------------------------------------
// Barrel group
// ---------------------------------------------------------------------------

function barrel(q: Q): Part {
  const p: RP[] = [
    { z: -0.179, r: 0.009 },
    { z: -0.34, r: 0.009, hard: true },
    { z: -0.34, r: 0.0095, hard: true },
    { z: -0.395, r: 0.0095 },
    { z: -0.396, r: 0.0095, wear: 1, hard: true },
    { z: -0.3972, r: 0.0081, wear: 1, hard: true },
    { z: -0.3985, r: 0.0081 },
    { z: -0.4098, r: 0.0081 },
    { z: -0.411, r: 0.0081, wear: 1, hard: true },
    { z: -0.4122, r: 0.009, wear: 1, hard: true },
    { z: -0.4132, r: 0.009 },
    { z: -0.5235, r: 0.0087 },
    { z: -0.524, r: 0.0087, wear: 1, hard: true },
    { z: -0.5246, r: 0.008, hard: true },
    { z: -0.53, r: 0.008 },
  ];
  return radial(p, q.hi ? 36 : 10);
}

function flashHider(q: Q): Part {
  if (!q.hi) {
    return radial(
      [
        { z: -0.529, r: 0.008, hard: true },
        { z: -0.529, r: 0.011, hard: true },
        { z: -0.576, r: 0.011, hard: true },
        { z: -0.576, r: 0.0065 },
      ],
      q.seg,
    );
  }
  const p: RP[] = [
    { z: -0.529, r: 0.0082, hard: true },
    { z: -0.529, r: 0.0103 },
    { z: -0.5296, r: 0.0109, wear: 1 },
    { z: -0.5304, r: 0.0111 },
  ];
  for (let z = -0.531; z > -0.5745; z -= 0.0005) p.push({ z, r: 0.0111 });
  p.push(
    { z: -0.5748, r: 0.0111 },
    { z: -0.5755, r: 0.0108, wear: 1 },
    { z: -0.576, r: 0.0102 },
    { z: -0.576, r: 0.0067, wear: 1, hard: true },
    { z: -0.5755, r: 0.0063, tint: 0.5 },
    { z: -0.572, r: 0.0062, tint: 0.2, ao: 0.4 },
    { z: -0.56, r: 0.0062, tint: 0.08, ao: 0.15 },
  );
  const slotAngles = [30, 90, 150, 210, 330].map((d) => (d * Math.PI) / 180);
  const zA = -0.5425;
  const zB = -0.5705;
  const hw = 0.00135;
  const mod = (th: number, z: number, s: GridSample): void => {
    const r = s.x;
    // Wrench flats on the sides at the rear.
    if (z < -0.5308 && z > -0.5385) {
      const c = Math.abs(Math.cos(th));
      if (c > 1e-3) s.x = Math.min(s.x, 0.0099 / c);
    }
    if (r < 0.0105 || z > zA + 0.001 || z < zB - 0.001) return;
    for (const a of slotAngles) {
      const arcD = angDist(th, a) * 0.0111;
      const zc = Math.min(zA - hw, Math.max(zB + hw, z));
      const d = Math.hypot(arcD, z - zc) - hw;
      if (d < 0) {
        s.x = 0.0062;
        s.tint = 0.12;
        s.ao = 0.25;
      } else if (d < 0.0004) {
        s.wear = 1;
      }
    }
  };
  return radial(p, 120, mod);
}

function frontSightBase(q: Q): Part {
  const parts: Part[] = [];
  // Base ring around the gas journal.
  parts.push(
    radial(
      [
        { z: -0.3405, r: 0.0096 },
        { z: -0.3405, r: 0.0134 },
        { z: -0.3412, r: 0.0141, wear: 1 },
        { z: -0.342, r: 0.0143 },
        { z: -0.3745, r: 0.0143 },
        { z: -0.3753, r: 0.0141, wear: 1 },
        { z: -0.376, r: 0.0134 },
        { z: -0.376, r: 0.0096 },
      ],
      q.seg,
    ),
  );
  // Triangular tower.
  parts.push(
    sideLoft(
      [
        [-0.3415, 0.009, 0],
        [-0.349, 0.0425, 0.004],
        [-0.3625, 0.0425, 0.004],
        [-0.372, 0.009, 0],
      ],
      0.006,
      0.001,
      q,
    ),
  );
  // Protective ears around the post.
  parts.push(
    frontLoft(
      polyRound(
        [
          [-0.0105, 0.0385, 0.003],
          [0.0105, 0.0385, 0.003],
          [0.0105, 0.0675, 0.0022],
          [0.0068, 0.0675, 0.001],
          [0.0068, 0.0488, 0.0022],
          [-0.0068, 0.0488, 0.0022],
          [-0.0068, 0.0675, 0.001],
          [-0.0105, 0.0675, 0.0022],
        ],
        q.fil,
      ),
      [],
      -0.361,
      -0.35,
      0.0007,
      q,
    ),
  );
  // Front sight post (square, tip at SIGHT_Y) and its detent base.
  const hp = 0.0009;
  parts.push(
    topLoft(
      [
        [-hp, FRONT_SIGHT_Z - hp, 0.0002],
        [hp, FRONT_SIGHT_Z - hp, 0.0002],
        [hp, FRONT_SIGHT_Z + hp, 0.0002],
        [-hp, FRONT_SIGHT_Z + hp, 0.0002],
      ],
      0.048,
      SIGHT_Y,
      0.0002,
      q,
      { segs: 1 },
    ),
  );
  if (q.hi) {
    const notch = (th: number, z: number, s: GridSample): void => {
      const m4 = th % (Math.PI / 2);
      if (z < 0.0005 && z > -0.0031 && Math.min(m4, Math.PI / 2 - m4) < 0.25) s.x -= 0.0006;
    };
    parts.push(
      radial(
        [
          { z: 0.001, r: 0.0034 },
          { z: -0.003, r: 0.0034 },
          { z: -0.0034, r: 0.0027, wear: 1 },
          { z: -0.0035, r: 0.0001 },
        ],
        32,
        notch,
      ).transform(mat(0, 0.047, FRONT_SIGHT_Z, aim(Y))),
    );
    // Bayonet lug, sling lug, swivel and taper pins.
    parts.push(
      sideLoft(
        [
          [-0.369, -0.012, 0],
          [-0.3755, -0.012, 0],
          [-0.3755, -0.0255, 0.0012],
          [-0.3705, -0.0255, 0.0012],
        ],
        0.0032,
        0.0006,
        q,
      ),
    );
    parts.push(
      sideLoft(
        [
          [-0.344, -0.01, 0],
          [-0.356, -0.01, 0],
          [-0.3545, -0.021, 0.003],
          [-0.3455, -0.021, 0.003],
        ],
        0.0035,
        0.0007,
        q,
      ),
    );
    const loop: Vector3[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      loop.push(new Vector3(0, -0.0245 + Math.sin(a) * 0.0068, -0.35 + Math.cos(a) * 0.0105));
    }
    parts.push(tube(loop, 0.0012, 10, true));
    parts.push(disc(new Vector3(0.0036, -0.0175, -0.35), X, 0.0019, 0.0006, q));
    parts.push(disc(new Vector3(-0.0036, -0.0175, -0.35), NX, 0.0019, 0.0006, q));
    for (const z of [-0.346, -0.37]) {
      parts.push(disc(new Vector3(0.0141, -0.006, z), X, 0.0015, 0.0005, q));
      parts.push(disc(new Vector3(-0.0141, -0.006, z), NX, 0.0015, 0.0005, q));
    }
  }
  return merge(...parts);
}

function deltaRing(q: Q): Part {
  return radial(
    [
      { z: -0.18, r: 0.016 },
      { z: -0.18, r: 0.0215 },
      { z: -0.1808, r: 0.0228, wear: 1 },
      { z: -0.183, r: 0.024 },
      { z: -0.1925, r: 0.0262 },
      { z: -0.195, r: 0.027 },
      { z: -0.1982, r: 0.027 },
      { z: -0.1996, r: 0.0261, wear: 1 },
      { z: -0.1998, r: 0.0245 },
      { z: -0.199, r: 0.0234, tint: 0.6 },
      { z: -0.196, r: 0.0232, tint: 0.4, ao: 0.5 },
    ],
    q.hi ? 56 : q.seg,
  );
}

function handguardCap(q: Q): Part {
  return radial(
    [
      { z: -0.334, r: 0.0222, tint: 0.5, ao: 0.5 },
      { z: -0.3355, r: 0.0228 },
      { z: -0.3362, r: 0.0236, wear: 1 },
      { z: -0.3378, r: 0.0239 },
      { z: -0.3392, r: 0.0232, wear: 1 },
      { z: -0.34, r: 0.0205 },
      { z: -0.3403, r: 0.015 },
      { z: -0.3405, r: 0.0096 },
    ],
    q.hi ? 56 : q.seg,
  );
}

function handguard(q: Q): Part {
  const prof: RP[] = [
    { z: -0.194, r: 0.0222 },
    { z: -0.199, r: 0.0226 },
    { z: -0.203, r: 0.0236 },
    { z: -0.206, r: 0.0238 },
    { z: -0.33, r: 0.0236 },
    { z: -0.333, r: 0.0232 },
    { z: -0.3365, r: 0.0224 },
    { z: -0.338, r: 0.0222 },
  ];
  if (!q.hi) return radial(prof, 14);
  const holesZ = [-0.2185, -0.2405, -0.2625, -0.2845, -0.3065];
  const holeTh = [Math.PI / 2, (3 * Math.PI) / 2];
  const ribs = 30;
  const mod = (th: number, z: number, s: GridSample): void => {
    const r0 = s.x;
    const u = -z;
    const zoneMask = sstep(0.2075, 0.2105, u) * (1 - sstep(0.3265, 0.3295, u));
    const seamD = Math.min(angDist(th, 0), angDist(th, Math.PI));
    const seamMask = sstep(0.07, 0.12, seamD);
    // Vent holes (oval) through to the heat shield.
    let holeD = 9;
    for (const hz of holesZ) {
      for (const ht of holeTh) {
        const dz = (z - hz) / 0.0058;
        const ds = (angDist(th, ht) * r0) / 0.0032;
        holeD = Math.min(holeD, dz * dz + ds * ds);
      }
    }
    const frame = sstep(1.3, 2.2, holeD);
    const ph = (th * ribs) / (Math.PI * 2);
    const f = ph - Math.floor(ph);
    const rib = sstep(0.1, 0.24, f) * (1 - sstep(0.56, 0.7, f));
    s.x = r0 + 0.0007 * rib * zoneMask * seamMask * frame;
    if (seamD < 0.03) s.x -= 0.00055 * (1 - sstep(0.012, 0.03, seamD));
    if (holeD < 1) {
      const t = sstep(1, 0.6, holeD);
      s.x = r0 + (0.0193 - r0) * t;
      s.tint = 1 - 0.7 * t;
      s.ao = 1 - 0.6 * t;
    } else if (holeD < 1.5) {
      s.wear = 1;
    }
  };
  return radial(prof, 150, mod, 0.0012);
}

// ---------------------------------------------------------------------------
// Lower receiver group
// ---------------------------------------------------------------------------

function lowerReceiver(q: Q): Part {
  const parts: Part[] = [];
  parts.push(
    sideLoft(
      [
        [-0.1805, -0.013, 0.0008],
        [0, -0.013, 0],
        [0, 0.0135, 0.0015],
        [0.0115, 0.0135, 0.003],
        [0.0115, -0.017, 0.004],
        [0.004, -0.029, 0.006],
        [-0.006, -0.0315, 0.003],
        [-0.048, -0.0315, 0.001],
        [-0.0985, -0.0315, 0],
        [-0.0985, -0.024, 0],
        [-0.169, -0.024, 0],
        [-0.17, -0.03, 0.0015],
        [-0.1805, -0.028, 0.0035],
      ],
      LW,
      0.0012,
      q,
    ),
  );
  // Magazine well (vertical prism with the mag passage).
  const wellOuter = polyRound(
    [
      [-0.0145, 0.0975, 0.003],
      [0.0145, 0.0975, 0.003],
      [0.0145, 0.1705, 0.003],
      [-0.0145, 0.1705, 0.003],
    ],
    q.fil,
  );
  const wellHole = polyRound(
    [
      [-0.0128, 0.1, 0.0015],
      [0.0128, 0.1, 0.0015],
      [0.0128, 0.1675, 0.0015],
      [-0.0128, 0.1675, 0.0015],
    ],
    q.fil,
    0.3,
  );
  const wellSt: Station[] = q.hi
    ? [
        { z: -0.079, inset: -0.0004, phi: -Math.PI / 2, wear: 0 },
        { z: -0.0788, inset: -0.001, phi: -Math.PI / 4, wear: 1 },
        { z: -0.078, inset: -0.0012, phi: 0, wear: 1 },
        { z: -0.074, inset: -0.0006, phi: -0.15, wear: 0 },
        { z: -0.068, inset: 0, phi: 0, wear: 0 },
        { z: -0.025, inset: 0, phi: 0, wear: 0 },
      ]
    : [
        { z: -0.079, inset: 0, phi: -Math.PI / 4, wear: 0 },
        { z: -0.025, inset: 0, phi: 0, wear: 0 },
      ];
  parts.push(loft(wellOuter, [wellHole], wellSt, { capEnd: false }).transform(TOP));
  // Trigger guard.
  parts.push(
    sideLoft(
      [
        [-0.047, -0.03, 0],
        [-0.047, -0.048, 0.004],
        [-0.056, -0.0512, 0.006],
        [-0.095, -0.0512, 0.005],
        [-0.1, -0.047, 0.003],
        [-0.1, -0.038, 0.0015],
        [-0.096, -0.038, 0.001],
        [-0.096, -0.0462, 0.0015],
        [-0.094, -0.0478, 0.002],
        [-0.058, -0.0478, 0.004],
        [-0.0515, -0.046, 0.003],
        [-0.0515, -0.03, 0],
      ],
      0.005,
      0.001,
      q,
    ),
  );
  if (q.hi) {
    // Magazine release fence (raised C around the button, right side).
    const c = { z: -0.093, y: -0.035 };
    const fence: Corner[] = [];
    const n = 12;
    const f0 = (70 * Math.PI) / 180;
    const f1 = (250 * Math.PI) / 180;
    for (let i = 0; i <= n; i++) {
      const a = f0 + ((f1 - f0) * i) / n;
      fence.push([c.z + Math.cos(a) * 0.0086, c.y + Math.sin(a) * 0.0086, i === 0 || i === n ? 0.0008 : -1]);
    }
    for (let i = n; i >= 0; i--) {
      const a = f0 + ((f1 - f0) * i) / n;
      fence.push([c.z + Math.cos(a) * 0.0061, c.y + Math.sin(a) * 0.0061, i === 0 || i === n ? 0.0008 : -1]);
    }
    // In (z, y) the angle convention is z = cos, y = sin, so "front" is pi.
    parts.push(sideLoft(fence, 0.0012, 0.0005, q, { x: LW + 0.0006 }));
  }
  return merge(...parts);
}

function pistolGrip(q: Q): Part {
  return sideLoft(
    [
      [-0.05, -0.03, 0.001],
      [-0.047, -0.046, 0.008],
      [-0.041, -0.057, 0.008],
      [-0.044, -0.066, 0.006],
      [-0.037, -0.076, 0.008],
      [-0.019, -0.106, 0.006],
      [-0.016, -0.116, 0.004],
      [0.023, -0.111, 0.006],
      [0.016, -0.085, 0.025],
      [0.003, -0.047, 0.012],
      [0.0, -0.032, 0.003],
      [-0.01, -0.03, 0],
    ],
    0.014,
    0.0055,
    q,
    { segs: q.hi ? 4 : 1 },
  );
}

function stock(q: Q): Part {
  const parts: Part[] = [];
  parts.push(
    sideLoft(
      [
        [0.105, 0.0195, 0.003],
        [0.15, 0.0205, 0.02],
        [0.25, 0.0225, 0.008],
        [0.256, 0.017, 0.003],
        [0.256, -0.088, 0.004],
        [0.242, -0.096, 0.008],
        [0.205, -0.08, 0.03],
        [0.15, -0.042, 0.03],
        [0.12, -0.0225, 0.006],
        [0.105, -0.0215, 0.003],
      ],
      0.018,
      0.003,
      q,
      {
        segs: q.hi ? 4 : 1,
        ...(q.hi
          ? {
              holes: [
                [
                  [0.221, -0.0805, 0.0024],
                  [0.239, -0.0805, 0.0024],
                  [0.239, -0.0745, 0.0024],
                  [0.221, -0.0745, 0.0024],
                ] as Corner[],
              ],
              holeTint: 0.3,
            }
          : {}),
      },
    ),
  );
  // Rubber butt pad.
  parts.push(
    frontLoft(rectRing(-0.0186, -0.0915, 0.0186, 0.0195, 0.007, q.fil, 0.78), [], 0.2535, 0.2645, 0.0025, q, q.hi ? 3 : 1).surfBy((p, s) => {
      if (p.z > 0.2545) s[1] = 0;
    }),
  );
  // Adjustment lever housing and lever.
  parts.push(
    sideLoft(
      [
        [0.106, -0.019, 0],
        [0.152, -0.019, 0],
        [0.149, -0.0262, 0.002],
        [0.115, -0.0272, 0.003],
        [0.106, -0.025, 0.002],
      ],
      0.0048,
      0.001,
      q,
    ),
  );
  if (q.hi) {
    parts.push(
      sideLoft(
        [
          [0.118, -0.0262, 0],
          [0.146, -0.0262, 0],
          [0.144, -0.029, 0.001],
          [0.123, -0.0296, 0.0015],
        ],
        0.003,
        0.0006,
        q,
        { tint: 0.8 },
      ),
    );
  }
  return merge(...parts);
}

function bufferTube(q: Q): { tube: Part; steel: Part } {
  const t = radial(
    [
      { z: 0.1815, r: 0.0001 },
      { z: 0.1815, r: 0.012 },
      { z: 0.181, r: 0.014 },
      { z: 0.18, r: 0.0146 },
      { z: 0.0105, r: 0.0146 },
    ],
    q.hi ? 48 : q.seg,
  );
  const parts: Part[] = [t];
  if (q.hi) {
    parts.push(
      frontLoft(
        polyRound(
          [
            [-0.0042, -0.0128, 0],
            [0.0042, -0.0128, 0],
            [0.0034, -0.0182, 0.0006],
            [-0.0034, -0.0182, 0.0006],
          ],
          q.fil,
        ),
        [],
        0.02,
        0.18,
        0.0005,
        q,
      ),
    );
  }
  // Castle nut with three notches, and the end plate.
  const notches = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  const nutMod = (th: number, z: number, s: GridSample): void => {
    if (z > 0.0169 && s.x > 0.0175) {
      for (const a of notches) if (angDist(th, a) < 0.16) s.x = 0.0166;
    }
  };
  const nut = radial(
    [
      { z: 0.0205, r: 0.0147 },
      { z: 0.0205, r: 0.018 },
      { z: 0.0202, r: 0.0188, wear: 1 },
      { z: 0.0198, r: 0.019 },
      { z: 0.0171, r: 0.019 },
      { z: 0.0168, r: 0.019 },
      { z: 0.0133, r: 0.019 },
      { z: 0.013, r: 0.0186, wear: 1 },
      { z: 0.0128, r: 0.0178 },
      { z: 0.0128, r: 0.0147 },
    ],
    q.hi ? 72 : q.seg,
    q.hi ? nutMod : undefined,
  );
  const plate = frontLoft(rectRing(-0.015, -0.0235, 0.015, 0.017, 0.008, q.fil), [circleRing(0, 0, 0.0147, 32)], 0.0115, 0.0128, 0.0003, q, 1);
  return { tube: merge(...parts), steel: merge(nut, plate) };
}

function rearSight(q: Q): Part {
  const parts: Part[] = [];
  parts.push(frontLoft(rectRing(-0.0125, 0.0222, 0.0125, 0.0345, 0.0025, q.fil), [], -0.037, -0.006, 0.001, q));
  const plate = polyRound(
    [
      [-0.0105, 0.0335, 0.001],
      [0.0105, 0.0335, 0.001],
      [0.008, 0.056, 0.003],
      ...arc(0, SIGHT_Y, 0.0068, (-40 * Math.PI) / 180, (220 * Math.PI) / 180, q.hi ? 26 : 8),
      [-0.008, 0.056, 0.003],
    ],
    q.fil,
  );
  const aperture = circleRing(0, SIGHT_Y, 0.0025, q.hi ? 32 : 10, 0.6, 1);
  parts.push(frontLoft(plate, [aperture], REAR_SIGHT_Z - 0.0025, REAR_SIGHT_Z + 0.0025, 0.0007, q));
  if (q.hi) {
    const knurl = (th: number, z: number, s: GridSample): void => {
      if (z < -0.0008 && z > -0.0052) s.x += 0.0003 * (Math.cos(th * 22) > 0 ? 1 : 0);
    };
    const knob = (len: number, r: number): RP[] => [
      { z: 0.001, r },
      { z: -len + 0.0006, r },
      { z: -len, r: r * 0.85, wear: 1 },
      { z: -len, r: 0.0001 },
    ];
    parts.push(radial(knob(0.004, 0.0048), 48, knurl).transform(mat(0.0125, 0.03, -0.015, aim(X))));
    parts.push(radial(knob(0.0062, 0.0058), 48, knurl).transform(mat(-0.0125, 0.0285, -0.028, aim(NX))));
    parts.push(
      radial(
        [
          { z: 0.0112, r: 0.0001 },
          { z: 0.0112, r: 0.0018 },
          { z: -0.0112, r: 0.0018 },
          { z: -0.0112, r: 0.0001 },
        ],
        16,
      ).transform(mat(0, 0.0345, REAR_SIGHT_Z, aim(X))),
    );
  }
  return merge(...parts);
}

function chargingHandle(q: Q): Part {
  return topLoft(
    [
      [-0.0055, -0.03, 0.0008],
      [0.0055, -0.03, 0.0008],
      [0.0055, 0.001, 0],
      [0.018, 0.001, 0.0012],
      [0.0195, 0.007, 0.0025],
      [0.016, 0.011, 0.0035],
      [-0.016, 0.011, 0.0035],
      [-0.0215, 0.0095, 0.0025],
      [-0.0205, 0.001, 0.0012],
      [-0.0055, 0.001, 0],
    ],
    0.0152,
    0.021,
    0.0009,
    q,
  );
}

function boltCarrier(q: Q): Part {
  const p: RP[] = [
    { z: 0.012, r: 0.004 },
    { z: 0.012, r: 0.0112 },
    { z: 0.0115, r: 0.0118, wear: 1 },
    { z: 0.011, r: 0.0118 },
  ];
  for (let z = -0.06; z > -0.0945; z -= 0.0003) p.push({ z, r: 0.0118 });
  p.push(
    { z: -0.109, r: 0.0118 },
    { z: -0.1095, r: 0.0116, wear: 1 },
    { z: -0.11, r: 0.0112, hard: true },
    { z: -0.11, r: 0.0098, hard: true },
    { z: -0.1238, r: 0.0098 },
    { z: -0.1248, r: 0.009, wear: 1 },
    { z: -0.1255, r: 0.0078, hard: true },
    { z: -0.1255, r: 0.002 },
  );
  const fa = (th: number, z: number, s: GridSample): void => {
    if (z < -0.062 && z > -0.0925 && angDist(th, 0) < 0.42) {
      s.x -= 0.00045 * (0.5 + 0.5 * Math.cos((z / 0.0018) * Math.PI * 2));
      s.ao = 0.85;
    }
  };
  const carrier = radial(p, q.seg + 8, fa);
  const ext = frontLoft(rectRing(-0.0016, -0.0013, 0.0016, 0.0013, 0.0004, q.fil), [], -0.1235, -0.112, 0.0003, q, 2);
  const a = (35 * Math.PI) / 180;
  ext.transform(mat(Math.cos(a) * 0.0098, Math.sin(a) * 0.0098, 0, qAxis(Z, a)));
  return merge(carrier, ext);
}

function boltCatchPart(q: Q): Part {
  const parts: Part[] = [
    sideLoft(
      [
        [0.0045, 0.003, 0.0015],
        [-0.004, 0.003, 0.0015],
        [-0.005, -0.008, 0.0015],
        [-0.0075, -0.017, 0.0025],
        [-0.0075, -0.0215, 0.002],
        [0.0055, -0.0215, 0.002],
        [0.0055, -0.017, 0.002],
        [0.0035, -0.008, 0.0015],
      ],
      0.0013,
      0.0005,
      q,
      { x: -0.001 },
    ),
  ];
  for (let i = 0; i < 3; i++) {
    const y = -0.0175 - i * 0.0014;
    parts.push(
      sideLoft(
        [
          [-0.0068, y, 0],
          [0.0048, y, 0],
          [0.0048, y - 0.0006, 0],
          [-0.0068, y - 0.0006, 0],
        ],
        0.0004,
        0.00015,
        q,
        { x: -0.0024, segs: 1 },
      ),
    );
  }
  return merge(...parts);
}

// ---------------------------------------------------------------------------
// Magazine
// ---------------------------------------------------------------------------

interface MagFrame {
  c: [number, number];
  n: [number, number];
  t: [number, number];
}

/** Centreline frame of the curved GI magazine at arc length s (local space). */
function magFrame(s: number): MagFrame {
  const straight = 0.058;
  const R = 0.3;
  if (s <= straight) return { c: [0, -s], n: [-1, 0], t: [0, -1] };
  const phi = (s - straight) / R;
  return {
    c: [-R + R * Math.cos(phi), -straight - R * Math.sin(phi)],
    n: [-Math.cos(phi), Math.sin(phi)],
    t: [-Math.sin(phi), -Math.cos(phi)],
  };
}

const MAG_LEN = 0.17;
const MAG_HALF_DEPTH = 0.032;

function magazineBody(q: Q): Part {
  const parts: Part[] = [];
  const steps = q.hi ? 24 : 6;
  const rear: Corner[] = [];
  const front: Corner[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * MAG_LEN;
    const f = magFrame(s);
    const r = i === 0 || i === steps ? 0.002 : -1;
    rear.push([f.c[0] - f.n[0] * MAG_HALF_DEPTH, f.c[1] - f.n[1] * MAG_HALF_DEPTH, r]);
    front.push([f.c[0] + f.n[0] * MAG_HALF_DEPTH, f.c[1] + f.n[1] * MAG_HALF_DEPTH, r]);
  }
  parts.push(sideLoft([...rear, ...front.reverse()], 0.01125, 0.0022, q));
  // Floorplate.
  const e = magFrame(MAG_LEN);
  const fp = (u: number, v: number): Corner => [e.c[0] + e.n[0] * u + e.t[0] * v, e.c[1] + e.n[1] * u + e.t[1] * v, 0.0015];
  parts.push(sideLoft([fp(-0.0345, -0.0005), fp(0.0345, -0.0005), fp(0.0345, 0.0062), fp(-0.0345, 0.0062)], 0.0127, 0.0015, q, { tint: 0.8 }));
  // Feed lips.
  parts.push(
    sideLoft(
      [
        [0.031, -0.001, 0],
        [-0.004, -0.001, 0],
        [-0.004, 0.0018, 0.001],
        [0.01, 0.0042, 0.003],
        [0.0302, 0.0042, 0.0012],
      ],
      0.0095,
      0.0008,
      q,
    ),
  );
  if (q.hi) {
    // Stamped stiffening ribs on both sides.
    for (const off of [-0.017, 0.017]) {
      const a: Corner[] = [];
      const b: Corner[] = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const s = 0.07 + (i / n) * 0.085;
        const f = magFrame(s);
        const cz = f.c[0] + f.n[0] * off;
        const cy = f.c[1] + f.n[1] * off;
        const r = i === 0 || i === n ? 0.0012 : -1;
        a.push([cz - f.n[0] * 0.0022, cy - f.n[1] * 0.0022, r]);
        b.push([cz + f.n[0] * 0.0022, cy + f.n[1] * 0.0022, r]);
      }
      parts.push(sideLoft([...a, ...b.reverse()], 0.01195, 0.0005, q, { segs: 2 }));
    }
  }
  return merge(...parts);
}

function cartridge(q: Q): Part {
  return radial(
    [
      { z: 0.0285, r: 0.0002 },
      { z: 0.0285, r: 0.0042 },
      { z: 0.0284, r: 0.0047, wear: 0 },
      { z: 0.0281, r: 0.0048 },
      { z: 0.0273, r: 0.0048, hard: true },
      { z: 0.027, r: 0.0041, hard: true },
      { z: 0.0262, r: 0.0041, hard: true },
      { z: 0.0257, r: 0.0048 },
      { z: -0.0075, r: 0.00455 },
      { z: -0.009, r: 0.004 },
      { z: -0.0102, r: 0.0032 },
      { z: -0.016, r: 0.0031, hard: true },
      { z: -0.016, r: 0.0028, wear: 1, hard: true },
      { z: -0.0185, r: 0.0028, wear: 1 },
      { z: -0.023, r: 0.0024, wear: 1 },
      { z: -0.0265, r: 0.0015, wear: 1 },
      { z: -0.0285, r: 0.0006, wear: 1 },
      { z: -0.0289, r: 0.0001, wear: 1 },
    ],
    q.hi ? 24 : 8,
  );
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface GunMaterials {
  anod: MeshStandardNodeMaterial;
  steel: MeshStandardNodeMaterial;
  poly: MeshStandardNodeMaterial;
  mag: MeshStandardNodeMaterial;
  brass: MeshStandardNodeMaterial;
  nitride: MeshStandardNodeMaterial;
}

interface WornSpec {
  base: [number, number, number];
  worn: [number, number, number];
  metal: number;
  wornMetal: number;
  rough: number;
  wornRough: number;
  blotchScale: number;
  blotchAmount: number;
  roughVar: number;
  bump: number;
  bumpFreq: number;
  wearBias: number;
}

function wornMaterial(spec: WornSpec): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const s = surfNode();
  const p = positionGeometry;
  const fine = mx_noise_float(p.mul(spec.bumpFreq));
  const chip = mx_noise_float(p.mul(150));
  const blot = mx_fractal_noise_float(p.mul(spec.blotchScale), 3, 2.0, 0.5);
  const wearAmt = smoothstep(0.5, 0.72, s.y.mul(0.85).add(chip.mul(0.32)).add(blot.mul(0.12)).sub(spec.wearBias));
  const base = vec3(...spec.base).mul(blot.mul(spec.blotchAmount).add(1));
  m.colorNode = mix(base, vec3(...spec.worn), wearAmt).mul(s.x);
  m.metalnessNode = mix(float(spec.metal), float(spec.wornMetal), wearAmt);
  m.roughnessNode = mix(float(spec.rough).add(fine.mul(spec.roughVar)).add(blot.mul(spec.roughVar * 1.5)), float(spec.wornRough), wearAmt);
  m.aoNode = s.z;
  m.normalNode = bumpNormal(fine.mul(spec.bump));
  return m;
}

function makeMaterials(): GunMaterials {
  const anod = wornMaterial({
    base: [0.036, 0.039, 0.046],
    worn: [0.5, 0.51, 0.53],
    metal: 0.8,
    wornMetal: 1,
    rough: 0.42,
    wornRough: 0.3,
    blotchScale: 40,
    blotchAmount: 0.12,
    roughVar: 0.04,
    bump: 0.000012,
    bumpFreq: 320,
    wearBias: 0.12,
  });
  const steel = wornMaterial({
    base: [0.058, 0.058, 0.054],
    worn: [0.42, 0.42, 0.41],
    metal: 0.55,
    wornMetal: 1,
    rough: 0.62,
    wornRough: 0.33,
    blotchScale: 70,
    blotchAmount: 0.25,
    roughVar: 0.05,
    bump: 0.00002,
    bumpFreq: 420,
    wearBias: 0.1,
  });
  const poly = wornMaterial({
    base: [0.03, 0.03, 0.031],
    worn: [0.075, 0.075, 0.075],
    metal: 0,
    wornMetal: 0,
    rough: 0.68,
    wornRough: 0.5,
    blotchScale: 30,
    blotchAmount: 0.08,
    roughVar: 0.05,
    bump: 0.000018,
    bumpFreq: 560,
    wearBias: 0.18,
  });
  const mag = wornMaterial({
    base: [0.062, 0.064, 0.067],
    worn: [0.46, 0.47, 0.48],
    metal: 0.6,
    wornMetal: 1,
    rough: 0.55,
    wornRough: 0.32,
    blotchScale: 45,
    blotchAmount: 0.15,
    roughVar: 0.05,
    bump: 0.000012,
    bumpFreq: 300,
    wearBias: 0.08,
  });
  const nitride = wornMaterial({
    base: [0.05, 0.05, 0.052],
    worn: [0.55, 0.55, 0.55],
    metal: 0.85,
    wornMetal: 1,
    rough: 0.36,
    wornRough: 0.25,
    blotchScale: 60,
    blotchAmount: 0.15,
    roughVar: 0.04,
    bump: 0.00001,
    bumpFreq: 300,
    wearBias: 0.05,
  });
  const brass = new MeshStandardNodeMaterial();
  {
    const s = surfNode();
    const n = mx_noise_float(positionGeometry.mul(220));
    brass.colorNode = mix(vec3(0.78, 0.56, 0.26), vec3(0.72, 0.4, 0.26), s.y).mul(n.mul(0.06).add(1));
    brass.metalnessNode = float(1);
    brass.roughnessNode = float(0.28).add(n.mul(0.06));
    brass.aoNode = s.z;
  }
  return { anod, steel, poly, mag, brass, nitride };
}

function makeLowMaterials(): { metal: MeshStandardNodeMaterial; poly: MeshStandardNodeMaterial; mag: MeshStandardNodeMaterial } {
  const mk = (c: [number, number, number], metal: number, rough: number): MeshStandardNodeMaterial => {
    const m = new MeshStandardNodeMaterial();
    const s = surfNode();
    m.colorNode = vec3(...c).mul(s.x);
    m.metalnessNode = float(metal);
    m.roughnessNode = float(rough);
    m.aoNode = s.z;
    return m;
  };
  return {
    metal: mk([0.045, 0.047, 0.052], 0.7, 0.48),
    poly: mk([0.03, 0.03, 0.031], 0, 0.7),
    mag: mk([0.062, 0.064, 0.067], 0.6, 0.55),
  };
}

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

/**
 * Palm frame used by the arms: palm faces -Y, fingers point -Z, wrist toward
 * +Z (thumb at -X for the right hand, +X for the left). `palmNormal` is the
 * direction the palm faces (toward the gripped surface); `wrist` is the
 * rough direction from the palm toward the wrist / forearm.
 */
function palmFrame(obj: Object3D, pos: Vector3, palmNormal: Vector3, wrist: Vector3): void {
  const yAxis = palmNormal.clone().normalize().negate();
  const zAxis = wrist.clone().sub(yAxis.clone().multiplyScalar(wrist.dot(yAxis))).normalize();
  const xAxis = new Vector3().crossVectors(yAxis, zAxis).normalize();
  obj.quaternion.setFromRotationMatrix(basis(xAxis, yAxis, zAxis));
  obj.position.copy(pos);
}

function socket(name: string, parent: Object3D, pos: Vector3, q?: Quaternion): Object3D {
  const o = new Object3D();
  o.name = name;
  o.position.copy(pos);
  if (q) o.quaternion.copy(q);
  parent.add(o);
  return o;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildM4A1(options: { detail?: 'high' | 'low' } = {}): M4A1Model {
  const hi = (options.detail ?? 'high') === 'high';
  const q = hi ? HI : LO;
  const root = new Group();
  root.name = 'M4A1';

  const anod = new GeoBuilder();
  const steelB = hi ? new GeoBuilder() : anod;
  const poly = new GeoBuilder();
  const magB = new GeoBuilder();
  const brassB = new GeoBuilder();
  const chB = hi ? new GeoBuilder() : anod;
  const boltB = new GeoBuilder();
  const catchB = hi ? new GeoBuilder() : anod;
  // Low detail: steel parts share the single metal mesh, slightly lighter.
  const steelTint = hi ? 1 : 1.15;

  // Upper receiver group.
  anod.add(upperReceiver(q));
  const teeth: number[] = [];
  for (let k = 0; k < 17; k++) teeth.push(-0.0085 - 0.01 * k);
  anod.add(picatinny(q, -0.1795, -0.003, teeth));
  anod.add(rearSight(q));
  if (hi) {
    const fa = forwardAssist(q);
    anod.add(fa.housing);
    anod.add(fa.button);
    // Brass deflector behind the port.
    anod.add(
      topLoft(
        [
          [0.0115, -0.0575, 0],
          [0.0162, -0.0575, 0.0012],
          [0.0192, -0.048, 0.0035],
          [0.0158, -0.034, 0.004],
          [0.0115, -0.031, 0],
        ],
        -0.0035,
        0.0075,
        0.0008,
        q,
      ),
    );
    // Dust cover (open, hanging below the port) and its hinge rod.
    const hinge = new Vector3(0.0152, -0.009, 0);
    const cover = sideLoft(
      [
        [-0.123, -0.0084, 0.0015],
        [-0.056, -0.0084, 0.0015],
        [-0.056, 0.0095, 0.0015],
        [-0.123, 0.0095, 0.0015],
      ],
      0.0006,
      0.00035,
      q,
      { x: UW + 0.0008, segs: 2 },
    );
    const ridge = sideLoft(
      [
        [-0.118, 0.004, 0.0006],
        [-0.061, 0.004, 0.0006],
        [-0.061, 0.0058, 0.0006],
        [-0.118, 0.0058, 0.0006],
      ],
      0.0005,
      0.0002,
      q,
      { x: UW + 0.0016, segs: 1 },
    );
    const coverM = mat(hinge.x, hinge.y, 0)
      .multiply(mat(0, 0, 0, qAxis(Z, (-170 * Math.PI) / 180)))
      .multiply(mat(-hinge.x, -hinge.y, 0));
    anod.add(merge(cover, ridge), coverM);
    steelB.add(
      radial(
        [
          { z: -0.0545, r: 0.0001 },
          { z: -0.0545, r: 0.0011 },
          { z: -0.1245, r: 0.0011 },
          { z: -0.1245, r: 0.0001 },
        ],
        10,
      )
        .transform(mat(hinge.x, hinge.y, 0))
        .surf(steelTint),
    );
  }

  // Barrel group.
  steelB.add(barrel(q).surf(steelTint));
  steelB.add(flashHider(q).surf(steelTint));
  steelB.add(frontSightBase(q).surf(steelTint));
  steelB.add(deltaRing(q).surf(steelTint));
  steelB.add(handguardCap(q).surf(steelTint));
  if (hi) {
    steelB.add(
      radial(
        [
          { z: -0.5262, r: 0.008 },
          { z: -0.5262, r: 0.0102, hard: true },
          { z: -0.529, r: 0.0102, hard: true },
          { z: -0.529, r: 0.008 },
        ],
        36,
      ),
    );
  }
  poly.add(handguard(q));

  // Lower receiver group.
  anod.add(lowerReceiver(q));
  const bt = bufferTube(q);
  anod.add(bt.tube);
  steelB.add(bt.steel.surf(steelTint));
  poly.add(pistolGrip(q));
  poly.add(stock(q));
  steelB.add(
    sideLoft(
      [
        [-0.07, -0.027, 0],
        [-0.0712, -0.034, 0.006],
        [-0.0695, -0.0418, 0.004],
        [-0.0668, -0.0458, 0.0012],
        [-0.065, -0.0455, 0.0012],
        [-0.066, -0.041, 0.005],
        [-0.0638, -0.033, 0.006],
        [-0.0632, -0.027, 0],
      ],
      0.0021,
      0.0005,
      q,
    ).surf(steelTint),
  );
  if (hi) {
    // Pins (both sides).
    const pins: [number, number, number][] = [
      [-0.1745, -0.0215, 0.0033],
      [-0.009, -0.019, 0.0032],
      [-0.044, -0.024, 0.0021],
      [-0.065, -0.0245, 0.0021],
    ];
    for (const [z, y, r] of pins) {
      steelB.add(disc(new Vector3(LW, y, z), X, r, 0.0007, q));
      steelB.add(disc(new Vector3(-LW, y, z), NX, r * 1.08, 0.0008, q));
    }
    // Selector (left, on AUTO pointing rearward) and its right-side stub.
    steelB.add(
      radial(
        [
          { z: 0.0005, r: 0.0058 },
          { z: -0.001, r: 0.0058 },
          { z: -0.0015, r: 0.0052, wear: 1 },
          { z: -0.0016, r: 0.0001 },
        ],
        32,
      ).transform(mat(-LW, -0.0185, -0.0335, aim(NX))),
    );
    steelB.add(
      sideLoft(
        [
          [-0.037, -0.016, 0.002],
          [-0.016, -0.0172, 0.0015],
          [-0.0135, -0.0185, 0.0015],
          [-0.016, -0.0198, 0.0015],
          [-0.037, -0.021, 0.002],
        ],
        0.0009,
        0.0003,
        q,
        { x: -LW - 0.0021, segs: 2 },
      ),
    );
    steelB.add(
      sideLoft(
        [
          [-0.0185, -0.0168, 0.0012],
          [-0.0138, -0.0175, 0.001],
          [-0.0138, -0.0195, 0.001],
          [-0.0185, -0.0202, 0.0012],
        ],
        0.0011,
        0.0003,
        q,
        { x: -LW - 0.0031, segs: 2 },
      ),
    );
    steelB.add(disc(new Vector3(LW, -0.0185, -0.0335), X, 0.0042, 0.0008, q));
    // Magazine release button.
    const rib = (th: number, z: number, s: GridSample): void => {
      if (z < 0.0015 && z > -0.0022) s.x += 0.00025 * (Math.cos(th * 16) > 0 ? 1 : 0);
    };
    steelB.add(
      radial(
        [
          { z: 0.002, r: 0.0047 },
          { z: -0.0022, r: 0.0047 },
          { z: -0.0029, r: 0.0042, wear: 1 },
          { z: -0.0032, r: 0.0034 },
          { z: -0.0032, r: 0.0001 },
        ],
        48,
        rib,
      ).transform(mat(LW, -0.035, -0.093, aim(X))),
    );
    // Bolt catch roll pin (static).
    steelB.add(
      radial(
        [
          { z: 0.006, r: 0.0001 },
          { z: 0.006, r: 0.0011 },
          { z: -0.006, r: 0.0011 },
          { z: -0.006, r: 0.0001 },
        ],
        10,
      ).transform(mat(BOLT_CATCH_PIVOT.x - 0.0008, BOLT_CATCH_PIVOT.y, BOLT_CATCH_PIVOT.z)),
    );
  }

  // Moving parts.
  const chPart = chargingHandle(q);
  chB.add(chPart);
  const magPart = magazineBody(q);
  magB.add(magPart);
  if (hi) {
    brassB.add(cartridge(q), mat(0.0042, 0.004, 0));
    brassB.add(cartridge(q), mat(-0.0042, -0.0006, 0.0004));
    boltB.add(boltCarrier(q));
    catchB.add(boltCatchPart(q));
  } else {
    catchB.add(boltCatchPart(q), mat(BOLT_CATCH_PIVOT.x, BOLT_CATCH_PIVOT.y, BOLT_CATCH_PIVOT.z));
  }

  // Meshes.
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const mesh = (b: GeoBuilder, m: Material, name: string, parent: Object3D): Mesh | null => {
    if (b.vertexCount === 0) return null;
    const g = b.build();
    geometries.push(g);
    const me = new Mesh(g, m);
    me.name = name;
    parent.add(me);
    return me;
  };

  const magazine = new Object3D();
  magazine.name = 'magazine';
  magazine.position.copy(MAG_ORIGIN);
  root.add(magazine);
  const chargingHandleObj = new Object3D();
  chargingHandleObj.name = 'chargingHandle';
  root.add(chargingHandleObj);
  const boltObj = new Object3D();
  boltObj.name = 'bolt';
  root.add(boltObj);
  const boltCatch = new Object3D();
  boltCatch.name = 'boltCatch';
  boltCatch.position.copy(BOLT_CATCH_PIVOT);
  root.add(boltCatch);

  if (hi) {
    const mats = makeMaterials();
    materials.push(mats.anod, mats.steel, mats.poly, mats.mag, mats.brass, mats.nitride);
    mesh(anod, mats.anod, 'receivers', root);
    mesh(steelB, mats.steel, 'steel', root);
    mesh(poly, mats.poly, 'polymer', root);
    mesh(magB, mats.mag, 'magazineBody', magazine);
    mesh(brassB, mats.brass, 'cartridges', magazine);
    mesh(chB, mats.anod, 'chargingHandle', chargingHandleObj);
    mesh(boltB, mats.nitride, 'boltCarrier', boltObj);
    mesh(catchB, mats.steel, 'boltCatch', boltCatch);
  } else {
    const mats = makeLowMaterials();
    materials.push(mats.metal, mats.poly, mats.mag);
    mesh(anod, mats.metal, 'metal', root);
    mesh(poly, mats.poly, 'polymer', root);
    mesh(magB, mats.mag, 'magazineBody', magazine);
  }

  // Sockets.
  const sockets = {
    muzzle: socket('muzzle', root, new Vector3(0, 0, MUZZLE_Z)),
    ejectionPort: socket('ejectionPort', root, new Vector3(UW, 0.0005, (PORT_Z0 + PORT_Z1) / 2)),
    rightGrip: socket('rightGrip', root, new Vector3()),
    leftHandguard: socket('leftHandguard', root, new Vector3()),
    magWell: socket('magWell', root, MAG_ORIGIN.clone()),
    rearSight: socket('rearSight', root, new Vector3(0, SIGHT_Y, REAR_SIGHT_Z)),
    frontSight: socket('frontSight', root, new Vector3(0, SIGHT_Y, FRONT_SIGHT_Z)),
  };
  // Right palm on the right side of the A2 grip, heel out to the rear-right,
  // fingers wrapping the front strap.
  palmFrame(sockets.rightGrip, RIGHT_PALM.pos, RIGHT_PALM.normal, RIGHT_PALM.wrist);
  // Left palm under the handguard, fingers curling up its right side,
  // thumb along the left side.
  palmFrame(sockets.leftHandguard, LEFT_PALM.pos, LEFT_PALM.normal, LEFT_PALM.wrist);

  return {
    root,
    magazine,
    chargingHandle: chargingHandleObj,
    bolt: boltObj,
    boltCatch,
    sockets,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
