import { octagon, wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * Mutant Jungle's plan (ticket 22): a clearing in the forest round a giant
 * glowing tree, the ruins of a stone temple, crystals grown up through the
 * floor, and a research camp on stilts by the stream's spring. Data only (see
 * `zero-island-region.ts`): the terrain reads the pads, the map stands the
 * pieces, and tools/map/regions/jungle.py builds their looks inside these boxes.
 *
 * - The giant tree: a trunk eight metres across on a flared foot, six roots
 *   reaching out along the ground to get behind, four boughs, and a canopy
 *   hung with glowing pods. The canopy is out of reach: nothing climbs it.
 * - The temple: a stepped plinth, steps up its east side, the shrine's broken
 *   walls on it (a door, a window, a breach), half its roof slab still on,
 *   an altar with a crystal growing out of it, columns at the corners.
 * - Two gateways: an arch between piers, broken walls running off both ways.
 * - A colonnade: a stylobate, columns standing and broken, an architrave on
 *   two of them, a fallen column beside it.
 * - Crystal outcrops: violet and cyan crystals, head high and more, on a rock.
 * - The camp: a hut on a deck on stilts, a stair up, a rail round the deck.
 * - Round them, ruined walls, crystal clusters, crates and overgrown jeeps
 *   (`MJ_EXTRA`), dressed by the kit like the cover pass's pieces.
 *
 * The stream rises at the clearing's edge and runs south, wadeable: nothing
 * stands in it. Doors are 3 m wide and stairs 2.4 m: the nav's grid always finds a way through.
 */

/** The clearing's middle and its level (zero-island-terrain.ts's Core). */
export const MJ = { x: 170, z: -401, floor: 11 } as const;

const DOOR = 3;
const TREAD = 0.45;

/** A flight of `count` solid steps rising `rise` from the floor (or from `from`) along -x from `x0`, `z0` to `z1` across. */
function flight(x0: number, rise: number, count: number, z0: number, z1: number, part: string, from = 0, material?: 'wood'): PartBox[] {
  return Array.from({ length: count }, (_, k): PartBox => {
    const top = from + (rise * (k + 1)) / count;
    const [a, b] = [x0 - TREAD * k, x0 - TREAD * (k + 1)];
    return { part, c: [(a + b) / 2, top / 2, (z0 + z1) / 2], s: [TREAD, top, z1 - z0], ...(material ? { material } : {}) };
  });
}

/** A box turned `yaw` about the piece's middle, its own middle `d` out from it. */
function spoke(part: string, d: number, yaw: number, y0: number, s: readonly [number, number, number], material?: 'wood'): PartBox {
  return { part, c: [d * Math.cos(yaw), y0 + s[1] / 2, -d * Math.sin(yaw)], s, yaw, ...(material ? { material } : {}) };
}

/**
 * The giant tree: its trunk to 22 m inside the canopy, which spreads 28 m
 * from 17 m up, the boughs reaching into it. Six roots, waist to head high,
 * are the cover round it.
 */
const TRUNK = 3.4;
const TREE: BuiltPiece = {
  near: 420,
  boxes: [
    ...octagon('trunk', TRUNK, 0, 22, 'wood'),
    ...octagon('flare', 5.2, 0, 3, 'wood'),
    ...[0, 1, 2, 3, 4, 5].map((k) => spoke('root', 7.4, 0.3 + (k * Math.PI) / 3, 0, [6.2, k % 2 ? 1.6 : 2.4, 1.4], 'wood')),
    ...[0, 1, 2, 3].map((k) => spoke('bough', TRUNK + 5, 0.8 + (k * Math.PI) / 2, 15 + k * 0.6, [10.5, 2.2, 2.2], 'wood')),
    { part: 'canopy', c: [0, 21.5, 0], s: [28, 9, 28], material: 'wood' },
    { part: 'canopy', c: [0, 29, 0], s: [17, 6, 17], material: 'wood' },
  ],
};

/**
 * The temple: a plinth 16 m square and 1.2 m high, three steps up its +x
 * side, the shrine's walls 10 m square on it, broken to different heights.
 */
