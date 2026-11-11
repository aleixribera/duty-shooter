import { octagon, wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * Ground Zero's plan (ticket 17): the crater's floor round the core, and the
 * factory and the rail hub on its rim. Data only (see `zero-island-region.ts`):
 * the terrain reads the pads, the map stands the pieces, and
 * tools/map/regions/ground_zero.py builds their looks inside these boxes.
 *
 * - The core: the reactor, a ring of blast barriers round it, cooling pipes
 *   out to the four quarters in broken runs with gaps to cross at, four
 *   bunkers between the pipes, and three ruins further out. Everything
 *   stands on one level of scorched slab, the crater's floor.
 * - The factory on the rim to the north-east, looking down into the crater:
 *   a hall with machines inside, open at both ends, and its chimney.
 * - The rail hub on the ring's south side: a platform under a canopy, and a
 *   signal box behind it.
 *
 * Doors are 3 m wide: the nav's 2 m grid, less a body's width each side,
 * always finds a way through one.
 */

/** The crater's middle and the floor's level (zero-island-terrain.ts's `CRATER`). */
export const GZ = { x: 8, z: -42, floor: 3.4 } as const;

const pi = Math.PI;
const DOOR = 3;

/** A wall broken off at its top: spans of `step` metres at the given heights in turn, with gaps (doors, holes) left open. */
function ruinWall(from: number, to: number, at: number, thick: number, heights: readonly number[], gaps: readonly (readonly [number, number])[], along: 'x' | 'z'): PartBox[] {
  const out: PartBox[] = [];
  let k = 0;
  const spans: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of gaps) {
    spans.push([cursor, a]);
    cursor = b;
  }
  spans.push([cursor, to]);
  for (const [a, b] of spans) {
    const n = Math.max(1, Math.round((b - a) / 1.8));
    for (let i = 0; i < n; i++) {
      const height = heights[k++ % heights.length]!;
      out.push(...wallBoxes('ruin-wall', a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n, at, thick, -0.6, height, [], along));
    }
  }
  return out;
}

/** The reactor: a stepped octagonal plinth, the vessel and its cap. Its glowing core shows through slots in the vessel. */
const REACTOR: BuiltPiece = {
  near: 160,
  boxes: [
    ...octagon('plinth', 9.5, -0.6, 0.45),
    ...octagon('plinth', 7.5, 0.45, 0.9),
    ...octagon('vessel', 4.4, 0.9, 11),
    ...octagon('cap', 3.2, 11, 12.6, 'metal'),
  ],
};

/** A bunker: 10 by 7 m, walls 0.6 m, a roof slab, a door in each long side and firing slits in the ends. */
const BUNKER: BuiltPiece = {
  near: 90,
  boxes: [
    ...wallBoxes('bunker-wall', -5, 5, 3.2, 0.6, -0.6, 3, [{ from: -3.2, to: -3.2 + DOOR, bottom: -0.6, top: 2.3 }]),
    ...wallBoxes('bunker-wall', -5, 5, -3.2, 0.6, -0.6, 3, [{ from: 0.4, to: 0.4 + DOOR, bottom: -0.6, top: 2.3 }]),
    ...wallBoxes('bunker-wall', -2.9, 2.9, 4.7, 0.6, -0.6, 3, [{ from: -1.6, to: 1.6, bottom: 1.25, top: 1.6 }], 'z'),
    ...wallBoxes('bunker-wall', -2.9, 2.9, -4.7, 0.6, -0.6, 3, [{ from: -1.6, to: 1.6, bottom: 1.25, top: 1.6 }], 'z'),
    { part: 'bunker-roof', c: [0, 3.3, 0], s: [10.4, 0.6, 7.4] },
    { part: 'crate', c: [3.3, 0.55, -1.9], s: [1.4, 1.1, 1.4], yaw: 0.2, material: 'wood' },
    { part: 'crate', c: [-3.4, 0.45, 1.8], s: [1.2, 0.9, 1.2], material: 'wood' },
  ],
};

