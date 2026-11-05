import type { Material, TerrainData } from '@duty-shooter/fps-core';
import { DL_PADS } from './zero-island-dustlands-plan';
import { GZ_PADS } from './zero-island-ground-zero-plan';
import { RH_PADS } from './zero-island-harbor-plan';
import type { Pad } from './zero-island-region';

/**
 * Zero Island's ground, sculpted in code from `reference/island-map.png`:
 * three land masses in a wadeable sea, the Frostbite massif, the crater, the
 * Dustlands' mesas, a stream, and a railway and roads cut in as graded
 * routes. Game coordinates: metres, x east, z south. Height 0 is the sea.
 *
 * Everything that reaches a height uses only exact arithmetic (no sin, cos or
 * pow), so every JavaScript engine computes the same corners and a client
 * never predicts on other ground than its server's.
 */

export type RegionId = 'ground-zero' | 'the-dustlands' | 'frostbite-peaks' | 'mutant-jungle' | 'neon-city' | 'rogue-harbor';
export const REGION_IDS: readonly RegionId[] = ['ground-zero', 'the-dustlands', 'frostbite-peaks', 'mutant-jungle', 'neon-city', 'rogue-harbor'];

type P = readonly [x: number, z: number];

/** A Region's dense place, a disc of about Crash's size. */
export interface Core {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** The level its ground is brought to, or null where the ground already suits (the crater's floor). */
  readonly level: number | null;
}

/** Where a pixel of `reference/island-map.png` lies: the art is a tilted view, so it's stretched north to south. */
const art = (px: number, py: number): P => [(px - 510) * 1.62, (py - 285) * 2.42];

export const CORES: Readonly<Record<RegionId, Core>> = {
  'ground-zero': { name: 'Ground Zero', x: 8, z: -42, radius: 50, level: null },
  'the-dustlands': { name: 'The Dustlands', x: -215, z: 239, radius: 48, level: 7 },
  'frostbite-peaks': { name: 'Frostbite Peaks', x: -75, z: -330, radius: 48, level: 48 },
  'mutant-jungle': { name: 'Mutant Jungle', x: 170, z: -401, radius: 50, level: 11 },
  'neon-city': { name: 'Neon City', x: 410, z: 87, radius: 48, level: null },
  'rogue-harbor': { name: 'Rogue Harbor', x: 95, z: 401, radius: 48, level: null },
};

/** The peak nobody reaches: above a cliff all round it. */
export const SUMMIT = { x: -215, z: -450, height: 150, cliffFoot: 125, cliffTop: 100 } as const;
/** Everything nearer the peak than this is out of reach. */
export const SUMMIT_RADIUS = SUMMIT.cliffTop - 5;

const SEA_FLOOR = -6;
/** How deep the sea gets inside the Boundary: enough to wade, too shallow to matter. */
const SHALLOWS = -0.6;
/** How far the Boundary stands off the coast. */
const OFFSHORE = 24;

export const CRATER = { x: 8, z: -42, floor: 50, rim: 120, skirt: 205, floorHeight: 3.4, rimHeight: 16 } as const;

/** The land, as the art draws it; each outline is smoothed into a coast below. */
const MAIN_COAST: readonly P[] = [
  [122, 345], [150, 290], [192, 255], [186, 205], [212, 160], [250, 115], [300, 72], [345, 30], [400, 42], [470, 80], [510, 92],
  [545, 66], [640, 50], [730, 70], [790, 120], [816, 180], [795, 214], [745, 212], [700, 236], [655, 262], [640, 310], [625, 345],
  [560, 362], [520, 375], [470, 395], [440, 425], [395, 460], [335, 508], [285, 492], [265, 445], [205, 440], [150, 405],
].map(([x, y]) => art(x!, y!));
const NEON_COAST: readonly P[] = [
  [674, 292], [702, 262], [760, 238], [830, 236], [885, 255], [905, 320], [880, 370], [830, 416], [765, 426], [716, 392], [676, 350],
].map(([x, y]) => art(x!, y!));
const HARBOR_COAST: readonly P[] = [
  [470, 445], [505, 412], [560, 392], [640, 378], [680, 395], [702, 430], [680, 476], [630, 484], [570, 490], [530, 522], [480, 500],
].map(([x, y]) => art(x!, y!));

/** The grid: 1 m cells, so a bank can be mantled anywhere (ADR 0007). */
const X0 = -720;
const Z0 = -680;
const COLUMNS = 1440;
const ROWS = 1340;
const STRIDE = COLUMNS + 1;
/** Metres a side of the coarse grids the coast's distance is kept in. */
const COARSE = 8;
const CW = Math.ceil(COLUMNS / COARSE) + 1;
const CH = Math.ceil(ROWS / COARSE) + 1;

const smooth = (t: number) => {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const distance = (x: number, z: number, px: number, pz: number) => Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));

function lattice(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
}

