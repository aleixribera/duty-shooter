import { wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * Rogue Harbor's plan (ticket 19): a container port on the south coast, a
 * cargo ship moored at its quay, and the airstrip up the coast. Data only (see
 * `zero-island-region.ts`): the terrain reads the pads, the map stands the
 * pieces, and tools/map/regions/harbor.py builds their looks inside these boxes.
 *
 * - The quay: a concrete edge along the shore, levelled out of the beach, with
 *   bollards and fenders, and two portal cranes on it, their booms out over
 *   the ship (walk under their portals).
 * - The cargo ship alongside: its hull in the shallows, its deck 3.6 m over the
 *   quay, reached by two gangway stairs from the quay, three bays of containers
 *   on it with lanes between, the bridge house aft.
 * - Two warehouses in the yard: steel sheds under a barrel roof, a big door in
 *   each end and two in each side, racks of goods inside.
 * - A hangar by the airstrip, open along its front.
 * - The container yard between them (`RH_EXTRA`): blocks of containers one
 *   and two high with lanes between, site offices, crates, trucks, all
 *   dressed by the kit like the cover pass's pieces.
 *
 * Doors are 3 m wide or more: the nav's 2 m grid, less a body's width each
 * side, always finds a way through one.
 */

/** The yard's middle and the dock's level (zero-island-terrain.ts's Core). */
export const HB = { x: 95, z: 401, floor: 2.4 } as const;

const DOOR = 3;

/** A crate in a piece, `h` tall and `w` a side. */
const crate = (x: number, z: number, w: number, h: number, yaw = 0): PartBox => ({ part: 'crate', c: [x, h / 2, z], s: [w, h, w], yaw, material: 'wood' });

/**
 * The cargo ship, along x bow first, its stern (and the house) at -x, the quay
 * on its +z side. Its floor is the sea bed, 0.6 m under the water: the hull's
 * foot sits in it, its deck 6.6 m up (3.6 m over the quay's top).
 */
const DECK = 6.6;
/** The quay's top over the ship's floor. */
const QUAY_TOP = 3.0;
const RAIL = 1.1;
/** Where each gangway lands on deck (its platform's aft end), and the stair down from it, forward to aft. */
const GANGWAYS = [-9, 11];
const STEPS = 10;
const TREAD = 0.45;
/** A bay of containers: its middle along x, its length, and how many high each of its three rows stands. */
const BAYS: readonly (readonly [x: number, length: number, tiers: readonly [number, number, number]])[] = [
  [-9.5, 12.2, [2, 3, 1]],
  [4.5, 12.2, [1, 2, 2]],
  [15.45, 6.1, [2, 1, 1]],
];
const gangway = (gx: number): PartBox[] => [
  // The platform bridging the gap to the quay, at deck height, and the stair down onto the quay along -x.
  { part: 'gangway', c: [gx + 1.1, DECK - 0.15, 7.8], s: [2.2, 0.3, 3.6], material: 'metal' },
  ...Array.from({ length: STEPS - 1 }, (_, k): PartBox => {
    const top = QUAY_TOP + ((DECK - QUAY_TOP) * (k + 1)) / STEPS;
    const x1 = gx - (STEPS - 2 - k) * TREAD;
    return { part: 'step', c: [x1 - TREAD / 2, (QUAY_TOP + top) / 2, 8.4], s: [TREAD, top - QUAY_TOP, 2.4], material: 'metal' };
  }),
];
/** The deck's rail on the quay side, open where each gangway comes aboard. */
const quaySide = (): PartBox[] => {
  const out: PartBox[] = [];
  let from = -20;
  for (const gx of GANGWAYS) {
    out.push({ part: 'rail', c: [(from + gx) / 2, DECK + RAIL / 2, 5.925], s: [gx - from, RAIL, 0.15], material: 'metal' });
    from = gx + 2.2;
  }
  out.push({ part: 'rail', c: [(from + 18) / 2, DECK + RAIL / 2, 5.925], s: [18 - from, RAIL, 0.15], material: 'metal' });
  return out;
};
const SHIP: BuiltPiece = {
  near: 220,
  boxes: [
    { part: 'hull', c: [-1, (DECK - 1) / 2, 0], s: [38, DECK + 1, 12], material: 'metal' },
    { part: 'stern', c: [-23, (DECK - 1) / 2, 0], s: [6, DECK + 1, 12], material: 'metal' },
    // The bow, its bulwark rising to it, narrowing to the stem.
    { part: 'bow', c: [22, (DECK + RAIL - 1) / 2, 0], s: [8, DECK + RAIL + 1, 12], material: 'metal' },
    { part: 'rail', c: [-1, DECK + RAIL / 2, -5.925], s: [38, RAIL, 0.15], material: 'metal' },
    ...quaySide(),
    // The house aft: five decks, the bridge's wings out over the water each side, the funnel and the radar mast.
    { part: 'house', c: [-21.5, (DECK + 17.4) / 2, 0], s: [9, 17.4 - DECK, 10.8], material: 'metal' },
    { part: 'wing', c: [-17.75, 16.3, 6.2], s: [1.5, 2.2, 1.6], material: 'metal' },
    { part: 'wing', c: [-17.75, 16.3, -6.2], s: [1.5, 2.2, 1.6], material: 'metal' },
    { part: 'funnel', c: [-23.5, 19.9, 0], s: [3, 5, 3.6], material: 'metal' },
    { part: 'mast', c: [-19.5, 19.4, 0], s: [0.6, 4, 0.6], material: 'metal' },
    { part: 'boat', c: [-21.5, 13.6, -6.2], s: [5, 1.6, 1.6], material: 'metal' },
    // The containers: three bays, three rows across, lanes between the bays and down both sides.
    ...BAYS.flatMap(([x, length, tiers]) =>
      tiers.map((k, row): PartBox => ({ part: 'box-stack', c: [x, DECK + 1.3 * k, (row - 1) * 2.5], s: [length, 2.6 * k, 2.44], material: 'metal' })),
    ),
    // The windlass on the foredeck.
    { part: 'winch', c: [21, DECK + 0.5, 0], s: [1.6, 1, 2.6], material: 'metal' },
    ...GANGWAYS.flatMap(gangway),
  ],
};

/** The quay's edge: a concrete wall down into the sea along the levelled shore, bollards on its top, fenders on its face. */
const QUAY_LENGTH = 76;
const QUAY: BuiltPiece = {
  near: 160,
  boxes: [
    { part: 'quay-wall', c: [0, -1.8, 0], s: [QUAY_LENGTH, 3.6, 4.6] },
    ...[-33, -21, -9, 3, 23, 33].map((x): PartBox => ({ part: 'bollard', c: [x, 0.35, 1.5], s: [0.6, 0.7, 0.6], material: 'metal' })),
    ...[-27, -15, 9, 21, 33].map((x): PartBox => ({ part: 'fender', c: [x, -1.2, 2.45], s: [1.1, 1.3, 0.3], material: 'plastic' })),
  ],
};

/** A portal crane: four legs to walk under, its house on a turntable, its boom out along +x over the ship. */
const CRANE: BuiltPiece = {
  near: 260,
  boxes: [
    ...[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z]): PartBox => ({ part: 'leg', c: [x!, 4.7, z!], s: [0.8, 10.6, 0.8], material: 'metal' })),
    { part: 'portal', c: [0, 9.4, -4], s: [7.2, 1.2, 0.8], material: 'metal' },
    { part: 'portal', c: [0, 9.4, 4], s: [7.2, 1.2, 0.8], material: 'metal' },
    { part: 'portal', c: [-4, 9.4, 0], s: [0.8, 1.2, 7.2], material: 'metal' },
    { part: 'portal', c: [4, 9.4, 0], s: [0.8, 1.2, 7.2], material: 'metal' },
    { part: 'turntable', c: [0, 10.4, 0], s: [9.6, 0.8, 9.6], material: 'metal' },
    { part: 'machine-house', c: [-1, 13.3, 0], s: [7, 5, 5], material: 'metal' },
    { part: 'counterweight', c: [-6.2, 12.3, 0], s: [2.4, 3, 4.4] },
    { part: 'cab', c: [3.5, 12.6, 1.6], s: [2, 2.4, 1.8], material: 'metal' },
    { part: 'tower', c: [0.5, 19.7, 0], s: [2.4, 7.8, 3.2], material: 'metal' },
    { part: 'boom', c: [15.85, 24.2, 0], s: [28.3, 1.2, 1.4], material: 'metal' },
    { part: 'boom', c: [-4.35, 24.2, 0], s: [7.3, 1.2, 1.4], material: 'metal' },
  ],
};