/** A ruin, L-shaped: two rooms with their roofs gone, the walls broken off at their tops, doors and blown-out windows. */
const RUIN_L: BuiltPiece = {
  near: 90,
  boxes: [
    ...ruinWall(-7, 7, -5, 0.5, [3.6, 3.1, 2.4, 3.4, 1.4, 2.8, 3.8, 2.2], [[-5, -5 + DOOR], [2, 3.6]], 'x'),
    ...ruinWall(-7, 1, 5, 0.5, [2.6, 1.6, 3.2, 2.1], [[-4, -4 + DOOR]], 'x'),
    ...ruinWall(-4.75, 4.75, -7, 0.5, [3.4, 2.7, 1.8, 3], [[-1.5, 1.5]], 'z'),
    ...ruinWall(-4.75, -0.25, 7, 0.5, [2.4, 3.6], [], 'z'),
    ...ruinWall(-0.25, 4.75, 1, 0.5, [1.2, 2.2], [], 'z'),
    ...ruinWall(1.25, 7, 0, 0.5, [2.8, 1.5, 3.3], [[2.4, 2.4 + DOOR]], 'x'),
    { part: 'rubble', c: [-3.5, 0.2, 1.8], s: [3, 1.6, 2.2], yaw: 0.3 },
    { part: 'rubble', c: [4.4, 0.05, -3], s: [2.2, 1.3, 1.6], yaw: -0.4 },
  ],
};

/** A smaller ruin: one room, three walls standing, the fourth fallen in. */
const RUIN_ROOM: BuiltPiece = {
  near: 90,
  boxes: [
    ...ruinWall(-5, 5, -4, 0.5, [3.2, 2.6, 3.7, 2.9, 1.7], [[-1.5, 1.5]], 'x'),
    ...ruinWall(-3.75, 3.75, -5, 0.5, [3, 2.2, 3.4, 1.6], [[0.2, 1.8]], 'z'),
    ...ruinWall(-3.75, 3.75, 5, 0.5, [2.4, 3.3, 1.5, 2.7], [[-2.8, -2.8 + DOOR]], 'z'),
    { part: 'rubble', c: [0.5, 0.25, 4.2], s: [6.4, 1.7, 2.6], yaw: 0.08 },
  ],
};

/** A run of cooling pipe on its saddles, from x 0 to 1 (scaled along its length): metal. */
const PIPE: BuiltPiece = {
  near: 70,
  boxes: [{ part: 'pipe', c: [0, 0.625, 0], s: [10, 2.45, 1.7], material: 'metal' }],
};

/** The factory: a hall 30 by 18 m and 8 m high, a wide door to the crater and another behind, windows high up, machines inside, and its chimney. */
const FACTORY_HIGH = 8;
const FACTORY: BuiltPiece = {
  near: 160,
  boxes: [
    ...wallBoxes('hall-wall', -15, 15, 8.75, 0.5, -0.6, FACTORY_HIGH, [{ from: -4, to: 4, bottom: -0.6, top: 5.5 }, { from: 9, to: 9 + DOOR, bottom: -0.6, top: 2.6 }]),
    ...wallBoxes('hall-wall', -15, 15, -8.75, 0.5, -0.6, FACTORY_HIGH, [{ from: 5, to: 11, bottom: -0.6, top: 4.6 }, { from: -12, to: -12 + DOOR, bottom: -0.6, top: 2.6 }]),
    ...wallBoxes('hall-wall', -8.5, 8.5, -14.75, 0.5, -0.6, FACTORY_HIGH, [{ from: -1.5, to: 1.5, bottom: -0.6, top: 2.6 }], 'z'),
    ...wallBoxes('hall-wall', -8.5, 8.5, 14.75, 0.5, -0.6, FACTORY_HIGH, [], 'z'),
    { part: 'hall-roof', c: [0, FACTORY_HIGH + 0.3, 0], s: [30.6, 0.6, 18.1] },
    { part: 'machine', c: [-8, 1.1, -2], s: [5, 2.2, 2.6], material: 'metal' },
    { part: 'machine', c: [8, 1.3, 2.5], s: [4, 2.6, 3], material: 'metal' },
    { part: 'machine', c: [1, 0.8, -4.5], s: [3.2, 1.6, 2], material: 'metal' },
    { part: 'crate', c: [-11.5, 0.6, 5.5], s: [1.6, 1.2, 1.6], material: 'wood' },
    { part: 'crate', c: [-9.6, 0.5, 6.3], s: [1.3, 1, 1.3], yaw: 0.35, material: 'wood' },
    { part: 'crate', c: [12.3, 0.6, -5.8], s: [1.6, 1.2, 1.6], material: 'wood' },
    { part: 'chimney', c: [17.5, 12.7, -5], s: [3.2, 26.6, 3.2] },
  ],
};

