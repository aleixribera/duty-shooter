import { createWorld, raycastWorld, yawBox, type Material, type PlayerSpawn, type Solid, type SpawnPoint, type Vec3, type World } from '@duty-shooter/fps-core';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import { mapSolids, type CameraKey, type CameraSpot, type IndoorZone, type MapDefinition, type Measured } from './definition';

/**
 * Survival Town: a recreation of the original 2010 suburban test-site map
 * from public references (see survival-town-reference.ts for every source
 * and assumption). Two houses face each other across a cul-de-sac, each with
 * a garage, a back yard, a deck and an upper floor overlooking the centre;
 * a bus and two trucks sit in the middle. The street leaves to the east.
 *
 * Metres, x east, y up, z south; the origin is the cul-de-sac centre on the
 * street's axis. Each house is built once in terms of its distance `d` from
 * the street's axis and mirrored: the north house (z = -d) is team 1's, the
 * south house (z = +d) team 2's.
 */

/** Wall thicknesses: outside walls and inside partitions. */
const OUTER = 0.2;
const INNER = 0.12;
/** Ground and upper floor levels, and wall tops. */
const UPPER_FLOOR = 3.0;
const UPPER_TOP = 5.6;
/** Door openings: the 80 in standard height and a 36 in width. */
const DOOR_H = 2.03;
const DOOR_W = 0.91;
/** The cul-de-sac's radius, the street's half width and the playable street end. */
const CIRCLE_R = 8.75;
const STREET_HALF = 4.5;
const STREET_END = 20;
/** Boundary clip reaches this high: out of reach of any jump or mantle. */
const SKY = 100;

/** The playable edge's north half, from the street end round to the street's axis on the west (x, z). */
const NORTH_EDGE: readonly (readonly [number, number])[] = [
  [STREET_END, -8.5],
  [9.5, -8.5],
  [10.25, -16],
  [6.25, -32],
  [4.25, -40],
  [2.75, -47.5],
  [1.75, -51.5],
  [-7, -51.5],
  [-13, -48],
  [-16, -43],
  [-25, -40],
  [-23, -32],
  [-19.75, -17.5],
  [-22, -13],
  [-23.5, -3],
];

/** The whole playable edge: the north half, then the south half mirrored back to the start. */
export const PLAY_AREA: readonly (readonly [number, number])[] = [...NORTH_EDGE, ...[...NORTH_EDGE].reverse().map(([x, z]) => [x, -z] as const)];