/** A warehouse: 32 by 18 m of steel sheeting on a concrete plinth, a barrel roof, a 7 m door in each end and two doors in each side; racks inside. */
const SHED_HIGH = 7;
const ROOF_RISE = 3.2;
const WAREHOUSE: BuiltPiece = {
  near: 180,
  boxes: [
    ...[8.85, -8.85].flatMap((z) =>
      wallBoxes('shed-wall', -16, 16, z, 0.3, -0.6, SHED_HIGH, [
        { from: -9, to: -9 + DOOR, bottom: -0.6, top: 2.6 },
        { from: 6, to: 6 + DOOR, bottom: -0.6, top: 2.6 },
        { from: -13.5, to: -11, bottom: 4.2, top: 5.4 },
        { from: -1.25, to: 1.25, bottom: 4.2, top: 5.4 },
        { from: 11, to: 13.5, bottom: 4.2, top: 5.4 },
      ]),
    ),
    ...[15.85, -15.85].flatMap((x) => wallBoxes('shed-wall', -8.7, 8.7, x, 0.3, -0.6, SHED_HIGH, [{ from: -3.5, to: 3.5, bottom: -0.6, top: 5.5 }], 'z')),
    // The barrel roof, and the gable under it at each end.
    { part: 'barrel-roof', c: [0, SHED_HIGH + ROOF_RISE / 2, 0], s: [32.4, ROOF_RISE, 18.4], material: 'metal' },
    { part: 'gable', c: [15.85, SHED_HIGH + 1.5, 0], s: [0.3, 3, 17.4], material: 'metal' },
    { part: 'gable', c: [-15.85, SHED_HIGH + 1.5, 0], s: [0.3, 3, 17.4], material: 'metal' },
    // Racks of goods down each side of the aisle between the end doors.
    { part: 'rack', c: [-6, 1.8, 4.6], s: [10, 3.6, 1.4], material: 'wood' },
    { part: 'rack', c: [6, 1.8, -4.6], s: [10, 3.6, 1.4], material: 'wood' },
    crate(-12.5, -5.5, 1.4, 1.3),
    crate(-11, -6.2, 1.1, 1, 0.4),
    crate(12.4, 5.6, 1.4, 1.3, 0.2),
    crate(1.5, 6.4, 1.2, 1.1),
  ],
};