/** The rail hub: a platform beside the track under a canopy on posts, and a signal box behind it. Its floor is the track's level. */
const PLATFORM_TOP = 0.9;
const CANOPY = 4.4;
const STATION: BuiltPiece = {
  near: 120,
  boxes: [
    { part: 'platform', c: [0, (PLATFORM_TOP - 0.6) / 2, 0], s: [36, PLATFORM_TOP + 0.6, 4.5] },
    // Steps up at each end.
    { part: 'platform', c: [-18.6, -0.075, 0], s: [1.2, 1.05, 4.5] },
    { part: 'platform', c: [18.6, -0.075, 0], s: [1.2, 1.05, 4.5] },
    ...[-15, -9, -3, 3, 9, 15].map((x): PartBox => ({ part: 'post', c: [x, (PLATFORM_TOP + CANOPY) / 2, -0.6], s: [0.3, CANOPY - PLATFORM_TOP, 0.3], material: 'metal' })),
    { part: 'canopy', c: [0, CANOPY + 0.15, -0.3], s: [34, 0.3, 5.4], material: 'metal' },
    { part: 'bench', c: [-6, PLATFORM_TOP + 0.25, -1.4], s: [2.2, 0.5, 0.6], material: 'wood' },
    { part: 'bench', c: [6, PLATFORM_TOP + 0.25, -1.4], s: [2.2, 0.5, 0.6], material: 'wood' },
    // The signal box behind it: a room with windows all round, doors front and back.
    ...wallBoxes('box-wall', -6, 6, -7, 0.4, -0.6, 3.4, [{ from: -1.5, to: 1.5, bottom: -0.6, top: 2.3 }, { from: 2.5, to: 5, bottom: 1.1, top: 2.1 }, { from: -5, to: -2.5, bottom: 1.1, top: 2.1 }]),
    ...wallBoxes('box-wall', -6, 6, -14.6, 0.4, -0.6, 3.4, [{ from: 1, to: 1 + DOOR, bottom: -0.6, top: 2.3 }, { from: -4.5, to: -2, bottom: 1.1, top: 2.1 }]),
    ...wallBoxes('box-wall', -14.4, -7.2, -5.8, 0.4, -0.6, 3.4, [{ from: -12, to: -9.6, bottom: 1.1, top: 2.1 }], 'z'),
    ...wallBoxes('box-wall', -14.4, -7.2, 5.8, 0.4, -0.6, 3.4, [{ from: -12, to: -9.6, bottom: 1.1, top: 2.1 }], 'z'),
    { part: 'box-roof', c: [0, 3.6, -10.8], s: [12.6, 0.4, 8.4] },
    { part: 'crate', c: [4.4, 0.5, -12.6], s: [1.2, 1, 1.2], material: 'wood' },
  ],
};

/** Ground Zero's built pieces, by asset name in the kit. */
export const GZ_PIECES = {
  'gz-reactor': REACTOR,
  'gz-bunker': BUNKER,
  'gz-ruin-l': RUIN_L,
  'gz-ruin-room': RUIN_ROOM,
  'gz-pipe': PIPE,
  'gz-factory': FACTORY,
  'gz-station': STATION,
} as const satisfies Record<string, BuiltPiece>;

/** Where the ring's track runs past the rail hub (zero-island-terrain.ts's ring, at its south): the platform's edge stands this far in from it. */
const GZ_STATION = { x: 8, z: 119.5, track: 126, floor: 9.9 } as const;
const FACTORY_AT = { x: 86, z: -130 } as const;