/** Smooth value noise from -1 to 1, one feature about `size` metres across. */
function noise(x: number, z: number, size: number, seed: number): number {
  const gx = x / size;
  const gz = z / size;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const u = smooth(gx - i);
  const v = smooth(gz - j);
  return mix(mix(lattice(i, j, seed), lattice(i + 1, j, seed), u), mix(lattice(i, j + 1, seed), lattice(i + 1, j + 1, seed), u), v);
}

/** A closed outline rounded off (Catmull-Rom, a few points a span). */
function rounded(points: readonly P[], closed: boolean, per = 4): P[] {
  const n = points.length;
  const at = (i: number) => (closed ? points[(i + n) % n]! : points[Math.min(n - 1, Math.max(0, i))]!);
  const out: P[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const curve = (k: 0 | 1) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
      out.push([curve(0), curve(1)]);
    }
  }
  if (!closed) out.push(points[n - 1]!);
  return out;
}

function within(polygon: readonly P[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Distance from a point to a segment. */
function toSegment(x: number, z: number, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const k = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return distance(x, z, a[0] + dx * k, a[1] + dz * k);
}

/** Signed distance to an outline, on the coarse grid: positive inside. */
function signedField(polygon: readonly P[]): Float32Array {
  const field = new Float32Array(CW * CH);
  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const x = X0 + i * COARSE;
      const z = Z0 + j * COARSE;
      let best = Infinity;
      for (let s = 0, t = polygon.length - 1; s < polygon.length; t = s++) best = Math.min(best, toSegment(x, z, polygon[t]!, polygon[s]!));
      field[j * CW + i] = within(polygon, x, z) ? best : -best;
    }
  }
  return field;
}

function sample(field: Float32Array, x: number, z: number): number {
  const gx = Math.min(CW - 1.001, Math.max(0, (x - X0) / COARSE));
  const gz = Math.min(CH - 1.001, Math.max(0, (z - Z0) / COARSE));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const u = gx - i;
  const v = gz - j;
  const c = j * CW + i;
  return mix(mix(field[c]!, field[c + 1]!, u), mix(field[c + CW]!, field[c + CW + 1]!, u), v);
}

/** The Boundary: rays from the middle, each out to just past the last land on it. */
function hullOf(land: (x: number, z: number) => number): P[] {
  const n = 24;
  // Round the square of directions, going round it once.
  const ordered = [
    ...Array.from({ length: n }, (_, i): P => [n / 2 - i, -n / 2]),
    ...Array.from({ length: n }, (_, i): P => [-n / 2, i - n / 2]),
    ...Array.from({ length: n }, (_, i): P => [i - n / 2, n / 2]),
    ...Array.from({ length: n }, (_, i): P => [n / 2, n / 2 - i]),
  ].map(([x, z]): P => {
    const l = Math.sqrt(x * x + z * z);
    return [x / l, z / l];
  });
  const reach = ordered.map(([x, z]) => {
    let last = 0;
    for (let r = 0; r < 800; r += 6) if (land(x * r, z * r) > -OFFSHORE) last = r;
    return last;
  });
  const m = reach.length;
  // No ray dips far inside its neighbours, which would cut across a bay.
  const eased = reach.map((r, i) => Math.max(r, (reach[(i + m - 1) % m]! + reach[(i + 1) % m]!) / 2 - 8));
  return ordered.map(([x, z], i) => [x * eased[i]!, z * eased[i]!]);
}

interface Mesa {
  readonly x: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
}
/** The Dustlands' layered mesas, where the art stacks them. */
const MESAS: readonly Mesa[] = [
  { x: art(175, 330)[0], z: art(175, 330)[1], rx: 90, rz: 105 },
  { x: art(275, 300)[0], z: art(275, 300)[1], rx: 78, rz: 50 },
  { x: art(235, 412)[0], z: art(235, 412)[1], rx: 76, rz: 52 },
  { x: art(335, 462)[0], z: art(335, 462)[1], rx: 76, rz: 64 },
];

/** How high a mesa stands `m` metres inside its edge: a shelf a player can mantle, then two tall layers. */
function mesaRise(m: number): number {
  if (m < 1) return 1.6 * m;
  if (m < 15) return 1.6;
  if (m < 17) return mix(1.6, 9, (m - 15) / 2);
  if (m < 35) return 9;
  if (m < 37) return mix(9, 17, (m - 35) / 2);
  return 17;
}

/** The massif's own height `r` metres from the peak, or null past its foot. */
function massif(r: number, around: number): number {
  const s = SUMMIT;
  if (r >= 430) return around;
  if (r >= 230) return mix(46, around, smooth((r - 230) / 200));
  if (r >= s.cliffFoot) return mix(52, 46, (r - s.cliffFoot) / (230 - s.cliffFoot));
  if (r >= s.cliffTop) return mix(100, 52, (r - s.cliffTop) / (s.cliffFoot - s.cliffTop));
  return mix(s.height, 100, r / s.cliffTop);
}