/** The hangar by the airstrip: 26 m along it, 22 deep, under an arch; open along its front (+z) but for its jambs, a door at the back. */
const HANGAR_WALL = 5;
const HANGAR: BuiltPiece = {
  near: 180,
  boxes: [
    ...wallBoxes('shed-wall', -12.7, 12.7, -10.85, 0.3, -0.6, HANGAR_WALL, [{ from: -1.5, to: 1.5, bottom: -0.6, top: 2.4 }]),
    ...[12.85, -12.85].flatMap((x) => wallBoxes('shed-wall', -11, 11, x, 0.3, -0.6, HANGAR_WALL, [{ from: -2, to: 1, bottom: -0.6, top: 2.4 }], 'z')),
    { part: 'jamb', c: [-11.35, 2.7, 10.85], s: [2.7, 6.6, 0.3], material: 'metal' },
    { part: 'jamb', c: [11.35, 2.7, 10.85], s: [2.7, 6.6, 0.3], material: 'metal' },
    { part: 'arch-roof', c: [0, HANGAR_WALL + 2.3, 0], s: [26, 4.6, 22], material: 'metal' },
    { part: 'hangar-gable', c: [0, HANGAR_WALL + 2.3, -10.85], s: [25.4, 4.6, 0.3], material: 'metal' },
    { part: 'hangar-gable', c: [0, 7.8, 10.85], s: [25.4, 3.6, 0.3], material: 'metal' },
    crate(-9.5, -8, 1.5, 1.4),
    crate(-7.8, -8.4, 1.2, 1.1, 0.5),
    crate(9, -7.5, 1.5, 2.2),
    { part: 'bench', c: [5, 0.45, -9.6], s: [3, 0.9, 0.9], material: 'wood' },
  ],
};