const PLINTH = 1.2;
const TEMPLE: BuiltPiece = {
  near: 180,
  boxes: [
    { part: 'plinth', c: [0, PLINTH / 2, 0], s: [16, PLINTH, 16] },
    ...flight(8 + 3 * TREAD, PLINTH, 3, -2, 2, 'step'),
    // The door in the +x wall, a window in the -x one, a breach through +z to its broken top.
    ...wallBoxes('ruin-wall', -5, 5, 4.55, 0.9, PLINTH, 5, [{ from: -DOOR / 2, to: DOOR / 2, bottom: PLINTH, top: 3.9 }], 'z'),
    ...wallBoxes('ruin-wall', -5, 5, -4.55, 0.9, PLINTH, 4.2, [{ from: 0.5, to: 2.5, bottom: 2.3, top: 3.5 }], 'z'),
    ...wallBoxes('ruin-wall', -4.1, 4.1, 4.55, 0.9, PLINTH, 3.4, [{ from: -1, to: 1.6, bottom: PLINTH, top: 3.4 }]),
    ...wallBoxes('ruin-wall', -4.1, 4.1, -4.55, 0.9, PLINTH, 4.2, [{ from: -2.6, to: -0.6, bottom: 2.3, top: 3.5 }]),
    // Half the roof still on, over the -x side, resting on its walls.
    { part: 'roof-slab', c: [-2.4, 4.4, -1.6], s: [5.2, 0.4, 6.8] },
    { part: 'altar', c: [-1.6, PLINTH + 0.5, 2.6], s: [1.8, 1, 1.8] },
    { part: 'crystal', c: [-1.6, PLINTH + 1 + 1.4, 2.6], s: [1.2, 2.8, 1.2] },
    // Columns at the plinth's corners, two broken.
    ...([[6.8, 6.8, 5.6], [6.8, -6.8, 3.2], [-6.8, 6.8, 5.6], [-6.8, -6.8, 2]] as const).map(([x, z, h]): PartBox => ({ part: 'column', c: [x, PLINTH + h / 2, z], s: [1.1, h, 1.1] })),
    { part: 'column-fallen', c: [-6.6, PLINTH + 0.55, 0], s: [1.1, 1.1, 6] },
    { part: 'rubble', c: [6.4, PLINTH + 0.35, -4.4], s: [2.4, 0.7, 2.4] },
    { part: 'rubble', c: [-9.6, 0.5, -5], s: [3, 1, 2.6] },
  ],
};

/** A gateway: an arch 3.8 m wide between two piers, broken walls off both ways. */
const ARCH: BuiltPiece = {
  near: 160,
  boxes: [
    { part: 'pier', c: [0, 3, 2.6], s: [1.6, 6, 1.4] },
    { part: 'pier', c: [0, 3, -2.6], s: [1.6, 6, 1.4] },
    { part: 'lintel', c: [0, 6.6, 0], s: [1.8, 1.2, 7] },
    { part: 'ruin-wall', c: [0, 1.6, 6.15], s: [1, 3.2, 5.7] },
    { part: 'ruin-wall', c: [0, 1.1, -5.15], s: [1, 2.2, 3.7] },
    { part: 'rubble', c: [1.6, 0.4, -7.6], s: [2.2, 0.8, 2.2] },
  ],
};

/** A colonnade: five columns on a stylobate, an architrave across the first and third. */
const STYLOBATE = 0.6;
const COLONNADE: BuiltPiece = {
  near: 160,
  boxes: [
    { part: 'stylobate', c: [0, STYLOBATE / 2, 0], s: [16, STYLOBATE, 3] },
    ...([[-6, 5], [-3, 2.4], [0, 5], [3, 3.6], [6, 1.4]] as const).map(([x, h]): PartBox => ({ part: 'column', c: [x, STYLOBATE + h / 2, 0], s: [1, h, 1] })),
    { part: 'architrave', c: [-3, STYLOBATE + 5 + 0.4, 0], s: [7.4, 0.8, 1.2] },
    { part: 'column-fallen', c: [2.5, 0.5, 2.4], s: [6, 1, 1] },
  ],
};