/** The ground before routes, rivers and the shore. */
function inland(x: number, z: number): number {
  let y = 5 + 3 * noise(x, z, 140, 11) + 0.8 * noise(x, z, 37, 12);
  // The jungle's hills.
  const hills = smooth((x - 40) / 120) * smooth((-z - 110) / 120);
  if (hills > 0) y += hills * (7 + 7 * noise(x, z, 95, 13) + 2.5 * noise(x, z, 33, 14));
  // The crater, a bowl with a raised rim.
  const r = distance(x, z, CRATER.x, CRATER.z) + 5 * noise(x, z, 60, 15);
  if (r < CRATER.rim) y = mix(CRATER.floorHeight, CRATER.rimHeight, smooth((r - CRATER.floor) / (CRATER.rim - CRATER.floor)));
  else if (r < CRATER.skirt) y = mix(CRATER.rimHeight, y, smooth((r - CRATER.rim) / (CRATER.skirt - CRATER.rim)));
  // The mesas.
  for (const m of MESAS) {
    const dx = (x - m.x) / m.rx;
    const dz = (z - m.z) / m.rz;
    const q = dx * dx + dz * dz;
    if (q < 2.2) {
      const edge = (1 - Math.sqrt(q)) * (m.rx < m.rz ? m.rx : m.rz) + 14 * noise(x, z, 50, 16) + 4 * noise(x, z, 17, 17);
      if (edge > 0) y += mesaRise(edge);
    }
  }
  // Frostbite.
  return massif(distance(x, z, SUMMIT.x, SUMMIT.z) + 7 * noise(x, z, 80, 18), y);
}

/** A line cut into the ground at a steady grade: a railway, a road, a trail, or a stream's bed. */
interface Route {
  readonly points: readonly P[];
  /** Half the flat width. */
  readonly half: number;
  /** The steepest rise it takes, per metre. */
  readonly grade: number;
  /** The heights its ends are held to (a bridge's deck, a mesa's top), or none. */
  readonly from?: number;
  readonly to?: number;
  readonly surface: Surface;
}

/** A place on a route's centre line. */
export interface RoutePoint {
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

/** A span over a channel, carrying a road or the railway from one coast to the next. */
export interface Bridge {
  readonly name: string;
  readonly from: P;
  readonly to: P;
  /** Its deck's top. */
  readonly deck: number;
  readonly width: number;
}

/** Decks stand high enough to wade under. */
const DECK = 4;
/** The railway's two bridges stand higher: the ring runs well above the sea, and a train can't drop to it. */
const RAIL_DECK = 7;
export const BRIDGES: readonly Bridge[] = [
  { name: 'Dustlands to Harbor', from: [-126, 323], to: [-44, 384], deck: DECK, width: 6 },
  { name: 'Ground Zero to Harbor', from: [40, 198], to: [66, 305], deck: RAIL_DECK, width: 8 },
  { name: 'Neon to Harbor', from: [340, 312], to: [262, 321], deck: DECK, width: 6 },
  { name: 'Ground Zero to Neon', from: [200, 93], to: [300, 107], deck: RAIL_DECK, width: 8 },
  { name: 'Jungle to Neon', from: [370, -221], to: [404, -107], deck: DECK, width: 6 },
];
const [dustHarbor, zeroHarbor, neonHarbor, zeroNeon, jungleNeon] = BRIDGES as [Bridge, Bridge, Bridge, Bridge, Bridge];

/** The surfaces the ground wears: how its material sounds, the colour `TERRAIN_COLORS` tints it, and the photo layer it wears (`TERRAIN_LAYERS`). */
const SURFACES = {
  meadow: ['grass', 0x6d7a45, 'meadow'],
  beach: ['sand', 0xcbb389, 'beach'],
  dust: ['sand', 0xb48656, 'dust'],
  rock: ['dirt', 0x8e5a3a, 'rock'],
  snow: ['dirt', 0xdfe6ee, 'snow'],
  ice: ['gravel', 0x8e9eae, 'ice'],
  jungle: ['grass', 0x2f5a3b, 'jungle'],
  ash: ['dirt', 0x7a7063, 'ash'],
  city: ['asphalt', 0x5c5b66, 'asphalt'],
  dock: ['concrete', 0x77766f, 'dock'],
  ballast: ['gravel', 0x6b6358, 'ballast'],
  road: ['asphalt', 0x45454a, 'asphalt'],
  bed: ['dirt', 0x6d6a55, 'bed'],
  // Scorched concrete, what the Regions' built pieces stand on (ticket 17).
  slab: ['concrete', 0x8a8378, 'slab'],
} as const satisfies Record<string, readonly [Material, number, string]>;
type Surface = keyof typeof SURFACES;
const SURFACE_NAMES = Object.keys(SURFACES) as Surface[];
const surfaceIndex = (s: Surface) => SURFACE_NAMES.indexOf(s);

/** What each palette entry looks like (an sRGB colour), in the terrain's palette order. */
export const TERRAIN_COLORS: readonly number[] = SURFACE_NAMES.map((s) => SURFACES[s][1]);
/** The photo layer each palette entry wears, in the same order. */
export const TERRAIN_LAYERS: readonly string[] = SURFACE_NAMES.map((s) => SURFACES[s][2]);

const RING_RADIUS = 168;
/** The ring round the crater, from the factory on the rim round to it again. */
function ringPoints(): P[] {
  const out: P[] = [];
  const n = 16;
  // Half-angle tangents give a circle's points without trigonometry.
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i) / n;
    const c = (1 - t * t) / (1 + t * t);
    const s = (2 * t) / (1 + t * t);
    out.push([CRATER.x + RING_RADIUS * c, CRATER.z + RING_RADIUS * s]);
  }
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i) / n;
    const c = (1 - t * t) / (1 + t * t);
    const s = (2 * t) / (1 + t * t);
    out.push([CRATER.x - RING_RADIUS * c, CRATER.z - RING_RADIUS * s]);
  }
  return out;
}

