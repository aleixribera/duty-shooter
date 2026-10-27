import type { ChargeSite, Material, NavOptions, Solid, SpawnPoint, Vec3, Zone } from '@duty-shooter/fps-core';
import type { Finish, Look } from '@duty-shooter/fps-client/surfaces';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import type { CameraKey, CameraSpot, IndoorZone, MapDefinition } from './definition';

/**
 * Switchyard: a freight rail yard at dusk, walled in on three sides, with
 * the main line running past beyond a low barrier on the fourth. Three
 * lanes run its length, east to west:
 *
 * - the long lane (north): two open running tracks with low cover only,
 *   for long sightlines;
 * - the middle lane: two rows of freight cars (flatbeds, tank cars, open
 *   boxcars to run through, closed boxcars to climb) with an alley between;
 * - the close lane (south): the workshop, the engine shed and the fuel
 *   depot, with the service road in front and a back alley behind.
 *
 * The signal box stands between the long lane and the cars. Team 1 starts at
 * the west end, team 2 at the east end, where both Charge sites are.
 *
 * Metres, x east, y up, z south; the origin is the yard's centre.
 */

/** The playable edge, a hair outside the perimeter walls' outer faces. */
const EDGE_X = 54.05;
const EDGE_Z = 28.05;
/** The perimeter walls: their inner faces, thickness, and heights (the low barrier along the main line, the high wall elsewhere). */
const INNER_X = 53.7;
const INNER_Z = 27.7;
const PERIMETER_T = 0.3;
const BARRIER_H = 1.0;
const WALL_H = 3.2;
/** Boundary clip reaches this high: out of reach of any jump or mantle. */
const SKY = 100;
const DOOR_H = 2.15;
export const DOOR_W = 1.15;
/** Track: ballast bed half width and height, rail gauge (between rail centres), rail size. */
const BALLAST_HALF = 1.6;
const BALLAST_H = 0.15;
const RAIL_HALF_GAUGE = 0.7175;
const RAIL_W = 0.07;
const RAIL_H = 0.14;
/** Freight cars: underframe bottom, floor (deck) height, roof top, half width, shell thickness. */
const FRAME_BOTTOM = 0.3;
export const CAR_FLOOR = 1.1;
export const CAR_ROOF = 3.9;
const CAR_HALF = 1.5;
const SHELL = 0.05;
/** Track centre lines (z): the long lane's two tracks, the two rows of cars, and the shed road. */
export const TRACKS = { north: -23.5, south: -17.5, rowA: -7, rowB: 1, shed: 18 } as const;
/** The signal box's walls (centre lines) and its upper floor. */
export const SIGNAL_BOX = { x0: 20, x1: 27, z0: -13, z1: -8, floor: 3.0, top: 5.6 } as const;
/**
 * Its two outside stairs: their extent across (x) at each end; where each
 * starts, the halfway landing and where the top landing begins (z). Each
 * flight climbs 1.5 m in 8 steps of 0.4 m.
 */
export const SIGNAL_STAIRS = { west: [18.6, 19.9], east: [27.1, 28.4], foot: -2.2, landing: [-5.4, -6.4], top: -9.6 } as const;

/** The playable area: the yard inside its perimeter. */
export const PLAY_AREA: readonly (readonly [number, number])[] = [
  [-EDGE_X, -EDGE_Z],
  [EDGE_X, -EDGE_Z],
  [EDGE_X, EDGE_Z],
  [-EDGE_X, EDGE_Z],
];

/** Where the boundary's player clip stands: the perimeter walls' inner faces. */
export const BOUNDARY: readonly (readonly [number, number])[] = [
  [-INNER_X, -INNER_Z],
  [INNER_X, -INNER_Z],
  [INNER_X, INNER_Z],
  [-INNER_X, INNER_Z],
];

/** Yaw that looks along +x / -x / +z / -z (yaw 0 looks -z). */
const LOOK = { east: -Math.PI / 2, west: Math.PI / 2, south: Math.PI, north: 0 } as const;