/** Yaw that looks from `p` toward the cul-de-sac centre. */
function faceCentre(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Yaw that looks along +x / -x / +z / -z. */
const LOOK = { east: -Math.PI / 2, west: Math.PI / 2, south: Math.PI, north: 0 } as const;

/**
 * Builds one house and its yard at distance `d` from the street axis, on the
 * side `s` (-1 north, +1 south).
 */
class Side {
  constructor(
    readonly b: Builder,
    readonly s: -1 | 1,
  ) {}

  z(d: number): number {
    return this.s * d;
  }

  /** Looking toward the street from this side's house (north house looks south). */
  get towardStreet(): number {
    return this.s === -1 ? LOOK.south : LOOK.north;
  }

  box(x0: number, y0: number, d0: number, x1: number, y1: number, d1: number, material: Material): Solid {
    return this.b.add([x0, y0, this.z(d0)], [x1, y1, this.z(d1)], material);
  }

  /** A wall running along x at distance d. */
  wallX(d: number, x0: number, x1: number, bottom: number, height: number, material: Material, thickness: number, openings: readonly Opening[] = []): void {
    this.b.wall({ along: 'x', at: this.z(d), from: x0, to: x1, thickness, bottom, height, material, openings });
  }

  /** A wall running along z at x, from distance d0 to d1, with openings given in distances. */
  wallD(x: number, d0: number, d1: number, bottom: number, height: number, material: Material, thickness: number, openings: readonly Opening[] = []): void {
    const mapped = openings.map((o) => ({ ...o, from: Math.min(this.z(o.from), this.z(o.to)), to: Math.max(this.z(o.from), this.z(o.to)) }));
    this.b.wall({ along: 'z', at: x, from: this.z(d0), to: this.z(d1), thickness, bottom, height, material, openings: mapped });
  }

  rectD(x0: number, x1: number, d0: number, d1: number): Rect {
    const a = this.z(d0);
    const c = this.z(d1);
    return { x0, x1, z0: Math.min(a, c), z1: Math.max(a, c) };
  }
}

/** Where things are, per house, in distances from the street axis (shared by building, spawns, spots and measurements). */
const HOUSE = {
  /** Main block walls (centre lines) and the upper storey's west wall. */
  main: { x0: -8, x1: 6, d0: 14, d1: 31.75, upperX0: -2 },
  garage: { x0: -17, x1: -8, d0: 12.5, d1: 27.5, partition: 20 },
  stairs: { x0: -2 + OUTER / 2, x1: -0.8, d0: 16, d1: 21.6 },
  /** The upstairs front window ("the window"). */
  window: { x0: 0.5, x1: 4, sill: 0.6, top: 2.45 },
  frontDoor: { x0: 0.5 },
  porch: { x0: -1, x1: 5, d0: 12, top: 2.7 },
  deck: { x0: -7, x1: 2, d1: 35.25, stairsX0: -12.4 },
  /** Roof heights. */
  roof: { mainPeak: 7.0, denHigh: 4.0, garagePeak: 4.5, eave: 0.4 },
} as const;

function buildHouse(side: Side): void {
  const { b } = side;
  const M = HOUSE.main;
  const G = HOUSE.garage;
  const h = OUTER / 2;
  const glass = (from: number, to: number, bottom = 0.9, top = 2.1): Opening => ({ from, to, bottom, top, pane: 'glass' });
  const door = (from: number): Opening => ({ from, to: from + DOOR_W, bottom: 0, top: DOOR_H });

  // Main block, ground floor (wood frame walls with siding).
  side.wallX(M.d0, M.x0 - h, M.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(-6, -3.5), door(HOUSE.frontDoor.x0), glass(3, 5)]);
  side.wallX(M.d1, M.x0 - h, M.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [door(-4), glass(1, 4, 1.0)]);
  side.wallD(M.x1, M.d0 + h, M.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(17, 19.5), glass(26, 28)]);
  side.wallD(M.x0, M.d0 + h, M.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [door(16), door(25), glass(29, 30.5)]);

  // Inside stairs to the upper floor, climbing away from the street.
  const S = HOUSE.stairs;
  b.stairs({ along: 'z', from: side.z(S.d0), to: side.z(S.d1), across: [S.x0, S.x1], bottom: 0, top: UPPER_FLOOR, material: 'wood' });

  // Upper floor: a slab over the two-storey part with the stairwell left open, and the den's ceiling beside it.
  const slab = UPPER_FLOOR - 0.2;
  side.box(S.x1, slab, M.d0 + h, M.x1 - h, UPPER_FLOOR, M.d1 - h, 'wood');
  side.box(M.upperX0, slab, M.d0 + h, S.x1, UPPER_FLOOR, S.d0, 'wood');
  side.box(M.upperX0, slab, S.d1, S.x1, UPPER_FLOOR, M.d1 - h, 'wood');
  side.box(M.x0 + h, slab, M.d0 + h, M.upperX0, UPPER_FLOOR, M.d1 - h, 'plaster');
  // Railing round the stairwell.
  side.box(S.x1, UPPER_FLOOR, S.d0, S.x1 + 0.08, UPPER_FLOOR + 1, S.d1, 'wood');
  side.box(S.x0, UPPER_FLOOR, S.d0, S.x1, UPPER_FLOOR + 1, S.d0 + 0.08, 'wood');

  // Upper storey walls, the front window open to the street.
  const upper = UPPER_TOP - UPPER_FLOOR;
  const W = HOUSE.window;
  side.wallX(M.d0, M.upperX0 - h, M.x1 + h, UPPER_FLOOR, upper, 'wood', OUTER, [{ from: W.x0, to: W.x1, bottom: W.sill, top: W.top }]);
  side.wallX(M.d1, M.upperX0 - h, M.x1 + h, UPPER_FLOOR, upper, 'wood', OUTER, [door(0), glass(3, 5)]);
  side.wallD(M.x1, M.d0 + h, M.d1 - h, UPPER_FLOOR, upper, 'wood', OUTER, [glass(18, 20)]);
  side.wallD(M.upperX0, M.d0 + h, M.d1 - h, UPPER_FLOOR, upper, 'wood', OUTER);
  // Partitions stop under the ceiling slabs.
  side.wallX(24, M.upperX0 + h, M.x1 - h, UPPER_FLOOR, upper - 0.2, 'plaster', INNER, [door(3)]);
  side.box(M.upperX0 + h, UPPER_TOP - 0.2, M.d0 + h, M.x1 - h, UPPER_TOP, M.d1 - h, 'plaster');

  // Garage block: the garage at the front, open to the driveway, and a utility room behind it.
  side.wallX(G.d0, G.x0 - h, G.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [{ from: -15.5, to: -9.5, bottom: 0, top: 2.4 }]);
  side.wallX(G.d1, G.x0 - h, G.x1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [door(-12)]);
  side.wallD(G.x0, G.d0 + h, G.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(23, 24.5)]);
  side.wallD(G.x1, G.d0 + h, M.d0 - h, 0, UPPER_FLOOR, 'wood', OUTER);
  side.wallX(G.partition, G.x0 + h, G.x1 - h, 0, slab, 'plaster', INNER, [door(-14)]);
  side.box(G.x0 + h, slab, G.d0 + h, G.x1 - h, UPPER_FLOOR, G.d1 - h, 'plaster');

  // Roofs: the two-storey gable, the den's lean-to against it and the garage's gable across it.
  const R = HOUSE.roof;
  const eave = R.eave;
  const [mz0, mz1] = [side.z(M.d0 - h - eave), side.z(M.d1 + h + eave)].sort((p, q) => p - q) as [number, number];
  b.gableRoof({
    x0: M.upperX0 - h - eave,
    x1: M.x1 + h + eave,
    z0: mz0,
    z1: mz1,
    ridge: 'z',
    base: UPPER_TOP,
    eave: UPPER_TOP,
    peak: R.mainPeak,
    material: 'wood',
    gables: { at: [side.z(M.d0), side.z(M.d1)], thickness: OUTER, material: 'wood' },
  });
  const [dz0, dz1] = [side.z(M.d0 - h - eave), side.z(M.d1 + h)].sort((p, q) => p - q) as [number, number];
  b.slope({ from: [M.x0 - h, 0], to: [M.upperX0 - h, 0], along: 'x', across: [dz0, dz1], base: UPPER_FLOOR, low: UPPER_FLOOR, high: R.denHigh, material: 'wood' });
  const [gz0, gz1] = [side.z(G.d0 - h - eave), side.z(G.d1 + h + eave)].sort((p, q) => p - q) as [number, number];
  b.gableRoof({
    x0: G.x0 - h - eave,
    x1: G.x1 - h,
    z0: gz0,
    z1: gz1,
    ridge: 'x',
    base: UPPER_FLOOR,
    eave: UPPER_FLOOR,
    peak: R.garagePeak,
    material: 'wood',
    gables: { at: [G.x0, G.x1], thickness: OUTER, material: 'wood' },
  });

  // Front porch: a flat roof on two posts over the front door, climbable from the planter beside it.
  const P = HOUSE.porch;
  side.box(P.x0, P.top - 0.15, P.d0, P.x1, P.top, M.d0 - h, 'wood');
  side.box(P.x0, 0, P.d0, P.x0 + 0.15, P.top - 0.15, P.d0 + 0.15, 'wood');
  side.box(P.x1 - 0.15, 0, P.d0, P.x1, P.top - 0.15, P.d0 + 0.15, 'wood');
  side.box(3, 0, 10.8, 4.6, 0.8, 11.9, 'brick');
  side.box(-4.75, 0, 12.2, -1.6, 0.6, 13.6, 'brick');

  // Back deck at the upper floor, with outdoor stairs up from the yard.
  const D = HOUSE.deck;
  const deckD0 = M.d1 + h;
  side.box(D.x0, slab, deckD0, D.x1, UPPER_FLOOR, D.d1, 'wood');
  for (const x of [D.x0, -2.6, D.x1 - 0.15]) side.box(x, 0, D.d1 - 0.15, x + 0.15, slab, D.d1, 'wood');
  side.box(D.x0, UPPER_FLOOR, D.d1 - 0.08, D.x1, UPPER_FLOOR + 1, D.d1, 'wood');
  side.box(D.x1 - 0.08, UPPER_FLOOR, deckD0, D.x1, UPPER_FLOOR + 1, D.d1 - 0.08, 'wood');
  side.box(D.x0, UPPER_FLOOR, deckD0, D.x0 + 0.08, UPPER_FLOOR + 1, D.d1 - 1.4, 'wood');
  const [sz0, sz1] = [side.z(D.d1 - 1.4), side.z(D.d1)].sort((p, q) => p - q) as [number, number];
  b.stairs({ along: 'x', from: D.stairsX0, to: D.x0, across: [sz0, sz1], bottom: 0, top: UPPER_FLOOR, material: 'wood' });

  // Furniture: cover inside, gaps either a body wide or closed.
  side.box(2, 0, 21, 5, 0.85, 22, 'wood'); // sofa
  side.box(5, 0, 25, M.x1 - h, 0.9, 30, 'wood'); // kitchen counter
  side.box(1, 0, 27, 3.5, 0.9, 28.2, 'wood'); // kitchen island
  side.box(-6, 0, 18, -4, 0.75, 19.5, 'wood'); // den table
  side.box(G.x0 + h, 0, 14, -16.2, 0.9, 18, 'wood'); // workbench
  side.box(4, UPPER_FLOOR, 15, M.x1 - h, UPPER_FLOOR + 0.6, 17, 'wood'); // front bedroom bed
  side.box(-1.5, UPPER_FLOOR, 22.9, 0, UPPER_FLOOR + 1.2, 23.9, 'wood'); // dresser
  side.box(3.5, UPPER_FLOOR, 27, M.x1 - h, UPPER_FLOOR + 0.6, 29.5, 'wood'); // back bedroom bed

  // The yard: an air-conditioning unit behind the garage (a step up to its roof) and a raised bed along the east side.
  side.box(-15.5, 0, G.d1 + h, -14.5, 1.2, G.d1 + h + 1, 'metal');
  side.box(6.2, 0, 17, 7.6, 0.3, 29, 'dirt');
}