const RAIL_GRADE = 0.07;
const RAIL = { half: 2.5, grade: RAIL_GRADE, surface: 'ballast' } as const;
const ROAD = { half: 3.5, grade: 0.09, surface: 'road' } as const;
const TRAIL = { half: 3, grade: 0.2, surface: 'rock' } as const;

/** Where the railway starts each line: on the ring, on its way round. */
const ringAt = (c: number, s: number): P => {
  const l = Math.sqrt(c * c + s * s);
  return [CRATER.x + (RING_RADIUS * c) / l, CRATER.z + (RING_RADIUS * s) / l];
};

/** The railway: the ring first, then a line out to each Region. Each line's first point is on the ring. */
const RAILWAY: readonly Route[] = [
  { ...RAIL, points: [...ringPoints(), ringPoints()[0]!] },
  { ...RAIL, points: [ringAt(-0.75, -0.65), [-205, -221], [-285, -250], [-350, -221], [-395, -175]] },
  { ...RAIL, points: [ringAt(-1, 0.25), [-235, 47], [-300, 130], [-250, 175], [-215, 175]] },
  { ...RAIL, points: [ringAt(0.55, -0.85), [130, -250], [150, -297], [158, -332]] },
  { ...RAIL, points: [ringAt(0.97, 0.25), zeroNeon.from], to: RAIL_DECK },
  { ...RAIL, points: [zeroNeon.to, [345, 107], [375, 93]], from: RAIL_DECK },
  { ...RAIL, points: [ringAt(0.22, 0.97), zeroHarbor.from], to: RAIL_DECK },
  { ...RAIL, points: [zeroHarbor.to, [70, 342], [108, 366], [140, 372]], from: RAIL_DECK },
];

const ROADS: readonly Route[] = [
  { ...ROAD, points: [[-175, 285], dustHarbor.from], to: DECK },
  { ...ROAD, points: [dustHarbor.to, [10, 396], [48, 401]], from: DECK },
  { ...ROAD, points: [[128, 401], [200, 349], neonHarbor.to], to: DECK },
  { ...ROAD, points: [neonHarbor.from, [370, 233], [395, 145]], from: DECK },
  { ...ROAD, points: [[218, -401], [300, -332], jungleNeon.from], to: DECK },
  { ...ROAD, points: [jungleNeon.to, [420, -47], [412, 33]], from: DECK },
];

/** The Harbor's airstrip, a flat run of road beside the cross-channel road. */
export const RUNWAY = { from: [188, 268], to: [258, 372], half: 13 } as const;

/** The way up the two mesas that can be climbed, each from the canyon floor to its top. */
const TRAILS: readonly Route[] = [
  { ...TRAIL, points: [[-265, 111], [-290, 64], [-345, 47], [-368, 33]] },
  { ...TRAIL, points: [[-200, 349], [-210, 401], [-250, 436], [-268, 428]] },
];

/** The Jungle's stream, from its Core down to the channel. */
const STREAM: Route = { points: [[208, -370], art(640, 178), art(692, 204), art(662, 228), art(682, 250), art(686, 262)], half: 5, grade: 0.03, surface: 'bed', to: 0 };

/** The stream's bed lies this far under its surface. */
const STREAM_DEPTH = 0.65;

interface Fields {
  readonly main: Float32Array;
  readonly neon: Float32Array;
  readonly harbor: Float32Array;
  readonly hull: Float32Array;
  readonly boundary: readonly P[];
}

let fields: Fields | null = null;
function coast(): Fields {
  if (fields) return fields;
  const main = signedField(rounded(MAIN_COAST, true));
  const neon = signedField(rounded(NEON_COAST, true));
  const harbor = signedField(rounded(HARBOR_COAST, true));
  const boundary = hullOf((x, z) => Math.max(sample(main, x, z), sample(neon, x, z), sample(harbor, x, z)));
  fields = { main, neon, harbor, hull: signedField(boundary), boundary };
  return fields;
}

/** The Boundary, (x, z): out in the shallows all round the island. */
export const zeroIslandBoundary = (): readonly P[] => coast().boundary;