/** Ground Zero's pads: the crater's floor, one level of slab under the core, and the rim's two. */
export const GZ_PADS: readonly Pad[] = [
  { x: GZ.x, z: GZ.z, halfX: 15, halfZ: 15, level: GZ.floor, blend: 4, surface: 'slab' },
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]): Pad => ({ x: GZ.x + sx! * 28, z: GZ.z + sz! * 28, halfX: 7, halfZ: 7, level: GZ.floor, blend: 5, surface: 'slab' })),
  // Under the pipes' runs, out to the four quarters.
  { x: GZ.x + 30, z: GZ.z, halfX: 18, halfZ: 3.5, level: GZ.floor, blend: 4, surface: 'slab' },
  { x: GZ.x - 30, z: GZ.z, halfX: 18, halfZ: 3.5, level: GZ.floor, blend: 4, surface: 'slab' },
  { x: GZ.x, z: GZ.z + 30, halfX: 3.5, halfZ: 18, level: GZ.floor, blend: 4, surface: 'slab' },
  { x: GZ.x, z: GZ.z - 30, halfX: 3.5, halfZ: 18, level: GZ.floor, blend: 4, surface: 'slab' },
  { x: GZ.x - 15, z: GZ.z + 36, halfX: 9, halfZ: 7, level: GZ.floor, blend: 5 },
  { x: GZ.x + 38, z: GZ.z + 12, halfX: 7, halfZ: 6, level: GZ.floor, blend: 5 },
  { x: GZ.x - 12, z: GZ.z - 40, halfX: 7, halfZ: 6, level: GZ.floor, blend: 5 },
  { x: FACTORY_AT.x + 1.5, z: FACTORY_AT.z, halfX: 22, halfZ: 13, level: null, blend: 8, surface: 'slab' },
  { x: GZ_STATION.x, z: GZ_STATION.z - 6.5, halfX: 21, halfZ: 9, level: GZ_STATION.floor, blend: 5 },
];

/** Which pad each piece stands on: index into `GZ_PADS`. */
const CORE = 0;
const PIPES: Placed[] = [0, 1, 2, 3].flatMap((q) => {
  const yaw = (q * pi) / 2;
  const [ux, uz] = [Math.round(Math.cos(yaw)), -Math.round(Math.sin(yaw))];
  const pad = [5, 8, 6, 7][q]!;
  return [15, 28, 41].map((r): Placed => ({ asset: 'gz-pipe', x: GZ.x + ux * r, z: GZ.z + uz * r, yaw, pad }));
});

export const GZ_PLACED: readonly Placed[] = [
  { asset: 'gz-reactor', x: GZ.x, z: GZ.z, yaw: 0, pad: CORE },
  { asset: 'gz-bunker', x: GZ.x + 28, z: GZ.z + 28, yaw: 0, pad: 1 },
  { asset: 'gz-bunker', x: GZ.x + 28, z: GZ.z - 28, yaw: pi / 2, pad: 2 },
  { asset: 'gz-bunker', x: GZ.x - 28, z: GZ.z + 28, yaw: pi / 2, pad: 3 },
  { asset: 'gz-bunker', x: GZ.x - 28, z: GZ.z - 28, yaw: pi, pad: 4 },
  ...PIPES,
  { asset: 'gz-ruin-l', x: GZ.x - 15, z: GZ.z + 36, yaw: 0, pad: 9 },
  { asset: 'gz-ruin-room', x: GZ.x + 38, z: GZ.z + 12, yaw: pi, pad: 10 },
  { asset: 'gz-ruin-room', x: GZ.x - 12, z: GZ.z - 40, yaw: pi / 2, pad: 11 },
  { asset: 'gz-factory', x: FACTORY_AT.x, z: FACTORY_AT.z, yaw: 0, pad: 12 },
  { asset: 'gz-station', x: GZ_STATION.x, z: GZ_STATION.z, yaw: 0, pad: 13 },
];

/** The blast barriers round the reactor: rows of T-walls, the gaps between them on the pipes and the diagonals. Radius, length, thickness, height. */
export const GZ_BARRIERS = { radius: 21, length: 7, thick: 1, height: 2.6, rows: 8 } as const;


/** How Ground Zero's kit dresses the cover pass's pieces there, by their kind. */
export const GZ_KIT: Readonly<Record<string, KitDress>> = {
  wall: { asset: 'gz-blastwall', fit: 'stretch', near: 45, far: 2000 },
  shed: { asset: 'gz-shed', fit: 'stretch', near: 60, far: 2000 },
  block: { asset: 'gz-slab', fit: 'stretch', near: 60, far: 2000 },
  'pylon-base': { asset: 'gz-footing', fit: 'stretch', near: 40, far: 600 },
  pylon: { asset: 'gz-mast', fit: 'stretch', near: 60, far: 2000 },
  wreck: { asset: 'gz-wreck', fit: 'stand', near: 40, far: 600 },
  wagon: { asset: 'gz-wagon', fit: 'stand', near: 60, far: 1200 },
};