/** The asphalt cul-de-sac: strips across z that stay inside the circle, the middle ones running on down the street. */
function circleStrips(): Rect[] {
  const strips: Rect[] = [];
  const step = 0.25;
  for (let z0 = -CIRCLE_R; z0 < CIRCLE_R - 1e-9; z0 += step) {
    const z1 = z0 + step;
    const m = Math.max(Math.abs(z0), Math.abs(z1));
    const w = Math.sqrt(Math.max(0, CIRCLE_R * CIRCLE_R - m * m));
    if (w < 0.05) continue;
    strips.push({ x0: -w, x1: z0 >= -STREET_HALF - 1e-9 && z1 <= STREET_HALF + 1e-9 ? 90 : w, z0, z1 });
  }
  return strips;
}

function buildGround(b: Builder, sides: readonly Side[]): void {
  const layers: { rect: Rect; material: Material }[] = [];
  for (const side of sides) {
    const M = HOUSE.main;
    const G = HOUSE.garage;
    layers.push({ rect: side.rectD(M.x0 - OUTER / 2, M.x1 + OUTER / 2, M.d0 - OUTER / 2, M.d1 + OUTER / 2), material: 'wood' });
    layers.push({ rect: side.rectD(G.x0 - OUTER / 2, G.x1 + OUTER / 2, G.d0 - OUTER / 2, G.d1 + OUTER / 2), material: 'concrete' });
  }
  for (const rect of circleStrips()) layers.push({ rect, material: 'asphalt' });
  for (const side of sides) {
    layers.push({ rect: side.rectD(HOUSE.porch.x0, HOUSE.porch.x1, HOUSE.porch.d0, HOUSE.main.d0), material: 'concrete' });
    layers.push({ rect: side.rectD(0, 2, CIRCLE_R, HOUSE.porch.d0), material: 'concrete' }); // front walk
    layers.push({ rect: side.rectD(-15.5, -9.5, 3.5, HOUSE.garage.d0), material: 'concrete' }); // driveway
    layers.push({ rect: side.rectD(8, 90, STREET_HALF, STREET_HALF + 1.5), material: 'concrete' }); // sidewalk
  }
  layers.push({ rect: { x0: -27, x1: 21, z0: -53, z1: 53 }, material: 'grass' });
  layers.push({ rect: { x0: -90, x1: 90, z0: -90, z1: 90 }, material: 'sand' });
  for (const { rect, material } of groundTiles(layers)) b.add([rect.x0, -0.5, rect.z0], [rect.x1, 0, rect.z1], material);
}