const ANCHORS: readonly (readonly [RegionId, number, number])[] = [
  ['ground-zero', 8, -42],
  ['the-dustlands', -345, 221],
  ['frostbite-peaks', -200, -349],
  ['mutant-jungle', 230, -384],
];

/** The Region at (x, z): an island of its own, or the nearest of the four on the main one. */
export function regionAt(x: number, z: number): RegionId {
  const f = coast();
  if (sample(f.neon, x, z) > -30 && x > 150) return 'neon-city';
  if (sample(f.harbor, x, z) > -30 && z > 150) return 'rogue-harbor';
  const wx = x + 26 * noise(x, z, 120, 21);
  const wz = z + 26 * noise(x, z, 120, 22);
  let best: RegionId = 'ground-zero';
  let near = Infinity;
  for (const [id, ax, az] of ANCHORS) {
    // Ground Zero reaches about as far as the skirt round its crater.
    const d = distance(wx, wz, ax, az) * (id === 'ground-zero' ? 0.8 : 1);
    if (d < near) {
      near = d;
      best = id;
    }
  }
  return best;
}

const corner = (i: number, j: number) => j * STRIDE + i;

/** Brings the ground round a Core to its level, easing back over `blend` metres. */
function level(heights: Float32Array, core: Core, blend: number): void {
  if (core.level === null) return;
  const reach = core.radius + blend;
  const i0 = Math.max(0, Math.floor(core.x - reach - X0));
  const i1 = Math.min(COLUMNS, Math.ceil(core.x + reach - X0));
  const j0 = Math.max(0, Math.floor(core.z - reach - Z0));
  const j1 = Math.min(ROWS, Math.ceil(core.z + reach - Z0));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = corner(i, j);
      const k = smooth((distance(X0 + i, Z0 + j, core.x, core.z) - core.radius) / blend);
      heights[c] = mix(core.level, heights[c]!, k);
    }
  }
}

/** Every Region's pads (see `zero-island-region.ts`): ground levelled for what's built on it. */
const PADS: readonly Pad[] = [...GZ_PADS, ...DL_PADS, ...RH_PADS];

/** Metres from (x, z) to a pad's rectangle, 0 inside it. */
function toPad(pad: Pad, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - pad.x) - pad.halfX, 0);
  const dz = Math.max(Math.abs(z - pad.z) - pad.halfZ, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Brings the ground under each pad to its level, easing back over the pad's blend. */
function levelPads(heights: Float32Array): void {
  for (const pad of PADS) {
    const at = pad.level ?? heightOn(heights, pad.x, pad.z);
    const reach = pad.blend;
    const i0 = Math.max(0, Math.floor(pad.x - pad.halfX - reach - X0));
    const i1 = Math.min(COLUMNS, Math.ceil(pad.x + pad.halfX + reach - X0));
    const j0 = Math.max(0, Math.floor(pad.z - pad.halfZ - reach - Z0));
    const j1 = Math.min(ROWS, Math.ceil(pad.z + pad.halfZ + reach - Z0));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = smooth(toPad(pad, X0 + i, Z0 + j) / reach);
        const c = corner(i, j);
        heights[c] = mix(at, heights[c]!, k);
      }
    }
  }
}

/** The pad a cell's middle lies on that wears its own surface, if any. */
function padSurface(x: number, z: number): Surface | null {
  for (const pad of PADS) if (pad.surface && toPad(pad, x, z) === 0) return pad.surface;
  return null;
}

/** How a Region's ground is folded (m): how high its ridges stand, how deep its gullies run, and how tight the folds lie. */
interface Folds {
  readonly ridge: number;
  readonly gully: number;
  readonly size: number;
}

/** Streets and docks stay level: their cover is built, not sculpted. */
const FOLDS: Readonly<Record<RegionId, Folds>> = {
  'ground-zero': { ridge: 2.8, gully: 2.2, size: 32 },
  'the-dustlands': { ridge: 3.6, gully: 2.6, size: 30 },
  'frostbite-peaks': { ridge: 3.2, gully: 2, size: 34 },
  'mutant-jungle': { ridge: 3, gully: 2.4, size: 26 },
  'neon-city': { ridge: 0, gully: 0, size: 32 },
  'rogue-harbor': { ridge: 0, gully: 0, size: 32 },
};

/** Metres between the points folds are worked out at: they're wider than this, and there are 1.8 million corners. */
const FOLD_STEP = 4;
/** A fold's half width, per metre of its height: no steeper than about 30 degrees, so they're walked over and not round. */
const FOLD_WIDTH = 2.6;
/** Ground this much steeper than walking stays as it is: a cliff or a mesa's face isn't made walkable or worse. */
const FOLD_SLOPE = 0.35;
/** The lowest a gully cuts: above the shore, so it stays dry and bots walk it. */
const FOLD_FLOOR = 0.8;
const BLAST_HEIGHT = 4.2;
const BLAST_WIDTH = 10;
const COS_A = 3 / 5;
const SIN_A = 4 / 5;
const COS_B = 5 / 13;
const SIN_B = 12 / 13;