/** A crystal outcrop: crystals on a rock, the tallest over seven metres. */
const ROCK = 1.2;
const CRYSTALS: BuiltPiece = {
  near: 200,
  boxes: [
    { part: 'rock', c: [0, ROCK / 2, 0], s: [7, ROCK, 6] },
    ...([
      [0, 0, 2.2, 7],
      [2.4, 1, 1.6, 4.4],
      [-2.2, 1.4, 1.5, 3.6],
      [1.2, -2, 1.3, 2.8],
      [-1.8, -1.6, 1.4, 5.2],
    ] as const).map(([x, z, w, h]): PartBox => ({ part: 'crystal', c: [x, ROCK + h / 2, z], s: [w, h, w] })),
  ],
};

/** The camp: a 9 by 7 m deck on stilts 2.9 m up, a hut on its -x end, a stair up its +x end, a rail round the rest. */
const DECK = 2.9;
const HUT_TOP = DECK + 2.5;
const CAMP: BuiltPiece = {
  near: 160,
  boxes: [
    { part: 'deck', c: [0, DECK - 0.15, 0], s: [9, 0.3, 7], material: 'wood' },
    ...[-4.2, 0, 4.2].flatMap((x) => [-3.2, 3.2].map((z): PartBox => ({ part: 'post', c: [x, (DECK - 0.3) / 2, z], s: [0.3, DECK - 0.3, 0.3], material: 'wood' }))),
    ...flight(4.5 + 8 * TREAD, DECK, 8, -1.2, 1.2, 'stair', 0, 'wood'),
    // The hut: 6 by 5 m, its door facing the stair, a window each side.
    ...wallBoxes('hut-wall', -2.5, 2.5, 1.725, 0.15, DECK, HUT_TOP, [{ from: -DOOR / 2, to: DOOR / 2, bottom: DECK, top: DECK + 2.2 }], 'z').map((b) => ({ ...b, material: 'wood' as const })),
    ...wallBoxes('hut-wall', -2.5, 2.5, -4.425, 0.15, DECK, HUT_TOP, [], 'z').map((b) => ({ ...b, material: 'wood' as const })),
    ...wallBoxes('hut-wall', -4.35, 1.65, 2.425, 0.15, DECK, HUT_TOP, [{ from: -2.2, to: -1, bottom: DECK + 1, top: DECK + 2 }]).map((b) => ({ ...b, material: 'wood' as const })),
    ...wallBoxes('hut-wall', -4.35, 1.65, -2.425, 0.15, DECK, HUT_TOP, [{ from: -2.2, to: -1, bottom: DECK + 1, top: DECK + 2 }]).map((b) => ({ ...b, material: 'wood' as const })),
    { part: 'hut-roof', c: [-1.35, HUT_TOP + 0.15, 0], s: [6.6, 0.3, 5.6], material: 'wood' },
    // The rail round the open deck, open at the stair.
    { part: 'rail', c: [3.1, DECK + 0.5, 3.45], s: [2.8, 1, 0.1], material: 'wood' },
    { part: 'rail', c: [3.1, DECK + 0.5, -3.45], s: [2.8, 1, 0.1], material: 'wood' },
    { part: 'rail', c: [4.45, DECK + 0.5, 2.35], s: [0.1, 1, 2.1], material: 'wood' },
    { part: 'rail', c: [4.45, DECK + 0.5, -2.35], s: [0.1, 1, 2.1], material: 'wood' },
    { part: 'crate', c: [3, DECK + 0.45, -2.4], s: [0.9, 0.9, 0.9], material: 'wood' },
    { part: 'antenna', c: [-3.8, HUT_TOP + 0.3 + 1.5, -1.9], s: [0.2, 3, 0.2], material: 'metal' },
    // A water tank under the deck, to get behind.
    { part: 'tank', c: [-2.2, 0.8, 0], s: [1.6, 1.6, 1.6], material: 'metal' },
  ],
};

/** Mutant Jungle's built pieces, by asset name in the kit. */
export const MJ_PIECES = {
  'mj-tree': TREE,
  'mj-temple': TEMPLE,
  'mj-arch': ARCH,
  'mj-colonnade': COLONNADE,
  'mj-crystals': CRYSTALS,
  'mj-camp': CAMP,
} as const satisfies Record<string, BuiltPiece>;