/** A vehicle: parts laid end to end along its length, turned `yaw` about its centre. */
function vehicle(b: Builder, center: readonly [number, number], yaw: number, parts: readonly { from: number; to: number; width: number; height: number; material: Material }[]): Solid[] {
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  const out: Solid[] = [];
  for (const p of parts) {
    const mid = (p.from + p.to) / 2;
    const s = yawBox({ center: [center[0] + ux * mid, p.height / 2, center[1] + uz * mid], size: [p.to - p.from, p.height, p.width], yaw, material: p.material });
    b.solids.push(s);
    out.push(s);
  }
  return out;
}

const BUS = { center: [5.4, 2.2] as const, yaw: 0.28, length: 12.2 };

function buildStreet(b: Builder): void {
  // The school bus, nose to the east: body and engine hood.
  const half = BUS.length / 2;
  vehicle(b, BUS.center, BUS.yaw, [
    { from: -half, to: half - 1.8, width: 2.5, height: 3.1, material: 'sheetMetal' },
    { from: half - 1.8, to: half, width: 2.2, height: 1.45, material: 'metal' },
  ]);
  // The moving van, its cab toward the pickup.
  vehicle(b, [-6.3, -3.0], 0.05, [
    { from: -4.2, to: 1.8, width: 2.5, height: 3.4, material: 'sheetMetal' },
    { from: 1.8, to: 3.6, width: 2.3, height: 2.3, material: 'metal' },
    { from: 3.6, to: 4.4, width: 2.0, height: 1.3, material: 'metal' },
  ]);
  // The pickup truck.
  vehicle(b, [2.2, -3.6], -0.1, [
    { from: -2.7, to: -0.4, width: 2.0, height: 1.0, material: 'sheetMetal' },
    { from: -0.4, to: 1.3, width: 2.0, height: 1.8, material: 'metal' },
    { from: 1.3, to: 2.7, width: 1.9, height: 1.15, material: 'metal' },
  ]);
  // A station wagon parked across the street end.
  vehicle(b, [15.75, -0.75], Math.PI / 2 + 0.06, [{ from: -2.4, to: 2.4, width: 1.9, height: 1.45, material: 'sheetMetal' }]);
}