/** Metres from (x, z) to the nearest line where noise of `size` crosses zero: lines that wander, with no end but each other. */
function toFoldLine(x: number, z: number, size: number, seed: number): number {
  const e = 2;
  const n = noise(x, z, size, seed);
  const dx = (noise(x + e, z, size, seed) - noise(x - e, z, size, seed)) / (2 * e);
  const dz = (noise(x, z + e, size, seed) - noise(x, z - e, size, seed)) / (2 * e);
  return Math.abs(n) / Math.max(Math.sqrt(dx * dx + dz * dz), 0.004);
}

/** One line of folds, `height` at its crest, with gaps where it breaks so more than one way leads through. */
function fold(x: number, z: number, height: number, size: number, seed: number): number {
  if (height === 0) return 0;
  const gap = smooth((noise(x, z, 37, seed + 1) + 0.3) / 0.3);
  if (gap === 0) return 0;
  return height * gap * smooth(1 - toFoldLine(x, z, size, seed) / (height * FOLD_WIDTH));
}

/** A ring round the crater `radius` metres out, broken by gaps. */
function blastRing(r: number, radius: number, x: number, z: number): number {
  const off = Math.abs(r - radius);
  return off >= BLAST_WIDTH ? 0 : BLAST_HEIGHT * smooth(1 - off / BLAST_WIDTH) * smooth((noise(x, z, 30, 37) + 0.35) / 0.2);
}

/**
 * Folds the land with ridges and gullies, the cheapest cover there is: they
 * break sightlines and draw nothing extra. Worked out on a coarse grid and
 * spread over the corners, before routes cut through and surfaces are painted.
 */
function foldGround(heights: Float32Array): void {
  const w = Math.ceil(COLUMNS / FOLD_STEP) + 1;
  const h = Math.ceil(ROWS / FOLD_STEP) + 1;
  const field = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = X0 + i * FOLD_STEP;
      const z = Z0 + j * FOLD_STEP;
      const y = heightOn(heights, x, z);
      if (y < 1.2) continue;
      const shore = smooth((y - 1.2) / 2.4);
      const rise = Math.max(Math.abs(heightOn(heights, x + 4, z) - heightOn(heights, x - 4, z)), Math.abs(heightOn(heights, x, z + 4) - heightOn(heights, x, z - 4))) / 8;
      const gentle = 1 - smooth((rise - FOLD_SLOPE) / 0.2);
      if (gentle === 0) continue;
      const id = regionAt(x, z);
      const { ridge, gully, size } = FOLDS[id];
      // Cores keep their level for what gets built on them; the crater's floor has no level, and gets ditches.
      let open = 1;
      for (const core of REGION_IDS) {
        const c = CORES[core];
        if (c.level !== null) open = Math.min(open, smooth((distance(x, z, c.x, c.z) - c.radius) / 16));
      }
      const blast = smooth((distance(x, z, CRATER.x, CRATER.z) - 16) / 10);
      const k = shore * gentle * open * blast;
      if (k === 0) continue;
      const [ax, az] = [COS_A * x + SIN_A * z, COS_A * z - SIN_A * x];
      const [bx, bz] = [COS_B * x - SIN_B * z, COS_B * z + SIN_B * x];
      const up = Math.max(fold(ax, az, ridge, size, 31), 0.8 * fold(bx, bz, ridge, size * 1.3, 33));
      const down = fold(bz, bx, gully, size * 1.15, 35);
      // Rings the blast threw up on the crater's slopes: a bowl looks across itself, and these break the view.
      const fromMiddle = distance(x, z, CRATER.x, CRATER.z) + 6 * noise(x, z, 44, 36);
      const thrown = id === 'ground-zero' ? Math.max(blastRing(fromMiddle, 74, x, z), blastRing(fromMiddle, 102, x, z)) : 0;
      field[j * w + i] = k * (Math.max(up, thrown) - down);
    }
  }
  for (let j = 0; j <= ROWS; j++) {
    const gz = (j * 1) / FOLD_STEP;
    const b = Math.min(h - 2, Math.floor(gz));
    const v = gz - b;
    for (let i = 0; i <= COLUMNS; i++) {
      const gx = i / FOLD_STEP;
      const a = Math.min(w - 2, Math.floor(gx));
      const u = gx - a;
      const c = b * w + a;
      const lift = mix(mix(field[c]!, field[c + 1]!, u), mix(field[c + w]!, field[c + w + 1]!, u), v);
      if (lift === 0) continue;
      const at = corner(i, j);
      heights[at] = Math.max(Math.min(heights[at]!, FOLD_FLOOR), heights[at]! + lift);
    }
  }
}

