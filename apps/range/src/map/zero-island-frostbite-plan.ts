import { octagon, wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * Frostbite Peaks' plan (ticket 21): a snowed-in radar base on the plateau
 * under the summit. Data only (see `zero-island-region.ts`): the terrain reads
 * the pads, the map stands the pieces, and tools/map/regions/frostbite.py
 * builds their looks inside these boxes.
 *
 * - The ops building: two rooms, a door in each long side and one between,
 *   a concrete stair up its end to a roof with a parapet, a mast and a plant
 *   unit to get behind.
 * - Two barracks huts under snowy gable roofs, a door at each end, bunks inside.
 * - The radar plateau: a radome on a drum on a raised plinth with steps up,
 *   and a dish on a lattice over its equipment hut.
 * - The watchtower: a cabin on four legs, an open steel stair up to it.
 * - The cableway, stopped: its station (two cars parked on the platform under
 *   the bullwheel), the haul rope out to a pylon at the plateau's edge, and a
 *   car hanging still over the snow. The rope runs level: a box doesn't tilt.
 * - Round them, ice walls, sandbag walls, crates, fuel drums and snowcats
 *   (`FB_EXTRA`), dressed by the kit like the cover pass's pieces.
 *
 * The summit is scenery: the terrain's cliff keeps everyone off it.
 * Doors are 3 m wide and stairs 2.4 m: the nav's grid always finds a way through.
 */

/** The base's middle and the plateau's level (zero-island-terrain.ts's Core). */
export const FB = { x: -75, z: -330, floor: 48 } as const;

const DOOR = 3;
const TREAD = 0.45;

/**
 * A flight of `count` steps rising `rise` from the floor along +x (or -x for
 * `dir` -1) from `x0`, `z0` to `z1` across. Solid down to the floor, or open
 * treads `tread` thick (a steel stair).
 */
function flight(x0: number, rise: number, count: number, z0: number, z1: number, dir: 1 | -1, part: string, tread?: number): PartBox[] {
  return Array.from({ length: count }, (_, k): PartBox => {
    const top = (rise * (k + 1)) / count;
    const bottom = tread === undefined ? 0 : top - tread;
    const [a, b] = [x0 + dir * TREAD * k, x0 + dir * TREAD * (k + 1)];
    return { part, c: [(a + b) / 2, (bottom + top) / 2, (z0 + z1) / 2], s: [TREAD, top - bottom, z1 - z0], ...(tread === undefined ? {} : { material: 'metal' as const }) };
  });
}

/** A crate in a piece, `h` tall and `w` a side. */
const crate = (x: number, z: number, w: number, h: number, yaw = 0): PartBox => ({ part: 'crate', c: [x, h / 2, z], s: [w, h, w], yaw, material: 'wood' });

/**
 * The ops building: 18 by 10 m, 4 m to its roof, two rooms. Its stair climbs
 * the +x end to the roof, through a gap in the parapet.
 */
const OPS_HIGH = 4;
const OPS_ROOF = 4.3;
const OPS: BuiltPiece = {
  near: 140,
  boxes: [
    ...wallBoxes('ops-wall', -9.15, 9.15, 5, 0.3, -0.6, OPS_HIGH, [
      { from: -6, to: -6 + DOOR, bottom: -0.6, top: 2.4 },
      { from: 0.6, to: 2.6, bottom: 1.1, top: 2.2 },
      { from: 5, to: 7, bottom: 1.1, top: 2.2 },
    ]),
    ...wallBoxes('ops-wall', -9.15, 9.15, -5, 0.3, -0.6, OPS_HIGH, [
      { from: 2, to: 2 + DOOR, bottom: -0.6, top: 2.4 },
      { from: -7.4, to: -5.4, bottom: 1.1, top: 2.2 },
      { from: -2.6, to: -0.6, bottom: 1.1, top: 2.2 },
    ]),
    ...wallBoxes('ops-wall', -4.85, 4.85, -9, 0.3, -0.6, OPS_HIGH, [{ from: -1, to: 1, bottom: 1.1, top: 2.2 }], 'z'),
    ...wallBoxes('ops-wall', -4.85, 4.85, 9, 0.3, -0.6, OPS_HIGH, [], 'z'),
    // The wall between the rooms, a door through it.
    ...wallBoxes('inner-wall', -4.85, 4.85, -1, 0.25, -0.6, OPS_HIGH, [{ from: -1.5, to: -1.5 + DOOR, bottom: -0.6, top: 2.4 }], 'z'),
    { part: 'roof', c: [0, (OPS_HIGH + OPS_ROOF) / 2, 0], s: [18.3, OPS_ROOF - OPS_HIGH, 10.3] },
    // The parapet, knee high, open where the stair comes up.
    { part: 'parapet', c: [0, OPS_ROOF + 0.3, 5.025], s: [18.3, 0.6, 0.25] },
    { part: 'parapet', c: [0, OPS_ROOF + 0.3, -5.025], s: [18.3, 0.6, 0.25] },
    { part: 'parapet', c: [-9.025, OPS_ROOF + 0.3, 0], s: [0.25, 0.6, 9.8] },
    { part: 'parapet', c: [9.025, OPS_ROOF + 0.3, 3.25], s: [0.25, 0.6, 3.3] },
    { part: 'parapet', c: [9.025, OPS_ROOF + 0.3, -3.25], s: [0.25, 0.6, 3.3] },
    ...flight(9.15 + 11 * TREAD, OPS_ROOF, 11, -1.3, 1.3, -1, 'step'),
    // On the roof: a plant unit and the radio mast to get behind.
    { part: 'plant', c: [-4, OPS_ROOF + 0.7, -1.6], s: [2.6, 1.4, 1.8], material: 'metal' },
    { part: 'mast', c: [-6.8, OPS_ROOF + 3, 2.6], s: [0.4, 6, 0.4], material: 'metal' },
    // Inside: desks, lockers and crates.
    { part: 'desk', c: [-5.5, 0.4, -3.2], s: [2.4, 0.8, 1], material: 'wood' },
    { part: 'desk', c: [4.6, 0.4, 3.4], s: [2.4, 0.8, 1], material: 'wood' },
    { part: 'locker', c: [-8.4, 1, 2.6], s: [0.7, 2, 2.2], material: 'metal' },
    { part: 'locker', c: [8.4, 1, -1.6], s: [0.7, 2, 2.2], material: 'metal' },
    crate(6.2, -3.4, 1.3, 1.2),
    crate(-3.2, 3.4, 1.2, 1.1, 0.3),
  ],
};

/** A barracks hut: 12 by 7 m under a gable roof, a door at each end, windows down the sides, bunks inside. */
const HUT_HIGH = 3;
const BARRACKS: BuiltPiece = {
  near: 110,
  boxes: [
    ...wallBoxes('hut-wall', -6.125, 6.125, 3.5, 0.25, -0.6, HUT_HIGH, [
      { from: -4.2, to: -2.8, bottom: 1.1, top: 2.0 },
      { from: -0.7, to: 0.7, bottom: 1.1, top: 2.0 },
      { from: 2.8, to: 4.2, bottom: 1.1, top: 2.0 },
    ]),
    ...wallBoxes('hut-wall', -6.125, 6.125, -3.5, 0.25, -0.6, HUT_HIGH, [
      { from: -4.2, to: -2.8, bottom: 1.1, top: 2.0 },
      { from: 2.8, to: 4.2, bottom: 1.1, top: 2.0 },
    ]),
    ...wallBoxes('hut-wall', -3.375, 3.375, -6, 0.25, -0.6, HUT_HIGH, [{ from: -1.5, to: 1.5, bottom: -0.6, top: 2.3 }], 'z'),
    ...wallBoxes('hut-wall', -3.375, 3.375, 6, 0.25, -0.6, HUT_HIGH, [{ from: -1.5, to: 1.5, bottom: -0.6, top: 2.3 }], 'z'),
    { part: 'gable', c: [0, HUT_HIGH + 0.75, 0], s: [12.6, 1.5, 7.6], material: 'metal' },
    ...[-4.2, -1.2, 1.8].map((x): PartBox => ({ part: 'bunk', c: [x, 0.85, 2.85], s: [2, 1.7, 0.9], material: 'metal' })),
    ...[-3.6, 0.6].map((x): PartBox => ({ part: 'bunk', c: [x, 0.85, -2.85], s: [2, 1.7, 0.9], material: 'metal' })),
    crate(4.2, -2.6, 1.2, 1.1, 0.2),
  ],
};

/** The radome: a plinth chest high with steps up, a drum and the dome on it, a rail round the plinth's edge. */
const PLINTH = 1.6;
const RADOME: BuiltPiece = {
  near: 180,
  boxes: [
    { part: 'plinth', c: [0, (PLINTH - 0.6) / 2, 0], s: [12, PLINTH + 0.6, 12] },
    ...flight(6 + 4 * TREAD, PLINTH, 4, -1.3, 1.3, -1, 'step'),
    ...octagon('drum', 3.6, PLINTH, PLINTH + 2.2),
    { part: 'dome', c: [0, PLINTH + 2.2 + 2.05, 0], s: [8.2, 4.1, 8.2], material: 'plastic' },
    { part: 'rail', c: [0, PLINTH + 0.55, 5.94], s: [12, 1.1, 0.06], material: 'metal' },
    { part: 'rail', c: [0, PLINTH + 0.55, -5.94], s: [12, 1.1, 0.06], material: 'metal' },
    { part: 'rail', c: [-5.94, PLINTH + 0.55, 0], s: [0.06, 1.1, 11.76], material: 'metal' },
    { part: 'rail', c: [5.94, PLINTH + 0.55, 3.6], s: [0.06, 1.1, 4.56], material: 'metal' },
    { part: 'rail', c: [5.94, PLINTH + 0.55, -3.6], s: [0.06, 1.1, 4.56], material: 'metal' },
    { part: 'cabinet', c: [4.4, PLINTH + 0.8, 4.6], s: [1.6, 1.6, 0.8], material: 'metal' },
    { part: 'cabinet', c: [-4.6, PLINTH + 0.8, -4.2], s: [0.8, 1.6, 1.6], material: 'metal' },
  ],
};

/** The dish: on a deck on four legs, its equipment hut between them. */
const DISH: BuiltPiece = {
  near: 180,
  boxes: [
    ...[[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]].map(([x, z]): PartBox => ({ part: 'leg', c: [x!, 2.9, z!], s: [0.35, 7, 0.35], material: 'metal' })),
    { part: 'beam', c: [0, 3.4, -2.1], s: [3.85, 0.25, 0.25], material: 'metal' },
    { part: 'beam', c: [0, 3.4, 2.1], s: [3.85, 0.25, 0.25], material: 'metal' },
    { part: 'beam', c: [-2.1, 3.4, 0], s: [0.25, 0.25, 3.85], material: 'metal' },
    { part: 'beam', c: [2.1, 3.4, 0], s: [0.25, 0.25, 3.85], material: 'metal' },
    { part: 'deck', c: [0, 6.55, 0], s: [5, 0.3, 5], material: 'metal' },
    { part: 'pedestal', c: [0, 7.3, 0], s: [1.2, 1.2, 1.2], material: 'metal' },
    { part: 'dish', c: [0.4, 7.9 + 2.6, 0], s: [3.6, 5.2, 6.2], material: 'metal' },
    { part: 'equipment', c: [0, 0.7, 0], s: [2.8, 2.6, 2.8], material: 'metal' },
  ],
};

/** The watchtower: a cabin on four legs, 6 m up, waist-high walls round it; its open steel stair climbs along +x. */
const CABIN = 6;
const TOWER: BuiltPiece = {
  near: 150,
  boxes: [
    ...[[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].map(([x, z]): PartBox => ({ part: 'leg', c: [x!, (CABIN - 0.3 - 0.6) / 2, z!], s: [0.35, CABIN - 0.3 + 0.6, 0.35], material: 'metal' })),
    { part: 'beam', c: [0, 2.6, -2.2], s: [4.05, 0.25, 0.25], material: 'metal' },
    { part: 'beam', c: [0, 2.6, 2.2], s: [4.05, 0.25, 0.25], material: 'metal' },
    { part: 'beam', c: [-2.2, 2.6, 0], s: [0.25, 0.25, 4.05], material: 'metal' },
    { part: 'floor', c: [0, CABIN - 0.15, 0], s: [5, 0.3, 5], material: 'wood' },
    { part: 'cabin-wall', c: [0, CABIN + 0.55, 2.425], s: [5, 1.1, 0.15], material: 'wood' },
    { part: 'cabin-wall', c: [0, CABIN + 0.55, -2.425], s: [5, 1.1, 0.15], material: 'wood' },
    { part: 'cabin-wall', c: [-2.425, CABIN + 0.55, 0], s: [0.15, 1.1, 4.7], material: 'wood' },
    { part: 'cabin-wall', c: [2.425, CABIN + 0.55, 1.825], s: [0.15, 1.1, 1.05], material: 'wood' },
    { part: 'cabin-wall', c: [2.425, CABIN + 0.55, -1.825], s: [0.15, 1.1, 1.05], material: 'wood' },
    ...[[-2.35, -2.35], [2.35, -2.35], [-2.35, 2.35], [2.35, 2.35]].map(([x, z]): PartBox => ({ part: 'post', c: [x!, CABIN + 1.1 + 0.85, z!], s: [0.2, 1.7, 0.2], material: 'wood' })),
    { part: 'cabin-roof', c: [0, CABIN + 2.8 + 0.25, 0], s: [5.6, 0.5, 5.6], material: 'metal' },
    ...flight(2.5 + 16 * TREAD, CABIN, 16, -1.2, 1.2, -1, 'tread', CABIN / 16),
  ],
};

/**
 * The cableway along +x: the station (-x), its platform knee high, a roof on
 * columns over the bullwheel and the parked cars; the haul rope out to the
 * pylon (+x) and its return wheel, one car stopped on the rope between.
 */
const DECK = 1;
const ROPE_Y = 6.1;
const ROPE_Z = 1.7;
/** The wheels' boxes: the rim round the rope, and the hub up to the roof or a cap on the pylon. */
const WHEEL_Y = 6.2;
/** A car: its cabin `y0` up, its hanger up to the rope or the station's rail. */
const car = (x: number, z: number, y0: number, up: number): PartBox[] => [
  { part: 'car', c: [x, y0 + 1.3, z], s: [2.2, 2.6, 2.2], material: 'metal' },
  { part: 'hanger', c: [x, y0 + 2.6 + (up - y0 - 2.6) / 2, z], s: [0.16, up - y0 - 2.6, 0.16], material: 'metal' },
];
const CABLEWAY: BuiltPiece = {
  near: 200,
  boxes: [
    { part: 'platform', c: [-17, (DECK - 0.6) / 2, 0], s: [12, DECK + 0.6, 8] },
    ...flight(-18.35, DECK, 3, 4, 6.4, 1, 'step'),
    ...[[-22.6, -3.6], [-22.6, 3.6], [-11.4, -3.6], [-11.4, 3.6]].map(([x, z]): PartBox => ({ part: 'column', c: [x!, DECK + 2.75, z!], s: [0.4, 5.5, 0.4] })),
    { part: 'station-wall', c: [-22.85, DECK + 2.25, 0], s: [0.3, 4.5, 6.8] },
    { part: 'station-roof', c: [-17, 6.65, 0], s: [12.6, 0.3, 8.6], material: 'metal' },
    { part: 'wheel', c: [-17, WHEEL_Y, 0], s: [3.7, 0.5, 3.7], material: 'metal' },
    { part: 'rail', c: [-17, 5.4, ROPE_Z], s: [10, 0.2, 0.2], material: 'metal' },
    { part: 'rail', c: [-17, 5.4, -ROPE_Z], s: [10, 0.2, 0.2], material: 'metal' },
    ...car(-19.6, -ROPE_Z, DECK, 5.3),
    ...car(-14.6, ROPE_Z, DECK, 5.3),
    // The haul rope, both ways, from the bullwheel to the return wheel.
    { part: 'rope', c: [(-15.15 + 18.15) / 2, ROPE_Y, ROPE_Z], s: [33.3, 0.08, 0.08], material: 'metal' },
    { part: 'rope', c: [(-15.15 + 18.15) / 2, ROPE_Y, -ROPE_Z], s: [33.3, 0.08, 0.08], material: 'metal' },
    ...car(3, ROPE_Z, 2.4, ROPE_Y - 0.04),
    // The pylon: four legs, a crossarm and the return wheel on it.
    ...[[18.8, -1.2], [21.2, -1.2], [18.8, 1.2], [21.2, 1.2]].map(([x, z]): PartBox => ({ part: 'leg', c: [x!, (5.55 - 0.6) / 2, z!], s: [0.3, 5.55 + 0.6, 0.3], material: 'metal' })),
    { part: 'beam', c: [20, 2.8, -1.2], s: [2.1, 0.22, 0.22], material: 'metal' },
    { part: 'beam', c: [20, 2.8, 1.2], s: [2.1, 0.22, 0.22], material: 'metal' },
    { part: 'crossarm', c: [20, 5.75, 0], s: [2.7, 0.4, 4.4], material: 'metal' },
    { part: 'wheel', c: [20, WHEEL_Y, 0], s: [3.7, 0.5, 3.7], material: 'metal' },
  ],
};

/** Frostbite Peaks' built pieces, by asset name in the kit. */
export const FB_PIECES = {
  'fb-ops': OPS,
  'fb-barracks': BARRACKS,
  'fb-radome': RADOME,
  'fb-dish': DISH,
  'fb-tower': TOWER,
  'fb-cableway': CABLEWAY,
} as const satisfies Record<string, BuiltPiece>;

const at = (dx: number, dz: number) => ({ x: FB.x + dx, z: FB.z + dz });

/** The cableway runs from the base toward the summit, its pylon at the plateau's edge. */
const UPHILL = Math.PI - 0.71;

/** The base's one pad: the plateau is already level, so it only holds every floor to it, the pylon's corner too. */
export const FB_PADS: readonly Pad[] = [{ ...at(0, -2), halfX: 46, halfZ: 44, level: FB.floor, blend: 8 }];

export const FB_PLACED: readonly Placed[] = [
  { asset: 'fb-ops', ...at(8, 8), yaw: 0, pad: 0 },
  { asset: 'fb-barracks', ...at(-22, 20), yaw: 0.15, pad: 0 },
  { asset: 'fb-barracks', ...at(-2, 32), yaw: -0.1, pad: 0 },
  { asset: 'fb-radome', ...at(26, -20), yaw: 0, pad: 0 },
  { asset: 'fb-dish', ...at(8, -28), yaw: 0.5, pad: 0 },
  { asset: 'fb-tower', ...at(28, 28), yaw: 0, pad: 0 },
  { asset: 'fb-cableway', ...at(-18, -20), yaw: UPHILL, pad: 0 },
];

/** The base's extra pieces: ice walls, sandbag walls, crates, fuel drums and snowcats. Offset from its middle, footprint, height, turn. */
type Extra = readonly [kind: 'wall' | 'sandbags' | 'crate' | 'drums' | 'wreck', dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
const EXTRA: readonly Extra[] = [
  // Ice walls: blue ice heaved up through the snow, head high.
  ['wall', -40, 0, 12, 1.6, 3, 1.3],
  ['wall', -10, 12, 8, 1.4, 2.6, 0.3],
  ['wall', 40, 4, 10, 1.6, 2.8, 1.7],
  ['wall', 14, 36, 9, 1.4, 2.6, -0.2],
  ['wall', -38, -18, 8, 1.5, 2.8, 0.9],
  ['wall', 4, -42, 10, 1.6, 3, 0.1],
  ['wall', -28, 38, 8, 1.4, 2.6, 2.2],
  // Sandbag walls round the base, chest high.
  ['sandbags', -2, 18, 5, 1, 1.15, 0],
  ['sandbags', 22, -4, 5, 1, 1.15, Math.PI / 2],
  ['sandbags', -16, 4, 5, 1, 1.15, 0.8],
  ['sandbags', 18, 20, 4, 1, 1.15, 0.2],
  ['sandbags', 40, -24, 5, 1, 1.15, 1.4],
  // Crates of stores.
  ['crate', -14, 28, 2.2, 2.2, 1.3, 0.2],
  ['crate', 4, 22, 2.2, 2.2, 2.2, 0.5],
  ['crate', 22, -34, 2.2, 2.2, 1.3, 0.1],
  ['crate', -30, 8, 2.2, 2.2, 2.2, 0.7],
  ['crate', 38, -8, 2.2, 2.2, 1.3, 0.3],
  ['crate', -6, -38, 2.2, 2.2, 2.2, 0.4],
  ['crate', 14, -18, 2.2, 2.2, 2.2, 0.6],
  // Fuel drums.
  ['drums', -6, 24, 2.4, 2.4, 1, 0.3],
  ['drums', 16, -12, 2.4, 2.4, 1, 0.9],
  ['drums', -40, 24, 2.4, 2.4, 1, 0],
  ['drums', 26, 4, 2.4, 2.4, 1, 1.2],
  // Snowcats, parked where they stopped.
  ['wreck', 8, -12, 4.4, 2.2, 2.3, 0.2],
  ['wreck', -32, 26, 4.4, 2.2, 2.3, 1.9],
  ['wreck', 30, 10, 4.4, 2.2, 2.3, -0.4],
  ['wreck', -20, -36, 4.4, 2.2, 2.3, 0.7],
];

export const FB_EXTRA = EXTRA.map(([kind, dx, dz, width, depth, height, yaw]) => ({ kind, ...at(dx, dz), width, depth, height, yaw }));

/** How Frostbite Peaks' kit dresses the cover pass's pieces there (and its own extras), by their kind. */
export const FB_KIT: Readonly<Record<string, KitDress>> = {
  shed: { asset: 'fb-hut', fit: 'stretch', near: 70, far: 2000 },
  wall: { asset: 'fb-icewall', fit: 'stretch', near: 60, far: 900 },
  sandbags: { asset: 'fb-sandbags', fit: 'stretch', near: 40, far: 500 },
  crate: { asset: 'fb-crates', fit: 'stretch', near: 40, far: 500 },
  drums: { asset: 'fb-drums', fit: 'stretch', near: 40, far: 400 },
  wreck: { asset: 'fb-snowcat', fit: 'stand', near: 50, far: 700 },
};