/** Yaw that looks from (x, z) toward the yard's centre. */
function faceCentre(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** The yard's finishes: weathered brick and timber, oxide-red and brown cars, dark ballast under a dusk sky. */
const FINISHES: Readonly<Record<string, Finish>> = {
  yard: { family: 'gravel', color: 0x8a8174 },
  ballast: { family: 'gravel', color: 0x6c665e },
  land: { family: 'dirt', color: 0x7a6852, accent: 0x655642 },
  road: { family: 'asphalt', color: 0x46484b },
  slab: { family: 'concrete', color: 0xaaa59b, accent: 0x8e8a82 },
  'yard.wall': { family: 'concrete', color: 0xb1aa9d, accent: 0x948e83 },
  brick: { family: 'brick', color: 0x8c4a36, accent: 0xc9bfae },
  'brick.dark': { family: 'brick', color: 0x6e3b2e, accent: 0xb3a998 },
  plaster: { family: 'plaster', color: 0xd9cfbb },
  timber: { family: 'siding', color: 0x7d5c3e },
  'signal.timber': { family: 'siding', color: 0xb8a37a },
  trim: { family: 'paint', color: 0xe9e3d3 },
  'roof.flat': { family: 'asphalt', color: 0x4f4b47 },
  floor: { family: 'floor', color: 0x8d6a47, accent: 0x6c5036 },
  'shed.floor': { family: 'concrete', color: 0x8f8a82, accent: 0x76726b },
  sleeper: { family: 'floor', color: 0x4c3c2e, accent: 0x3b2e23 },
  rail: { family: 'sheetMetal', color: 0x6e6157 },
  steel: { family: 'paint', color: 0x3a3d40 },
  'car.oxide': { family: 'sheetMetal', color: 0x7e3a2a },
  'car.brown': { family: 'sheetMetal', color: 0x5e4535 },
  'car.teal': { family: 'sheetMetal', color: 0x3f6563 },
  'car.grey': { family: 'sheetMetal', color: 0x80868a },
  'tank.black': { family: 'paint', color: 0x2b2c2e },
  'tank.silver': { family: 'sheetMetal', color: 0xb9bec1 },
  container: { family: 'sheetMetal', color: 0x2f5d86 },
  loco: { family: 'paint', color: 0x2e4a3a },
  'loco.cab': { family: 'paint', color: 0xd3a43a },
  buffer: { family: 'paint', color: 0xb23a2a },
  crate: { family: 'floor', color: 0x9c7a50, accent: 0x7e6140 },
  cabinet: { family: 'paint', color: 0x8a918e },
  truck: { family: 'paint', color: 0x8d2f2a },
  'truck.box': { family: 'sheetMetal', color: 0xd8d4c8 },
  forklift: { family: 'paint', color: 0xd9a52b },
  bench: { family: 'floor', color: 0x6f5640, accent: 0x5a4433 },
  pole: { family: 'floor', color: 0x5e4734, accent: 0x4c3a2b },
};

/** An outside wall: its finish out, plaster in, trim on its ends, top and underside. */
const wallLook = (outside: string, inside = 'plaster'): Look => ({ side: outside, inside, edge: 'trim', top: 'trim', bottom: 'trim' });
const FLAT_ROOF: Look = { side: 'trim', top: 'roof.flat', bottom: 'plaster' };
const SLAB: Look = { side: 'trim', top: 'floor', bottom: 'plaster' };

/** A door in a wall, from `from` along it. */
const door = (from: number): Opening => ({ from, to: from + DOOR_W, bottom: 0, top: DOOR_H });
/** A glazed window from `from` to `to` along a wall, between `bottom` and `top` above the wall's foot. */
const glazed = (from: number, to: number, bottom = 1.0, top = 2.2): Opening => ({ from, to, bottom, top, pane: 'glass' });

interface RoomSpec {
  /** The walls' centre lines. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly bottom: number;
  readonly height: number;
  readonly thickness: number;
  readonly material: Material;
  readonly look: Look;
  readonly north?: readonly Opening[];
  readonly south?: readonly Opening[];
  readonly west?: readonly Opening[];
  readonly east?: readonly Opening[];
}

/** Four walls round a rectangle: the north and south walls run the full length, the west and east walls fit between them. */
function room(b: Builder, r: RoomSpec): void {
  const t = r.thickness / 2;
  const common = { thickness: r.thickness, bottom: r.bottom, height: r.height, material: r.material, look: r.look };
  b.wall({ along: 'x', at: r.z0, from: r.x0 - t, to: r.x1 + t, openings: r.north ?? [], ...common });
  b.wall({ along: 'x', at: r.z1, from: r.x0 - t, to: r.x1 + t, openings: r.south ?? [], ...common });
  b.wall({ along: 'z', at: r.x0, from: r.z0 + t, to: r.z1 - t, openings: r.west ?? [], ...common });
  b.wall({ along: 'z', at: r.x1, from: r.z0 + t, to: r.z1 - t, openings: r.east ?? [], ...common });
}

/** A flat roof slab over a room's walls, flush with their outer faces. */
function flatRoof(b: Builder, r: Pick<RoomSpec, 'x0' | 'x1' | 'z0' | 'z1' | 'thickness'>, y: number, depth = 0.2, material: Material = 'concrete'): void {
  const t = r.thickness / 2;
  b.add([r.x0 - t, y, r.z0 - t], [r.x1 + t, y + depth, r.z1 + t], material, { look: FLAT_ROOF });
}

/** A flight of `steps` steps along z from `from` (at y0) to `to` (at y1), across x0..x1, each step solid down to the ground. */
function flight(b: Builder, x0: number, x1: number, from: number, to: number, y0: number, y1: number, steps: number): void {
  const run = (to - from) / steps;
  b.paint('steel', () => {
    for (let i = 0; i < steps; i++) {
      const a = from + run * i;
      const c = from + run * (i + 1);
      b.add([x0, 0, Math.min(a, c)], [x1, y0 + ((y1 - y0) * (i + 1)) / steps, Math.max(a, c)], 'metal');
    }
  });
}

/** A box resting on the ground (or on `y`), from its footprint. */
function block(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, material: Material, look: string, y = 0): Solid {
  return b.add([x0, y, z0], [x1, y + height, z1], material, { look });
}

// ---------------------------------------------------------------------------
// The ground, the perimeter and the scenery beyond it.

function buildGround(b: Builder): void {
  const layers: { rect: Rect; material: Material; look: string }[] = [
    // Floors: the workshop's boards, the shed's, the signal box's and the pump house's concrete.
    { rect: { x0: -42.075, x1: -25.925, z0: 12.425, z1: 23.575 }, material: 'wood', look: 'floor' },
    { rect: { x0: -8.15, x1: 16.15, z0: 12.35, z1: 24.15 }, material: 'concrete', look: 'shed.floor' },
    { rect: { x0: SIGNAL_BOX.x0 - 0.1, x1: SIGNAL_BOX.x1 + 0.1, z0: SIGNAL_BOX.z0 - 0.1, z1: SIGNAL_BOX.z1 + 0.1 }, material: 'concrete', look: 'slab' },
    // The fuel depot's pad and the service road.
    { rect: { x0: 26, x1: 44.6, z0: 11.35, z1: EDGE_Z }, material: 'concrete', look: 'slab' },
    { rect: { x0: -EDGE_X, x1: EDGE_X, z0: 5, z1: 10.5 }, material: 'asphalt', look: 'road' },
    // The yard's gravel, then the land round it.
    { rect: { x0: -EDGE_X, x1: EDGE_X, z0: -EDGE_Z, z1: EDGE_Z }, material: 'gravel', look: 'yard' },
    { rect: { x0: -160, x1: 160, z0: -120, z1: 120 }, material: 'dirt', look: 'land' },
  ];
  for (const { rect, material, look } of groundTiles(layers)) b.add([rect.x0, -0.5, rect.z0], [rect.x1, 0, rect.z1], material, { look });
}

/** The low concrete barrier along the main line (north) and the high wall round the other three sides, each wholly inside the edge. */
function buildPerimeter(b: Builder): void {
  const t = PERIMETER_T;
  b.paint(wallLook('yard.wall', 'yard.wall'), () => {
    b.add([-INNER_X - t, 0, -INNER_Z - t], [INNER_X + t, BARRIER_H, -INNER_Z], 'concrete');
    b.add([-INNER_X - t, 0, INNER_Z], [INNER_X + t, WALL_H, INNER_Z + t], 'concrete');
    b.add([-INNER_X - t, 0, -INNER_Z], [-INNER_X, WALL_H, INNER_Z], 'concrete');
    b.add([INNER_X, 0, -INNER_Z], [INNER_X + t, WALL_H, INNER_Z], 'concrete');
  });
}

/**
 * Player clip from the walls' inner faces outward, from the ground into the
 * sky; the slabs run on past the corners and overlap there, closing them.
 */
function buildBoundary(b: Builder): void {
  const y0 = -1;
  const y1 = SKY - 1;
  b.clip([-INNER_X - 1, y0, -INNER_Z - 1], [INNER_X + 1, y1, -INNER_Z]);
  b.clip([-INNER_X - 1, y0, INNER_Z], [INNER_X + 1, y1, INNER_Z + 1]);
  b.clip([-INNER_X - 1, y0, -INNER_Z - 1], [-INNER_X, y1, INNER_Z + 1]);
  b.clip([INNER_X, y0, -INNER_Z - 1], [INNER_X + 1, y1, INNER_Z + 1]);
}

/** Beyond the barrier: the main line's two tracks running away east and west, and a line of telegraph poles. */
function buildScenery(b: Builder): void {
  track(b, -160, 160, -32.5, { sleepers: false });
  track(b, -160, 160, -37, { sleepers: false });
  b.paint('pole', () => {
    for (let x = -150; x <= 150; x += 30) b.add([x - 0.13, 0, -29.6], [x + 0.13, 7.5, -29.34], 'wood');
  });
}

// ---------------------------------------------------------------------------
// Track and freight cars.

/**
 * A track from x0 to x1 on centre line `c`: a ballast bed with two rails on
 * it, sleepers drawn on the ballast, and a buffer stop past each end that has one.
 */
function track(b: Builder, x0: number, x1: number, c: number, options: { buffers?: readonly ('west' | 'east')[]; sleepers?: boolean } = {}): void {
  const bed = b.add([x0, 0, c - BALLAST_HALF], [x1, BALLAST_H, c + BALLAST_HALF], 'gravel', { look: 'ballast' });
  b.paint('rail', () => {
    for (const s of [-1, 1]) b.add([x0, BALLAST_H, c + s * RAIL_HALF_GAUGE - RAIL_W / 2], [x1, BALLAST_H + RAIL_H, c + s * RAIL_HALF_GAUGE + RAIL_W / 2], 'metal');
  });
  if (options.sleepers !== false) {
    for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.65) b.decorate(bed, [x, BALLAST_H + 0.015, c], [0.24, 0.05, 2.6], 'sleeper');
  }
  for (const end of options.buffers ?? []) {
    const [a, z] = end === 'west' ? [x0 - 1, x0] : [x1, x1 + 1];
    const stop = block(b, a, z, c - 1.3, c + 1.3, CAR_FLOOR, 'concrete', 'yard.wall');
    // The red beam across the buffer's face.
    const face = end === 'west' ? z : a;
    const out = end === 'west' ? 1 : -1;
    b.decorateBox(stop, [Math.min(face, face + out * 0.04), 0.75, c - 1.25], [Math.max(face, face + out * 0.04), 1.0, c + 1.25], 'buffer');
  }
}

type CarKind = 'flatbed' | 'open' | 'closed' | 'tank';

/**
 * A freight car from x0 to x1 on track `c`. Every car stands on a steel
 * underframe up to its floor; boxcars are hollow sheet-metal shells (open
 * ones with a door in each side, and pallet steps up to it), tank cars a
 * stepped steel barrel, flatbeds just the deck.
 */
function car(b: Builder, kind: CarKind, x0: number, x1: number, c: number, finish: string): void {
  b.add([x0, FRAME_BOTTOM, c - CAR_HALF], [x1, CAR_FLOOR, c + CAR_HALF], 'metal', { look: { side: 'steel', top: kind === 'flatbed' ? 'floor' : 'steel' } });
  if (kind === 'flatbed') return;
  if (kind === 'tank') {
    // Narrow and tall, then wider and lower: a round barrel in steps, each a little shorter than the last.
    b.paint({ side: finish, top: finish, bottom: 'steel' }, () => {
      b.add([x0 + 0.4, CAR_FLOOR, c - 0.7], [x1 - 0.4, CAR_ROOF - 0.2, c + 0.7], 'metal');
      b.add([x0 + 0.5, CAR_FLOOR + 0.2, c - 1.1], [x1 - 0.5, CAR_ROOF - 0.4, c + 1.1], 'metal');
      b.add([x0 + 0.6, CAR_FLOOR + 0.5, c - 1.4], [x1 - 0.6, CAR_ROOF - 0.7, c + 1.4], 'metal');
    });
    return;
  }
  const mid = (x0 + x1) / 2;
  const doors: Opening[] = kind === 'open' ? [{ from: mid - 1, to: mid + 1, bottom: 0, top: 2.3 }] : [];
  const shell = CAR_ROOF - SHELL - CAR_FLOOR;
  const look: Look = { side: finish, inside: 'steel', edge: finish, top: finish, bottom: 'steel' };
  for (const s of [-1, 1]) b.wall({ along: 'x', at: c + s * (CAR_HALF - SHELL / 2), from: x0, to: x1, thickness: SHELL, bottom: CAR_FLOOR, height: shell, material: 'sheetMetal', openings: doors, look });
  for (const x of [x0 + SHELL / 2, x1 - SHELL / 2]) b.wall({ along: 'z', at: x, from: c - CAR_HALF + SHELL, to: c + CAR_HALF - SHELL, thickness: SHELL, bottom: CAR_FLOOR, height: shell, material: 'sheetMetal', look });
  b.add([x0, CAR_ROOF - SHELL, c - CAR_HALF], [x1, CAR_ROOF, c + CAR_HALF], 'sheetMetal', { look: { side: finish, top: finish, bottom: 'steel' } });
  if (kind === 'open') {
    // Pallet steps up to each door, off the ballast's edge.
    b.paint('crate', () => {
      b.stairs({ along: 'z', from: c - BALLAST_HALF - 1, to: c - BALLAST_HALF, across: [mid - 1, mid + 1], bottom: 0, top: CAR_FLOOR, material: 'wood', maxRise: 0.4 });
      b.stairs({ along: 'z', from: c + BALLAST_HALF + 1, to: c + BALLAST_HALF, across: [mid - 1, mid + 1], bottom: 0, top: CAR_FLOOR, material: 'wood', maxRise: 0.4 });
    });
  }
}

/** Open boxcars (x0, x1, track) to run through: the middle of each is its door. */
export const OPEN_BOXCARS: readonly (readonly [number, number, number])[] = [
  [-29, -17, TRACKS.rowA],
  [32, 44, TRACKS.rowA],
  [-10, 2, TRACKS.rowB],
];

/** A crate (wood) from its footprint, `height` tall, resting at `y`. */
function crate(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, y = 0): Solid {
  return block(b, x0, x1, z0, z1, height, 'wood', 'crate', y);
}

/** The crates of a roof climb: each a sure mantle up from the last, and the high one out of reach from the ground. */
export const CLIMB_LOW = 1.1;
export const CLIMB_HIGH = 2.2;

/**
 * A climb onto a car roof: a low crate, then a high crate beside it against
 * the car, then the roof (1.7 m up, within a high climb).
 */
function roofClimb(b: Builder, low: readonly [number, number], high: readonly [number, number], z: readonly [number, number]): void {
  crate(b, low[0], low[1], z[0], z[1], CLIMB_LOW);
  crate(b, high[0], high[1], z[0], z[1], CLIMB_HIGH);
}

/** The roof climbs (low crate x, high crate x, z), each against a closed boxcar. */
export const ROOF_CLIMBS: readonly { readonly low: readonly [number, number]; readonly high: readonly [number, number]; readonly z: readonly [number, number] }[] = [
  { low: [5.0, 6.2], high: [6.2, 7.4], z: [-9.9, -8.7] },
  { low: [23.8, 25.0], high: [25.0, 26.2], z: [2.7, 3.9] },
  { low: [-33.0, -31.8], high: [-34.2, -33.0], z: [2.7, 3.9] },
];

function buildTracks(b: Builder): void {
  // The long lane: two running tracks, ending at buffer stops short of the end screens.
  track(b, -41, 41, TRACKS.north, { buffers: ['west', 'east'] });
  track(b, -41, 41, TRACKS.south, { buffers: ['west', 'east'] });
  // The rows of cars. Row A is broken where the signal box and its stairs stand.
  track(b, -45, 16, TRACKS.rowA, { buffers: ['west', 'east'] });
  track(b, 31, 45, TRACKS.rowA, { buffers: ['west', 'east'] });
  track(b, -45, 45, TRACKS.rowB, { buffers: ['west', 'east'] });
  // The shed road, through the engine shed.
  track(b, -22, 22, TRACKS.shed, { buffers: ['west', 'east'] });

  const A = TRACKS.rowA;
  const B = TRACKS.rowB;
  car(b, 'flatbed', -44, -32, A, 'car.brown');
  car(b, 'open', -29, -17, A, 'car.oxide');
  car(b, 'tank', -14, -2, A, 'tank.black');
  car(b, 'closed', 1, 13, A, 'car.teal');
  car(b, 'open', 32, 44, A, 'car.brown');
  car(b, 'closed', -40, -28, B, 'car.oxide');
  car(b, 'flatbed', -25, -13, B, 'car.grey');
  car(b, 'open', -10, 2, B, 'car.teal');
  car(b, 'tank', 5, 17, B, 'tank.silver');
  car(b, 'closed', 20, 32, B, 'car.brown');
  car(b, 'flatbed', 35, 44, B, 'car.grey');

  // Loads on the flatbeds: containers (the end cars' screen their rows from the spawns) and crates.
  block(b, -43, -37, A - 1.3, A + 1.3, 2.4, 'metal', 'container', CAR_FLOOR);
  crate(b, -35.6, -34.2, A - 0.6, A + 1.2, 1.2, CAR_FLOOR);
  block(b, -23, -17, B - 1.3, B + 1.3, 2.4, 'metal', 'container', CAR_FLOOR);
  block(b, 37, 43, B - 1.3, B + 1.3, 2.4, 'metal', 'container', CAR_FLOOR);

  for (const c of ROOF_CLIMBS) roofClimb(b, c.low, c.high, c.z);
}

// ---------------------------------------------------------------------------
// Cover in the lanes.

/**
 * The screens across each end of the yard, between the spawns and the lanes:
 * lineside huts, container stacks and wall pieces (z0, z1), with gaps to
 * walk through. The two ends' gaps never share a z, so no straight line down
 * a lane joins the spawns. Each piece stands x0..x1 east of the centre, and
 * mirrored at the west end; `west` and `east` list each end's pieces.
 */
const SCREENS = {
  x: [42.5, 44.8],
  east: [
    { z: [-27.5, -24.2], kind: 'hut' },
    { z: [-21.8, -14.6], kind: 'container' },
    { z: [-12.2, -9.0], kind: 'hut' },
    { z: [-5.3, -2.6], kind: 'crates' },
    { z: [2.7, 7.6], kind: 'container' },
    { z: [10.0, 14.2], kind: 'wall' },
    { z: [19.3, 24.2], kind: 'wall' },
    { z: [26.0, 27.6], kind: 'hut' },
  ],
  west: [
    { z: [-27.5, -19.6], kind: 'hut' },
    { z: [-17.2, -11.6], kind: 'container' },
    { z: [-3.3, -0.7], kind: 'crates' },
    { z: [2.7, 4.8], kind: 'crates' },
    { z: [7.0, 12.2], kind: 'container' },
    { z: [23.8, 26.2], kind: 'hut' },
  ],
} as const;

function buildScreens(b: Builder): void {
  for (const side of ['west', 'east'] as const) {
    const s = side === 'east' ? 1 : -1;
    for (const { z, kind } of SCREENS[side]) {
      // The wall pieces stand clear of the depot's front wall and pump house, a thin pier by the east spawns.
      const [a, c] = kind === 'wall' ? [44.2, 44.8] : SCREENS.x;
      const [x0, x1] = s > 0 ? [a, c] : [-c, -a];
      if (kind === 'hut') {
        block(b, x0, x1, z[0], z[1], 2.6, 'brick', 'brick');
      } else if (kind === 'container') {
        block(b, x0, x1, z[0], z[1], 2.6, 'metal', 'container');
      } else if (kind === 'crates') {
        block(b, x0, x1, z[0], z[1], 2.2, 'wood', 'crate');
      } else {
        block(b, x0, x1, z[0], z[1], 2.6, 'concrete', 'yard.wall');
      }
    }
  }
}

/** Low cover along the long lane, and loose stacks in the strip south of it, the alley between the cars and on the road. */
function buildCover(b: Builder): void {
  const cabinet = (x: number, z: number) => block(b, x - 0.4, x + 0.4, z - 0.3, z + 0.3, 1.4, 'metal', 'cabinet');
  const sleepers = (x0: number, z0: number, z1: number, height: number) => block(b, x0, x0 + 2.6, z0, z1, height, 'wood', 'sleeper');
  // The long lane: a lamp hut against the barrier, relay cabinets, sleeper stacks and cable troughs.
  room(b, { x0: -8, x1: -5, z0: -27.4, z1: -25.4, bottom: 0, height: 2.6, thickness: 0.2, material: 'brick', look: wallLook('brick'), south: [door(-7.2)] });
  flatRoof(b, { x0: -8, x1: -5, z0: -27.4, z1: -25.4, thickness: 0.2 }, 2.6, 0.15);
  cabinet(-29.6, -26.4);
  cabinet(24.4, -26.4);
  sleepers(36, -27.0, -25.8, 1.0);
  sleepers(-36, -21.1, -19.9, 1.0);
  block(b, -14, -12, -21.2, -19.8, 0.8, 'concrete', 'slab');
  sleepers(8, -21.1, -19.9, 1.2);
  cabinet(30.4, -20.5);
  // South of the long lane.
  crate(b, -24, -22.8, -15.4, -14.2, 1.2);
  block(b, -2, 0, -15.5, -14.5, 1.0, 'metal', 'cabinet');
  sleepers(38, -15.4, -14.2, 1.0);
  // The alley between the rows of cars: stacks on alternate sides.
  crate(b, -35, -33.8, -5.2, -4.0, 1.2);
  crate(b, -12, -10.8, -2.0, -0.8, 1.0);
  crate(b, 14, 15.2, -5.2, -4.0, 2.0);
  crate(b, 33, 34.2, -2.0, -0.8, 1.0);
  // The service road: a parked box truck, a forklift and pallets.
  b.add([-18, FRAME_BOTTOM, 6.0], [-10, CAR_FLOOR, 8.5], 'metal', { look: 'steel' });
  b.add([-18, CAR_FLOOR, 6.0], [-12.2, 3.4, 8.5], 'metal', { look: 'truck.box' });
  b.add([-12, CAR_FLOOR, 6.1], [-10, 2.8, 8.4], 'metal', { look: 'truck' });
  block(b, 20, 21.6, 8, 9.2, 2.1, 'metal', 'forklift');
  crate(b, 36, 37.2, 5.5, 6.7, 1.0);
}

// ---------------------------------------------------------------------------
// Buildings.

/**
 * The signal box: a brick ground floor (the relay room, doors north and
 * south) under a timber lever room with windows all round. Stairs climb
 * each end from the alley between the cars, in two flights with a landing
 * between, to a landing at a door into the lever room. (Bots need about
 * 0.4 m of run a step and a landing halfway, too long to fit inside.)
 */
function buildSignalBox(b: Builder): void {
  const { x0, x1, z0, z1, floor, top } = SIGNAL_BOX;
  const t = 0.2;
  room(b, {
    x0, x1, z0, z1, bottom: 0, height: floor, thickness: t, material: 'brick', look: wallLook('brick'),
    south: [door(22.5), glazed(24.6, 26.2)],
    north: [glazed(20.5, 21.7), door(24.6)],
  });
  room(b, {
    x0, x1, z0, z1, bottom: floor, height: top - floor, thickness: t, material: 'wood', look: wallLook('signal.timber'),
    south: [glazed(20.5, 22.5, 1.0, 2.3), glazed(23, 25, 1.0, 2.3), glazed(25.5, 26.6, 1.0, 2.3)],
    north: [glazed(20.5, 22.5, 1.0, 2.3), glazed(23, 25, 1.0, 2.3), glazed(25.5, 26.6, 1.0, 2.3)],
    west: [glazed(-12.6, -11.0, 1.0, 2.3), door(-10.5)],
    east: [glazed(-12.6, -11.0, 1.0, 2.3), door(-10.5)],
  });
  flatRoof(b, { x0, x1, z0, z1, thickness: t }, top);
  b.add([x0 + t / 2, floor - 0.2, z0 + t / 2], [x1 - t / 2, floor, z1 - t / 2], 'concrete', { look: SLAB });
  // The stairs at each end: a flight up from the alley, a landing, a second flight, and the top landing on a brick pier.
  const s = SIGNAL_STAIRS;
  const half = floor / 2;
  for (const [a, c] of [s.west, s.east]) {
    flight(b, a, c, s.foot, s.landing[0], 0, half, 8);
    block(b, a, c, s.landing[1], s.landing[0], half, 'metal', 'steel');
    flight(b, a, c, s.landing[1], s.top, half, floor, 8);
    block(b, a, c, s.top - 1, s.top, floor, 'brick', 'brick');
  }
  // The lever frame upstairs, and the relay racks below.
  block(b, 21.3, 23.0, -8.9, -8.4, 1.0, 'metal', 'steel', floor);
  block(b, 25.0, 26.6, -8.8, -8.25, 2.0, 'metal', 'cabinet');
}

/**
 * The engine shed: a tall brick hall the shed road runs through, with a
 * locomotive standing inside and an inspection platform along the back wall.
 */
function buildEngineShed(b: Builder): void {
  const x0 = -8;
  const x1 = 16;
  const z0 = 12.5;
  const z1 = 24;
  const t = 0.3;
  const high = (from: number, to: number) => glazed(from, to, 4.0, 6.0);
  const road: Opening = { from: TRACKS.shed - 2, to: TRACKS.shed + 2, bottom: 0, top: 5.5 };
  room(b, {
    x0, x1, z0, z1, bottom: 0, height: 7, thickness: t, material: 'brick', look: wallLook('brick.dark', 'plaster'),
    north: [door(-3), high(0, 3), high(5, 8), door(9), high(12, 14.5)],
    south: [high(-6, -3), high(1, 4), high(7, 10), door(14.2)],
    west: [road],
    east: [road],
  });
  flatRoof(b, { x0, x1, z0, z1, thickness: t }, 7, 0.3);
  // The locomotive: underframe, the long hood and the cab at the east end.
  b.paint({ side: 'loco', top: 'loco', bottom: 'steel' }, () => {
    b.add([-1, FRAME_BOTTOM, TRACKS.shed - 1.4], [11, 1.2, TRACKS.shed + 1.4], 'metal');
    b.add([-0.8, 1.2, TRACKS.shed - 1.1], [7, 3.6, TRACKS.shed + 1.1], 'metal');
  });
  b.add([7, 1.2, TRACKS.shed - 1.4], [10.8, 4.2, TRACKS.shed + 1.4], 'metal', { look: { side: 'loco.cab', top: 'loco', bottom: 'steel' } });
  // The inspection platform, with steps at each end.
  const back = z1 - t / 2;
  block(b, -4, 12, 21.5, back, CAR_FLOOR, 'concrete', 'slab');
  b.paint('slab', () => {
    b.stairs({ along: 'x', from: -5.6, to: -4, across: [21.5, back], bottom: 0, top: CAR_FLOOR, material: 'concrete', maxRise: 0.4 });
    b.stairs({ along: 'x', from: 13.6, to: 12, across: [21.5, back], bottom: 0, top: CAR_FLOOR, material: 'concrete', maxRise: 0.4 });
  });
  // Drums in the north aisle.
  block(b, 12.5, 13.5, 13, 14, 1.0, 'metal', 'steel');
}

/** The workshop: a timber shed of two rooms, with doors to the road, the back alley and either side. */
function buildWorkshop(b: Builder): void {
  const spec = { x0: -42, x1: -26, z0: 12.5, z1: 23.5, thickness: 0.15 };
  room(b, {
    ...spec, bottom: 0, height: 4, material: 'wood', look: wallLook('timber'),
    north: [door(-39.5), glazed(-36.5, -35.0), door(-30.5), glazed(-28.5, -27.0)],
    south: [glazed(-40.5, -39.0), door(-37), door(-31), glazed(-28.0, -26.8)],
    west: [door(17)],
    east: [door(17)],
  });
  flatRoof(b, spec, 4, 0.15, 'wood');
  b.wall({ along: 'z', at: -34, from: 12.575, to: 23.425, thickness: 0.1, bottom: 0, height: 4, material: 'wood', openings: [door(17)], look: { side: 'plaster', edge: 'trim', top: 'trim' } });
  block(b, -41.0, -38.5, 21.6, 22.4, 0.9, 'wood', 'bench');
  block(b, -31.5, -28.5, 21.6, 22.4, 0.9, 'wood', 'bench');
  block(b, -38.0, -36.6, 13.2, 14.0, 1.4, 'metal', 'cabinet');
  // Out the east side: the coaling stage, a platform with steps up from the east.
  block(b, -21, -15, 20.5, 23.5, CAR_FLOOR, 'concrete', 'slab');
  b.paint('slab', () => b.stairs({ along: 'x', from: -13.6, to: -15, across: [20.5, 23.5], bottom: 0, top: CAR_FLOOR, material: 'concrete', maxRise: 0.4 }));
}

/**
 * The fuel depot: two storage tanks on plinths behind a low wall with a gate,
 * a pump house, and a loading dock up steps.
 */
function buildDepot(b: Builder): void {
  // The front wall, open at the gate.
  b.paint(wallLook('yard.wall', 'yard.wall'), () => {
    b.add([26, 0, 11.35], [32, 1.0, 11.65], 'concrete');
    b.add([35, 0, 11.35], [44, 1.0, 11.65], 'concrete');
  });
  for (const c of DEPOT_TANKS) {
    block(b, 28.5, 37.5, c - 0.8, c + 0.8, 0.6, 'concrete', 'slab');
    b.paint({ side: 'tank.silver', top: 'tank.silver', bottom: 'steel' }, () => {
      b.add([28.2, 0.6, c - 0.75], [37.8, 3.6, c + 0.75], 'metal');
      b.add([28.1, 0.8, c - 1.15], [37.9, 3.4, c + 1.15], 'metal');
      b.add([28, 1.2, c - 1.5], [38, 3.0, c + 1.5], 'metal');
    });
  }
  const pump = { x0: 40, x1: 44, z0: 14, z1: 19, thickness: 0.2 };
  room(b, { ...pump, bottom: 0, height: 3, material: 'concrete', look: wallLook('yard.wall'), west: [door(16)], north: [glazed(41.2, 42.8)] });
  flatRoof(b, pump, 3, 0.15);
  block(b, 40.5, 44, 20.5, 24, CAR_FLOOR, 'concrete', 'slab');
  b.paint('slab', () => b.stairs({ along: 'x', from: 39.2, to: 40.5, across: [20.5, 24], bottom: 0, top: CAR_FLOOR, material: 'concrete', maxRise: 0.4 }));
}

/** The depot's tanks' centre lines (z). */
const DEPOT_TANKS = [15.5, 21.5] as const;

// ---------------------------------------------------------------------------
// Spawns, objectives and bots.

/** Team 2's spawns at the east end (x, z), facing west; team 1's mirror them at the west end. */
const END_SPAWNS: readonly (readonly [number, number])[] = [
  [50, -26],
  [50, -20.5],
  [49, -13],
  [51, -7],
  [49, -1],
  [51, 5],
  [49, 12],
  [51, 19],
  [49, 25],
];

function spawnSets(): { ffa: SpawnPoint[]; teams: [SpawnPoint[], SpawnPoint[]] } {
  const team = (s: -1 | 1) => END_SPAWNS.map(([x, z]): SpawnPoint => ({ position: [s * x, 0, z], yaw: s > 0 ? LOOK.west : LOOK.east }));
  const ffa: SpawnPoint[] = [];
  for (const s of [-1, 1] as const) {
    for (const [x, z] of [END_SPAWNS[1]!, END_SPAWNS[2]!, END_SPAWNS[5]!, END_SPAWNS[8]!]) ffa.push({ position: [s * x, 0, z], yaw: s > 0 ? LOOK.west : LOOK.east });
  }
  for (const [x, z, yaw] of [
    [-12, -26, null], // the long lane, by the lamp hut
    [12, -13.5, null], // south of the long lane
    [-24, -3, LOOK.east], // the alley between the cars
    [24.5, -3, LOOK.west],
    [-24, 7.5, LOOK.east], // the service road
    [20, 13, null], // between the shed and the depot
    [-30, 26, LOOK.east], // the back alley
    [4, 26, LOOK.west],
  ] as const) {
    ffa.push({ position: [x, 0, z], yaw: yaw ?? faceCentre(x, z) });
  }
  return { ffa, teams: [team(-1), team(1)] };
}

/** Outposts: one zone on each lane, all three at the yard's middle: the long lane, between the rows of cars, and in the engine shed. */
const ZONES: readonly Zone[] = [
  { id: 'A', name: 'Long lane', center: [0, 0, -20.5], radius: 4, height: 3 },
  { id: 'B', name: 'The cars', center: [0, 0, -3], radius: 3, height: 3 },
  { id: 'C', name: 'Engine shed', center: [2, 0, 14.5], radius: 2.5, height: 3 },
];

/** Charge: both sites are at the east end, where team 2 (the second team set) starts: A is the signal box's lever room, B the fuel depot. */
const SITES: readonly ChargeSite[] = [
  { id: 'A', name: 'Signal box', min: [SIGNAL_BOX.x0 + 0.1, SIGNAL_BOX.floor - 0.1, SIGNAL_BOX.z0 + 0.1], max: [SIGNAL_BOX.x1 - 0.1, SIGNAL_BOX.top - 0.2, SIGNAL_BOX.z1 - 0.1] },
  { id: 'B', name: 'Fuel depot', min: [27, 0, 12.5], max: [44, 2.6, 25.5] },
];

/** Both sides of a door through a wall along x at `z` (from `x0` along it), or along z at `x`. */
function doorHintsX(x0: number, z: number, y = 0, reach = 0.8): Vec3[] {
  const x = x0 + DOOR_W / 2;
  return [[x, y, z - reach], [x, y, z + reach]];
}
function doorHintsZ(x: number, z0: number, y = 0, reach = 0.8): Vec3[] {
  const z = z0 + DOOR_W / 2;
  return [[x - reach, y, z], [x + reach, y, z]];
}

/**
 * Where the nav grid needs help: both sides of every door, the stairs, the
 * pallet steps into the open boxcars, the crate climbs onto the car roofs,
 * and the platforms' steps. Each node stands on the surface at or below its hint.
 */
function navHints(): Vec3[] {
  const hints: Vec3[] = [];
  // The workshop.
  for (const x of [-39.5, -30.5]) hints.push(...doorHintsX(x, 12.5));
  for (const x of [-37, -31]) hints.push(...doorHintsX(x, 23.5));
  for (const x of [-42, -34, -26]) hints.push(...doorHintsZ(x, 17));
  // The engine shed's doors and platform steps.
  for (const x of [-3, 9]) hints.push(...doorHintsX(x, 12.5));
  hints.push(...doorHintsX(14.2, 24));
  hints.push([-6.1, 0, 22.7], [-3.5, CAR_FLOOR, 22.7], [14.0, 0, 22.4], [11.5, CAR_FLOOR, 22.7]);
  // The signal box: its doors, and each stair from its foot to the landing and in at the door.
  hints.push(...doorHintsX(22.5, SIGNAL_BOX.z1), ...doorHintsX(24.6, SIGNAL_BOX.z0));
  for (const [a, c] of [SIGNAL_STAIRS.west, SIGNAL_STAIRS.east]) {
    const x = (a + c) / 2;
    const inward = x < SIGNAL_BOX.x0 ? 1 : -1;
    hints.push([x, 0, -1.6], [x, 1.5, -5.9], [x, 3.0, -10.1], [x + inward * 1.9, 3.0, -9.9]);
  }
  hints.push([23.5, 3.0, -10.5]);
  // Into the open boxcars and out the other side.
  for (const [x0, x1, c] of OPEN_BOXCARS) {
    const x = (x0 + x1) / 2;
    hints.push([x, 0, c - 3.0], [x, CAR_FLOOR, c - 1.9], [x, CAR_FLOOR, c], [x, CAR_FLOOR, c + 1.9], [x, 0, c + 3.0]);
  }
  // Up the crates onto the closed boxcars' roofs.
  for (const { low, high, z } of ROOF_CLIMBS) {
    const zc = (z[0] + z[1]) / 2;
    const out = zc < 0 ? -1 : 1;
    const lx = (low[0] + low[1]) / 2;
    const hx = (high[0] + high[1]) / 2;
    const roofZ = zc < 0 ? TRACKS.rowA : TRACKS.rowB;
    hints.push([lx, 0, zc + out * 1.4], [lx, CLIMB_LOW, zc], [hx, CLIMB_HIGH, zc], [hx, CAR_ROOF, roofZ], [hx - 4, CAR_ROOF, roofZ], [hx + 4, CAR_ROOF, roofZ]);
  }
  // The coaling stage, the pump house and the loading dock.
  hints.push([-13.3, 0, 22], [-15.5, CAR_FLOOR, 22], [-18, CAR_FLOOR, 22]);
  hints.push(...doorHintsZ(40, 16));
  hints.push([38.7, 0, 22.2], [40.8, CAR_FLOOR, 22.2], [42.5, CAR_FLOOR, 22.2]);
  // The lamp hut.
  hints.push(...doorHintsX(-7.2, -25.4));
  return hints;
}

function navOptions(): NavOptions {
  return { area: BOUNDARY, spacing: 2, hints: navHints(), ceiling: 8 };
}

function indoorZones(): IndoorZone[] {
  const box = SIGNAL_BOX;
  return [
    { name: 'workshop', min: [-42, 0, 12.5], max: [-26, 4, 23.5] },
    { name: 'engine shed', min: [-8, 0, 12.5], max: [16, 7, 24] },
    { name: 'relay room', min: [box.x0, 0, box.z0], max: [box.x1, box.floor, box.z1] },
    { name: 'lever room', min: [box.x0, box.floor, box.z0], max: [box.x1, box.top, box.z1] },
    { name: 'pump house', min: [40, 0, 14], max: [44, 3, 19] },
    { name: 'lamp hut', min: [-8, 0, -27.4], max: [-5, 2.6, -25.4] },
  ];
}

// ---------------------------------------------------------------------------
// Cameras.

const EYE = 1.6;

function referenceSpots(): CameraSpot[] {
  const up = SIGNAL_BOX.floor + EYE;
  return [
    { name: 'west spawn', position: [-50, EYE, -3], yaw: LOOK.east, pitch: -0.03 },
    { name: 'east spawn', position: [50, EYE, -3], yaw: LOOK.west, pitch: -0.03 },
    { name: 'long lane west', position: [-40, EYE, -20.5], yaw: LOOK.east, pitch: 0 },
    { name: 'long lane east', position: [40, EYE, -20.5], yaw: LOOK.west, pitch: 0 },
    { name: 'between the cars', position: [-20, EYE, -3], yaw: LOOK.east, pitch: 0 },
    { name: 'boxcar roof', position: [7, CAR_ROOF + EYE, TRACKS.rowA], yaw: LOOK.west, pitch: -0.15 },
    { name: 'lever room', position: [23.5, up, -10.5], yaw: LOOK.north, pitch: -0.08 },
    { name: 'relay room', position: [23.5, EYE, -9.5], yaw: LOOK.west, pitch: 0 },
    { name: 'service road', position: [0, EYE, 9.8], yaw: LOOK.east, pitch: 0 },
    { name: 'engine shed', position: [2, EYE, 14.5], yaw: LOOK.east, pitch: 0.05 },
    { name: 'shed platform', position: [4, CAR_FLOOR + EYE, 22.7], yaw: LOOK.west, pitch: -0.05 },
    { name: 'workshop', position: [-38, EYE, 18], yaw: LOOK.east, pitch: 0 },
    { name: 'fuel depot', position: [33, EYE, 18.5], yaw: LOOK.east, pitch: 0 },
    { name: 'back alley', position: [-10, EYE, 26], yaw: LOOK.east, pitch: 0 },
    { name: 'overview', position: [0, 40, 50], yaw: LOOK.north, pitch: -0.75 },
  ];
}

/** Down the strip south of the long lane, round the east end, back along the service road, then through the workshop, the shed and the depot. */
function benchmarkPath(): CameraKey[] {
  const k = (x: number, z: number, yaw: number, pitch = 0): CameraKey => ({ position: [x, EYE, z], yaw, pitch });
  return [
    k(-40, -13.5, LOOK.east),
    k(-10, -13.5, LOOK.east + 0.3),
    k(30, -13.5, LOOK.east - 0.3),
    k(47, -13.5, LOOK.south),
    k(47, 9.6, LOOK.west),
    k(10, 9.6, LOOK.west + 0.4),
    k(-29.9, 9.6, LOOK.south),
    k(-29.9, 17.6, LOOK.east),
    k(-12, 17.6, LOOK.east),
    k(-4, 17.6, LOOK.north),
    k(-4, 14.5, LOOK.east),
    k(14, 14.5, LOOK.south),
    k(14, 17.6, LOOK.east),
    k(24, 18.5, LOOK.east),
    k(39, 18.5, LOOK.east),
  ];
}

/** A slow ellipse above the yard, looking in at its middle. */
function flyThrough(): CameraKey[] {
  const keys: CameraKey[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 72;
    const z = Math.cos(a) * 46;
    const y = 18 + Math.sin(a * 2) * 4;
    keys.push({ position: [x, y, z], yaw: faceCentre(x, z), pitch: -Math.atan2(y - 2, Math.hypot(x, z)) });
  }
  return keys;
}

export function buildSwitchyard(): MapDefinition {
  const b = new Builder();
  buildGround(b);
  buildPerimeter(b);
  buildTracks(b);
  buildCover(b);
  buildScreens(b);
  buildSignalBox(b);
  buildEngineShed(b);
  buildWorkshop(b);
  buildDepot(b);
  buildScenery(b);
  buildBoundary(b);
  const spawns = spawnSets();
  return {
    id: 'switchyard',
    name: 'Switchyard',
    solids: b.solids,
    hiddenSolids: b.hidden,
    finishes: FINISHES,
    looks: b.looks,
    decorations: b.decorations,
    ramps: [],
    labels: [],
    populationSign: null,
    horizon: { ground: 'land', inner: { x0: -160, x1: 160, z0: -120, z1: 120 }, light: [-120, 90] },
    // The freight train comes with ticket 15.
    nuke: null,
    ambience: [{ kind: 'wind' }, { kind: 'birds', position: [0, 7.5, -29.5] }, { kind: 'birds', position: [-60, 7.5, -29.5] }, { kind: 'radio', position: [23.5, 4, -9] }],
    spawns,
    zones: ZONES,
    sites: SITES,
    offlineSpawn: spawns.teams[0][2]!,
    overview: { name: 'overview', position: [0, 40, 50], yaw: LOOK.north, pitch: -0.75 },
    dummies: [],
    loadoutStation: null,
    indoorZones: indoorZones(),
    referenceSpots: referenceSpots(),
    benchmarkPath: benchmarkPath(),
    flyThrough: flyThrough(),
    playArea: PLAY_AREA,
    nav: navOptions(),
    measurements: [],
  };
}