/** Reads the grid at (x, z), between corners. */
function heightOn(heights: Float32Array, x: number, z: number): number {
  const gx = Math.min(COLUMNS - 1.001, Math.max(0, x - X0));
  const gz = Math.min(ROWS - 1.001, Math.max(0, z - Z0));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const u = gx - i;
  const v = gz - j;
  const c = corner(i, j);
  return mix(mix(heights[c]!, heights[c + 1]!, u), mix(heights[c + STRIDE]!, heights[c + STRIDE + 1]!, u), v);
}

/** A route's centre line every few metres, with the heights it runs at. */
function trace(route: Route, heights: Float32Array): RoutePoint[] {
  const STEP = 4;
  const curve = route.points.length > 2 ? rounded(route.points, false, 8) : route.points;
  const line: P[] = [];
  for (let i = 0; i + 1 < curve.length; i++) {
    const [a, b] = [curve[i]!, curve[i + 1]!];
    const n = Math.max(1, Math.round(distance(a[0], a[1], b[0], b[1]) / STEP));
    for (let s = 0; s < n; s++) line.push([mix(a[0], b[0], s / n), mix(a[1], b[1], s / n)]);
  }
  line.push(curve[curve.length - 1]!);
  // Follow the ground, averaged over about 100 m so a bump doesn't reach the line.
  const raw = line.map(([x, z]) => heightOn(heights, x, z));
  const span = 12;
  const running = raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - span); k <= Math.min(raw.length - 1, i + span); k++) {
      sum += raw[k]!;
      n++;
    }
    return sum / n;
  });
  const last = running.length - 1;
  // An end that joins a line already cut starts from the ground there, which is that line.
  running[0] = route.from ?? raw[0]!;
  running[last] = route.to ?? raw[last]!;
  // Both ends stay where they were put; the grade is held between them.
  const clamp = (i: number, from: number, length: number) => {
    const most = route.grade * length;
    running[i] = Math.min(running[from]! + most, Math.max(running[from]! - most, running[i]!));
  };
  const seam = (i: number, j: number) => distance(line[i]![0], line[i]![1], line[j]![0], line[j]![1]);
  for (let i = 1; i < last; i++) clamp(i, i - 1, seam(i, i - 1));
  for (let i = last - 1; i > 0; i--) clamp(i, i + 1, seam(i, i + 1));
  return line.map(([x, z], i) => ({ x, z, y: running[i]! }));
}

/** How far either side a route's cutting may reach. */
const REACH = 42;

/**
 * Cuts a traced route into the ground: flat across its width, and sloped back
 * to the ground either side gently enough to stay walkable. `water`, for a
 * stream, also raises the surface along it.
 */
function cut(route: Route, line: readonly RoutePoint[], heights: Float32Array, cells: Uint8Array, water: Float32Array | null, scratch: { near: Float32Array; level: Float32Array }): void {
  const touched: number[] = [];
  const { near, level: at } = scratch;
  const reach = route.half + REACH;
  for (let n = 0; n + 1 < line.length; n++) {
    const a = line[n]!;
    const b = line[n + 1]!;
    const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach - X0));
    const i1 = Math.min(COLUMNS, Math.ceil(Math.max(a.x, b.x) + reach - X0));
    const j0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - reach - Z0));
    const j1 = Math.min(ROWS, Math.ceil(Math.max(a.z, b.z) + reach - Z0));
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = corner(i, j);
        const x = X0 + i;
        const z = Z0 + j;
        const k = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / length));
        const d = distance(x, z, a.x + dx * k, a.z + dz * k);
        if (d >= reach) continue;
        if (near[c] === 0) touched.push(c);
        if (near[c] === 0 || d + 1 < near[c]!) {
          near[c] = d + 1;
          at[c] = mix(a.y, b.y, k);
        }
      }
    }
  }
  const depth = water ? STREAM_DEPTH : 0;
  const surface = surfaceIndex(route.surface);
  for (const c of touched) {
    const d = near[c]! - 1;
    const y = at[c]! - depth;
    const ground = heights[c]!;
    // Gentle enough that a cutting's sides stay under the slope limit.
    const shoulder = Math.min(REACH, Math.max(water ? 5 : 8, Math.abs(y - ground) * 2.4));
    const k = smooth((d - route.half) / shoulder);
    if (k < 1) {
      heights[c] = mix(y, ground, k);
      if (water) water[c] = at[c]!;
    }
    if (d <= route.half) {
      const i = c % STRIDE;
      const j = (c - i) / STRIDE;
      if (i < COLUMNS && j < ROWS) cells[j * COLUMNS + i] = surface;
    }
    near[c] = 0;
  }
}

/** What dry ground wears, by its Region and height; the routes paint theirs over it. */
function surfaceOf(x: number, z: number, y: number, steep: boolean, f: Fields): Surface {
  const land = Math.max(sample(f.main, x, z), sample(f.neon, x, z), sample(f.harbor, x, z));
  if (y < 0.15) return 'bed';
  const region = regionAt(x, z);
  if (region === 'neon-city') return 'city';
  if (region === 'rogue-harbor') return land < 16 ? 'beach' : 'dock';
  if (land < 22 && y < 2.2) return 'beach';
  switch (region) {
    case 'the-dustlands':
      return steep || y > 9 ? 'rock' : 'dust';
    case 'frostbite-peaks':
      return steep ? 'ice' : y > 15 ? 'snow' : 'meadow';
    case 'mutant-jungle':
      return 'jungle';
    case 'ground-zero':
      return distance(x, z, CRATER.x, CRATER.z) < CRATER.rim + 30 ? 'ash' : 'meadow';
  }
  return 'meadow';
}