const at = (dx: number, dz: number) => ({ x: MJ.x + dx, z: MJ.z + dz });

/** The clearing's one pad: the Core is already level, so it only holds every floor to it. */
export const MJ_PADS: readonly Pad[] = [{ ...at(0, 0), halfX: 44, halfZ: 44, level: MJ.floor, blend: 6 }];

export const MJ_PLACED: readonly Placed[] = [
  { asset: 'mj-tree', ...at(0, 0), yaw: 0, pad: 0 },
  { asset: 'mj-temple', ...at(-27, -4), yaw: 0.25, pad: 0 },
  { asset: 'mj-arch', ...at(18, -24), yaw: 0.6, pad: 0 },
  { asset: 'mj-arch', ...at(-14, -32), yaw: -0.3, pad: 0 },
  { asset: 'mj-colonnade', ...at(-14, 26), yaw: -0.5, pad: 0 },
  { asset: 'mj-crystals', ...at(24, 6), yaw: 0.3, pad: 0 },
  { asset: 'mj-crystals', ...at(-34, 26), yaw: 1, pad: 0 },
  { asset: 'mj-crystals', ...at(4, -38), yaw: 2, pad: 0 },
  { asset: 'mj-camp', ...at(20, 32), yaw: 0, pad: 0 },
];

/** The clearing's extra pieces: ruined walls, crystal clusters, crates and jeeps. Offset from its middle, footprint, height, turn. */
type Extra = readonly [kind: 'wall' | 'block' | 'crate' | 'wreck', dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
const EXTRA: readonly Extra[] = [
  // Ruined walls, head high or less.
  ['wall', -40, -24, 7, 1.2, 2.8, 0.4],
  ['wall', 36, -10, 6, 1.2, 2.4, 1.4],
  ['wall', 8, 22, 6, 1.1, 2.2, 0.2],
  ['wall', -4, -22, 5, 1.2, 2.6, 1],
  ['wall', 30, 20, 5, 1, 2, 2],
  ['wall', -20, 40, 6, 1.2, 2.4, 0.8],
  // Crystal clusters.
  ['block', 12, 12, 2.4, 2.4, 3.2, 0.5],
  ['block', -10, 12, 2.2, 2.2, 2.6, 1.1],
  ['block', 30, -30, 2.6, 2.6, 3.4, 0.2],
  ['block', -42, 12, 2.4, 2.4, 3, 0.9],
  ['block', 16, -42, 2.2, 2.2, 2.8, 1.6],
  ['block', -24, -40, 2.4, 2.4, 3.2, 0.3],
  // The camp's stores.
  ['crate', 26, 18, 1.6, 1.6, 1.2, 0.3],
  ['crate', 14, 28, 1.6, 1.6, 1.6, 0.8],
  ['crate', -34, -18, 1.6, 1.6, 1.2, 0.2],
  ['crate', 34, -2, 1.6, 1.6, 1.6, 1],
  // Jeeps the jungle has grown over.
  ['wreck', 38, 8, 4.2, 2, 2, 1.8],
  ['wreck', -6, 42, 4.2, 2, 2, 0.3],
  ['wreck', -40, -36, 4.2, 2, 2, 2.4],
  ['wreck', -30, -30, 4.2, 2, 2, 0.9],
];

export const MJ_EXTRA = EXTRA.map(([kind, dx, dz, width, depth, height, yaw]) => ({ kind, ...at(dx, dz), width, depth, height, yaw }));

/** How Mutant Jungle's kit dresses the cover pass's pieces there (and its own extras), by their kind. */
export const MJ_KIT: Readonly<Record<string, KitDress>> = {
  wall: { asset: 'mj-ruinwall', fit: 'stretch', near: 60, far: 900 },
  block: { asset: 'mj-crystal', fit: 'stretch', near: 80, far: 1200 },
  crate: { asset: 'mj-crates', fit: 'stretch', near: 40, far: 500 },
  wreck: { asset: 'mj-jeep', fit: 'stand', near: 50, far: 700 },
};