/** Rogue Harbor's built pieces, by asset name in the kit. */
export const RH_PIECES = {
  'rh-ship': SHIP,
  'rh-quay': QUAY,
  'rh-crane': CRANE,
  'rh-warehouse': WAREHOUSE,
  'rh-hangar': HANGAR,
} as const satisfies Record<string, BuiltPiece>;

const at = (dx: number, dz: number) => ({ x: HB.x + dx, z: HB.z + dz });
const pad = (dx: number, dz: number, halfX: number, halfZ: number, blend = 4): Pad => ({ ...at(dx, dz), halfX, halfZ, level: HB.floor, blend });

/** The ship's middle: alongside the quay, in the shallows. */
const SHIP_AT = at(45, 97.5);
/** The hangar: beside the airstrip's middle, its front to the strip. */
const HANGAR_AT = { x: 234, z: 279 };

/**
 * Rogue Harbor's pads: the yard is already level, so most only hold a
 * floor; the quay is the beach levelled to the dock's height out to the
 * water, its edge steep (the quay wall stands in it). The ship's is a spot of
 * sea bed; the hangar's, the ground by the strip.
 */
export const RH_PADS: readonly Pad[] = [
  { x: 134, z: 477, halfX: 38, halfZ: 13, level: HB.floor, blend: 1.5, surface: 'slab' },
  { ...SHIP_AT, halfX: 0.5, halfZ: 0.5, level: -0.6, blend: 0.5 },
  pad(-35, -21, 17, 10),
  pad(23, 25, 10, 17),
  { ...HANGAR_AT, halfX: 17, halfZ: 17.5, level: null, blend: 5 },
];

/** The quay piece's middle: its wall's outer face on the quay pad's edge. */
const QUAY_AT = { x: 134, z: 489.3 };

export const RH_PLACED: readonly Placed[] = [
  { asset: 'rh-quay', ...QUAY_AT, yaw: 0, pad: 0 },
  // The ship's bow points west, its quay side north.
  { asset: 'rh-ship', ...SHIP_AT, yaw: Math.PI, pad: 1 },
  // The cranes' booms reach south, out over the ship.
  { asset: 'rh-crane', x: 120, z: 481, yaw: -Math.PI / 2, pad: 0 },
  { asset: 'rh-crane', x: 152, z: 481, yaw: -Math.PI / 2, pad: 0 },
  { asset: 'rh-warehouse', ...at(-35, -21), yaw: 0, pad: 2 },
  { asset: 'rh-warehouse', ...at(23, 25), yaw: Math.PI / 2, pad: 3 },
  { asset: 'rh-hangar', ...HANGAR_AT, yaw: -0.978, pad: 4 },
];