export interface ZeroIslandGround {
  readonly data: TerrainData;
  /** Each line of the railway as built: the ring first, each with the heights it runs at. */
  readonly railway: readonly (readonly RoutePoint[])[];
  /** The stream as built, its heights the water's surface. */
  readonly stream: readonly RoutePoint[];
  /** The climbable mesas' trails as built, from the canyon floor up. */
  readonly trails: readonly (readonly RoutePoint[])[];
  /** The roads as built. */
  readonly roads: readonly (readonly RoutePoint[])[];
}

let built: ZeroIslandGround | null = null;

/** Zero Island's ground. Sculpted once: every map built from it shares the arrays. */
export function zeroIslandGround(): ZeroIslandGround {
  if (built) return built;
  const f = coast();
  const corners = (COLUMNS + 1) * (ROWS + 1);
  const heights = new Float32Array(corners);
  // The sea everywhere: where it's dry, that is below the ground.
  const water = new Float32Array(corners);
  const cells = new Uint8Array(COLUMNS * ROWS);
  for (let j = 0; j <= ROWS; j++) {
    const z = Z0 + j;
    for (let i = 0; i <= COLUMNS; i++) {
      const x = X0 + i;
      const main = sample(f.main, x, z);
      const neon = sample(f.neon, x, z);
      const harbor = sample(f.harbor, x, z);
      const raw = Math.max(main, neon, harbor);
      if (raw < -40) {
        // Well out to sea, or under the shelf.
        const hull = sample(f.hull, x, z);
        heights[corner(i, j)] = hull > 0 ? SHALLOWS : Math.max(SEA_FLOOR, SHALLOWS + hull * 0.09);
        continue;
      }
      const d = raw + 9 * noise(x, z, 85, 1) + 4 * noise(x, z, 31, 2);
      let y: number;
      if (d <= 0) {
        const hull = sample(f.hull, x, z);
        const shelf = Math.max(SHALLOWS, d * 0.08);
        y = hull > 0 ? shelf : Math.max(SEA_FLOOR, Math.min(shelf, SHALLOWS + hull * 0.09));
      } else if (neon === raw) {
        y = mix(0.02 + d * 0.06, 3 + 0.15 * noise(x, z, 60, 3), smooth((d - 2) / 32));
      } else if (harbor === raw) {
        y = mix(0.02 + d * 0.06, 2.4 + 0.15 * noise(x, z, 60, 4), smooth((d - 2) / 32));
      } else {
        // The shore eases the land down to the sea, but the massif comes down to it in a sea cliff.
        const r = distance(x, z, SUMMIT.x, SUMMIT.z);
        const cliff = smooth((300 - r) / 60) * smooth(d / 10);
        y = mix(0.02 + d * 0.05, inland(x, z), Math.max(cliff, smooth((d - 10) / 62)));
      }
      heights[corner(i, j)] = y;
    }
  }
  for (const id of REGION_IDS) level(heights, CORES[id], 34);
  foldGround(heights);
  levelPads(heights);
  const scratch = { near: new Float32Array(corners), level: new Float32Array(corners) };
  const lay = (route: Route) => {
    const line = trace(route, heights);
    cut(route, line, heights, cells, null, scratch);
    return line;
  };
  // Surfaces first, so routes paint over them.
  for (let j = 0; j < ROWS; j++) {
    const z = Z0 + j + 0.5;
    for (let i = 0; i < COLUMNS; i++) {
      const x = X0 + i + 0.5;
      const c = corner(i, j);
      const a = heights[c]!;
      const steep = Math.abs(heights[c + 1]! - a) > 0.8 || Math.abs(heights[c + STRIDE]! - a) > 0.8;
      cells[j * COLUMNS + i] = surfaceIndex(padSurface(x, z) ?? surfaceOf(x, z, a, steep, f));
    }
  }
  const trails = TRAILS.map(lay);
  const railway = RAILWAY.map(lay);
  lay({ ...ROAD, points: [RUNWAY.from, RUNWAY.to], half: RUNWAY.half });
  const roads = ROADS.map(lay);
  const stream = trace(STREAM, heights);
  cut(STREAM, stream, heights, cells, water, scratch);
  built = {
    data: {
      origin: [X0, Z0],
      cell: 1,
      columns: COLUMNS,
      rows: ROWS,
      heights,
      water,
      palette: SURFACE_NAMES.map((s): Material => SURFACES[s][0]),
      materials: cells,
    },
    railway,
    stream,
    trails,
    roads,
  };
  return built;
}