function buildYards(b: Builder): void {
  const north = new Side(b, -1);
  const south = new Side(b, 1);
  // North yard: a garden shed by the back fence and a picnic table.
  north.box(-5, 0, 48, -1, 2.4, 50.5, 'wood');
  north.box(-11, 0, 44.5, -9, 0.75, 45.5, 'wood');
  // South yard: a boat on its trailer, along the west fence.
  const boatAt = [-20.4, 36] as const;
  const boatYaw = 1.33;
  vehicle(b, boatAt, boatYaw, [{ from: -2.5, to: 2.5, width: 2.0, height: 0.5, material: 'metal' }]);
  const boat = yawBox({ center: [boatAt[0], 0.5 + 0.55, boatAt[1]], size: [4.8, 1.1, 1.9], yaw: boatYaw, material: 'wood' });
  b.solids.push(boat);
  south.box(-11, 0, 44.5, -9, 0.75, 45.5, 'wood');
}

/** Picket fences just inside the back-yard edges (far enough in that standing on one never touches the boundary), with posts at the corners. */
function buildFences(b: Builder): void {
  const inset = 0.45;
  for (const s of [-1, 1] as const) {
    // The back-yard edges, round the back from the east side path to the west side yard.
    const edge = NORTH_EDGE.slice(3, 12).map(([x, z]) => [x, s === -1 ? z : -z] as const);
    const inner = edge.map((_, i) => insetVertex(edge, i, inset));
    // Start clear of the house's back corner, where the first edge begins.
    const [f0, f1] = [inner[0]!, inner[1]!];
    const flen = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
    inner[0] = [f0[0] + ((f1[0] - f0[0]) / flen) * 0.8, f0[1] + ((f1[1] - f0[1]) / flen) * 0.8];
    for (let i = 0; i < inner.length - 1; i++) {
      const [ax, az] = inner[i]!;
      const [bx, bz] = inner[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      b.solids.push(yawBox({ center: [(ax + bx) / 2, 0.5, (az + bz) / 2], size: [len - 0.14, 1.0, 0.08], yaw, material: 'wood' }));
    }
    for (const [x, z] of inner) b.add([x - 0.07, 0, z - 0.07], [x + 0.07, 1.1, z + 0.07], 'wood');
  }
}

/** The unit normal of edge a-c that points into the playable area. */
function inwardNormal(a: readonly [number, number], c: readonly [number, number]): [number, number] {
  const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n: [number, number] = [-(c[1] - a[1]) / l, (c[0] - a[0]) / l];
  const mx = (a[0] + c[0]) / 2;
  const mz = (a[1] + c[1]) / 2;
  return inside(mx + n[0] * 0.1, mz + n[1] * 0.1) ? n : [-n[0], -n[1]];
}

/** Vertex i of a polyline along the edge, moved `inset` into the playable area (mitred, so each edge moves by `inset`). */
function insetVertex(line: readonly (readonly [number, number])[], i: number, inset: number): readonly [number, number] {
  const p = line[i]!;
  const prev = line[i - 1];
  const next = line[i + 1];
  const ns = [prev ? inwardNormal(prev, p) : null, next ? inwardNormal(p, next) : null].filter((n): n is [number, number] => n !== null);
  if (ns.length === 1) return [p[0] + ns[0]![0] * inset, p[1] + ns[0]![1] * inset];
  const [n1, n2] = ns as [[number, number], [number, number]];
  const k = inset / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
  return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
}

/** Player clip along every edge of the playable area, from the ground into the sky, just outside the edge. */
function buildBoundary(b: Builder): void {
  const n = PLAY_AREA.length;
  const thickness = 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = PLAY_AREA[i]!;
    const [bx, bz] = PLAY_AREA[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    // Outward normal: the side the polygon's inside is not on.
    let nx = -dz;
    let nz = dx;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (inside(mx + nx * 0.1, mz + nz * 0.1)) {
      nx = -nx;
      nz = -nz;
    }
    const yaw = Math.atan2(-dz, dx);
    b.hidden.push(
      yawBox({
        center: [mx + (nx * thickness) / 2, SKY / 2 - 1, mz + (nz * thickness) / 2],
        size: [len + thickness, SKY, thickness],
        yaw,
        material: 'concrete',
        blocks: 'players',
      }),
    );
  }
}

function inside(x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = PLAY_AREA.length - 1; i < PLAY_AREA.length; j = i++) {
    const [xi, zi] = PLAY_AREA[i]!;
    const [xj, zj] = PLAY_AREA[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Team spawns in each back yard (distance, x), facing the house. */
const YARD_SPAWNS: readonly (readonly [number, number])[] = [
  [-18, 38],
  [-13.5, 39.5],
  [-9, 41],
  [-4, 40],
  [0.5, 38.5],
  [-2, 45],
  [-7.5, 45.5],
  [-12, 44.5],
];

function spawnSets(): { ffa: SpawnPoint[]; teams: [SpawnPoint[], SpawnPoint[]] } {
  const team = (s: -1 | 1) => YARD_SPAWNS.map(([x, d]): SpawnPoint => ({ position: [x, 0, s * d], yaw: faceCentre(x, s * d) }));
  const ffa: SpawnPoint[] = [];
  for (const s of [-1, 1] as const) {
    for (const [x, d] of [
      [-18, 38],
      [-4, 40],
      [-7.5, 45.5],
      [-20.5, 24], // west side yard
      [8.5, 18.5], // east side path
      [-19, 6], // front lawn, west
      [16.5, 6.5], // the sidewalk by the street end
    ] as const) {
      ffa.push({ position: [x, 0, s * d], yaw: faceCentre(x, s * d) });
    }
  }
  return { ffa, teams: [team(-1), team(1)] };
}

function indoorZones(): IndoorZone[] {
  const zones: IndoorZone[] = [];
  const M = HOUSE.main;
  const G = HOUSE.garage;
  for (const [s, name] of [
    [-1, 'north'],
    [1, 'south'],
  ] as const) {
    const zr = (d0: number, d1: number): [number, number] => [Math.min(s * d0, s * d1), Math.max(s * d0, s * d1)];
    const [a, c] = zr(M.d0, M.d1);
    const [ga, gc] = zr(G.d0, G.d1);
    zones.push({ name: `${name} house`, min: [M.x0, 0, a], max: [M.x1, UPPER_FLOOR, c] });
    zones.push({ name: `${name} upstairs`, min: [M.upperX0, UPPER_FLOOR, a], max: [M.x1, UPPER_TOP, c] });
    zones.push({ name: `${name} garage`, min: [G.x0, 0, ga], max: [G.x1, UPPER_FLOOR, gc] });
  }
  return zones;
}

const EYE = 1.6;

function referenceSpots(): CameraSpot[] {
  const spots: CameraSpot[] = [];
  for (const [s, name] of [
    [-1, 'north'],
    [1, 'south'],
  ] as const) {
    const toStreet = s === -1 ? LOOK.south : LOOK.north;
    spots.push({ name: `${name} spawn`, position: [-4, EYE, s * 40], yaw: faceCentre(-4, s * 40), pitch: -0.05 });
    spots.push({ name: `${name} window`, position: [2.25, UPPER_FLOOR + EYE, s * 15.2], yaw: toStreet, pitch: -0.12 });
    spots.push({ name: `${name} roof`, position: [2, HOUSE.roof.mainPeak + EYE, s * 20], yaw: toStreet, pitch: -0.3 });
    spots.push({ name: `${name} garage`, position: [-12.5, EYE, s * 18.5], yaw: toStreet, pitch: 0 });
    spots.push({ name: `${name} deck`, position: [-3, UPPER_FLOOR + EYE, s * 34], yaw: faceCentre(-3, s * 34), pitch: -0.1 });
    spots.push({ name: `${name} living room`, position: [4.5, EYE, s * 23], yaw: toStreet, pitch: 0 });
  }
  spots.push({ name: 'bus', position: [3, EYE, 8.2], yaw: LOOK.east + 0.35, pitch: 0 });
  spots.push({ name: 'cul-de-sac', position: [-3, EYE, 0.6], yaw: LOOK.east, pitch: 0 });
  spots.push({ name: 'street end', position: [18.5, EYE, 2.5], yaw: LOOK.west, pitch: -0.02 });
  spots.push({ name: 'overview', position: [-30, 34, 0], yaw: LOOK.east, pitch: -0.75 });
  return spots;
}

/** Through the north house top to bottom, across the cul-de-sac, through the south house and round the west yards. */
function benchmarkPath(): CameraKey[] {
  const k = (x: number, y: number, z: number, yaw: number, pitch = 0): CameraKey => ({ position: [x, y, z], yaw, pitch });
  const up = UPPER_FLOOR + EYE;
  return [
    k(-4, EYE, -44, LOOK.south),
    k(-11, EYE, -40, LOOK.south),
    k(-13.5, EYE, -34.5, LOOK.east),
    k(-6.5, up, -34.5, LOOK.east),
    k(0.45, up, -34, LOOK.south),
    k(0.45, up, -29, LOOK.south),
    k(3.45, up, -25, LOOK.south),
    k(3.45, up, -22, LOOK.south),
    k(2.25, up, -15.6, LOOK.south),
    k(-0.2, up, -22.6, LOOK.west),
    k(-1.4, up, -22.6, LOOK.south),
    k(-1.4, EYE, -15.3, LOOK.south),
    k(0.95, EYE, -14.6, LOOK.south),
    k(0.95, EYE, -11, LOOK.south),
    k(-2, EYE, 0.8, LOOK.east),
    k(10, EYE, -0.5, LOOK.east),
    k(14, EYE, 6, LOOK.south),
    k(0.95, EYE, 11, LOOK.south),
    k(0.95, EYE, 15, LOOK.south),
    k(0.3, EYE, 23, LOOK.south),
    k(-3.5, EYE, 26, LOOK.south),
    k(-3.55, EYE, 33.5, LOOK.south),
    k(-10, EYE, 42, LOOK.west),
    k(-17.5, EYE, 31, LOOK.north),
    k(-20.5, EYE, 18, LOOK.north),
    k(-20, EYE, 0, LOOK.north),
    k(-20.5, EYE, -18, LOOK.north),
    k(-20, EYE, -34, LOOK.east),
    k(-4, EYE, -44, LOOK.south),
  ];
}

/** A slow circle above the town, looking in at the cul-de-sac. */
function flyThrough(): CameraKey[] {
  const keys: CameraKey[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 42;
    const z = Math.cos(a) * 52;
    const y = 16 + Math.sin(a * 2) * 3;
    keys.push({ position: [x, y, z], yaw: faceCentre(x, z), pitch: -Math.atan2(y - 2, Math.hypot(x, z)) });
  }
  return keys;
}

/** Distance along a ray to the first solid that stops bullets, or NaN. */
function rayDistance(world: World, from: Vec3, dir: Vec3, max = 80): number {
  const to: Vec3 = [from[0] + dir[0] * max, from[1] + dir[1] * max, from[2] + dir[2] * max];
  const hit = raycastWorld(world, from, to);
  return hit ? hit.t * max : Number.NaN;
}

/** The map's own value for every reference entry, measured from its solids. */
function measure(solids: readonly Solid[]): Measured[] {
  const world = createWorld(solids);
  const y = 1.5;
  // House width: in from the west side yard and in from the east side path, at the garage partition's depth.
  const d = -HOUSE.garage.partition - 0.5;
  const west = -30 + rayDistance(world, [-30, y, d], [1, 0, 0]);
  const east = 30 - rayDistance(world, [30, y, d], [-1, 0, 0]);
  // Depth: in from the front lawn and in from the back yard, beside the den's windows and the deck stairs.
  const front = -(8 + rayDistance(world, [-6.5, y, -8], [0, 0, -1]));
  const back = -(45 - rayDistance(world, [-6.5, y, -45], [0, 0, 1]));
  const southFront = 8 + rayDistance(world, [-6.5, y, 8], [0, 0, 1]);
  const garageFront = -(8 + rayDistance(world, [-16.5, y, -8], [0, 0, -1]));
  const garageBack = -(45 - rayDistance(world, [-16.5, y, -45], [0, 0, 1]));
  // The front door: up from the threshold to the head.
  const door = rayDistance(world, [HOUSE.frontDoor.x0 + DOOR_W / 2, 0.01, -HOUSE.main.d0], [0, 1, 0], 5) + 0.01;
  // The cul-de-sac: the asphalt strip widest across x.
  const asphalt = solids.filter((s) => s.material === 'asphalt' && s.max[1] === 0 && s.min[2] >= -CIRCLE_R - 1e-6 && s.max[2] <= CIRCLE_R + 1e-6);
  const radius = Math.max(...asphalt.map((s) => -s.min[0]));
  // The street end opening, the far ends and the bus, from the boundary and vehicle solids.
  const clipXs = PLAY_AREA.map(([x]) => x);
  const streetEnd = PLAY_AREA.filter(([x]) => x === Math.max(...clipXs)).map(([, z]) => z);
  const bus = solids.filter((s) => s.orientation && Math.abs(s.orientation.yaw - BUS.yaw) < 1e-9);
  const busAxis: Vec3 = [Math.cos(BUS.yaw), 0, -Math.sin(BUS.yaw)];
  const along = bus.flatMap((s) => {
    const o = s.orientation!;
    const c = o.center[0] * busAxis[0] + o.center[2] * busAxis[2];
    return [c - o.half[0], c + o.half[0]];
  });
  return [
    { id: 'house.width', value: east - west },
    { id: 'house.depth', value: front - back },
    { id: 'garage.depth', value: garageFront - garageBack },
    { id: 'house.frontGap', value: southFront - front },
    { id: 'door.height', value: door },
    { id: 'culdesac.radius', value: radius },
    { id: 'street.width', value: Math.max(...streetEnd) - Math.min(...streetEnd) },
    { id: 'map.northExtent', value: -Math.min(...PLAY_AREA.map(([, z]) => z)) },
    { id: 'map.westExtent', value: -Math.min(...clipXs) },
    { id: 'map.eastExtent', value: Math.max(...clipXs) },
    { id: 'bus.length', value: Math.max(...along) - Math.min(...along) },
  ];
}

export function buildSurvivalTown(): MapDefinition {
  const b = new Builder();
  const sides = [new Side(b, -1), new Side(b, 1)];
  buildGround(b, sides);
  for (const side of sides) buildHouse(side);
  buildStreet(b);
  buildYards(b);
  buildFences(b);
  buildBoundary(b);
  const spawns = spawnSets();
  const dummies: PlayerSpawn[] = [];
  return {
    id: 'survival-town',
    name: 'Survival Town',
    solids: b.solids,
    hiddenSolids: b.hidden,
    ramps: [],
    labels: [],
    spawns,
    offlineSpawn: spawns.teams[0][3]!,
    overview: { name: 'overview', position: [-30, 34, 0], yaw: LOOK.east, pitch: -0.75 },
    dummies,
    indoorZones: indoorZones(),
    referenceSpots: referenceSpots(),
    benchmarkPath: benchmarkPath(),
    flyThrough: flyThrough(),
    playArea: PLAY_AREA,
    measurements: measure(mapSolids({ solids: b.solids, hiddenSolids: b.hidden })),
  };
}

export { HOUSE, UPPER_FLOOR, UPPER_TOP, CIRCLE_R };