/** What the kit's extra pieces in the yard are: containers, site offices, crates and trucks. Offset from the yard's middle, footprint, height, turn. */
type Extra = readonly [kind: 'container' | 'shed' | 'crate' | 'wreck', dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
/** A block of containers: rows side by side across the block, each one or two high. */
const block = (dx: number, dz: number, yaw: number, highs: readonly number[]): Extra[] =>
  highs.map((h, i): Extra => {
    const off = (i - (highs.length - 1) / 2) * 2.6;
    return ['container', dx + (yaw === 0 ? 0 : off), dz + (yaw === 0 ? off : 0), 12, 2.5, h, yaw];
  });
const EXTRA: readonly Extra[] = [
  // The yard: blocks with lanes between them, some rows one high to climb.
  ...block(5, -28, 0, [5.2, 2.6, 5.2]),
  ...block(5, -9, 0, [2.6, 5.2]),
  ...block(-8, 12, Math.PI / 2, [5.2, 2.6]),
  ...block(-30, 10, 0, [5.2, 5.2]),
  ...block(-28, 30, 0, [2.6, 5.2]),
  ...block(40, -10, Math.PI / 2, [5.2, 2.6]),
  ...block(4, 36, 0, [5.2, 2.6]),
  ['container', 22, -20, 12, 2.5, 2.6, 0.4],
  ['container', -14, -2, 12, 2.5, 2.6, 1.2],
  ['container', -22, 66, 12, 2.5, 2.6, 0],
  ['container', 64, 62, 12, 2.5, 5.2, 0.2],
  // Site offices.
  ['shed', -14, 30, 8, 3, 3.2, 0],
  ['shed', 28, -32, 8, 3, 3.2, 0.2],
  ['shed', 74, 72, 8, 3, 3.2, 0],
  // Crates.
  ['crate', -20, -4, 2.2, 2.2, 2.2, 0.3],
  ['crate', 16, 2, 2.2, 2.2, 1.3, 0.7],
  ['crate', 36, 10, 2.2, 2.2, 2.2, 0],
  ['crate', -2, 48, 2.2, 2.2, 1.3, 0.4],
  ['crate', 30, 72, 2.2, 2.2, 2.2, 0.2],
  ['crate', 2, 76, 2.2, 2.2, 1.3, 0.9],
  ['crate', -40, 44, 2.2, 2.2, 2.2, 0.5],
  // Trucks parked in the yard and on the quay.
  ['wreck', -22, 20, 6, 2.5, 2.6, 0.3],
  ['wreck', 22, 50, 6, 2.5, 2.6, 1.6],
  ['wreck', 44, 76, 6, 2.5, 2.6, 0.1],
];

export const RH_EXTRA = EXTRA.map(([kind, dx, dz, width, depth, height, yaw]) => ({ kind, ...at(dx, dz), width, depth, height, yaw }));

/**
 * How Rogue Harbor's kit dresses the cover pass's pieces there (and its own
 * extras), by their kit kind (`dressKind`): containers one high or stacked
 * two, each in two liveries, site offices, concrete walls, crates, cars
 * and trucks.
 */
export const RH_KIT: Readonly<Record<string, KitDress>> = {
  container: { asset: 'rh-container', fit: 'stretch', near: 60, far: 2000 },
  'container-b': { asset: 'rh-container-b', fit: 'stretch', near: 60, far: 2000 },
  stack: { asset: 'rh-stack', fit: 'stretch', near: 60, far: 2000 },
  'stack-b': { asset: 'rh-stack-b', fit: 'stretch', near: 60, far: 2000 },
  shed: { asset: 'rh-office', fit: 'stretch', near: 60, far: 2000 },
  wall: { asset: 'rh-wall', fit: 'stretch', near: 45, far: 1000 },
  crate: { asset: 'rh-crates', fit: 'stretch', near: 40, far: 500 },
  wreck: { asset: 'rh-car', fit: 'stand', near: 45, far: 600 },
  truck: { asset: 'rh-truck', fit: 'stand', near: 60, far: 1200 },
};
