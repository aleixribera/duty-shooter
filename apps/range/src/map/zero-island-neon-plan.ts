import { wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * Neon City's plan (ticket 20): four city blocks either side of an avenue
 * (north-south) and a cross street (east-west), an elevated highway along the
 * cross street, and the night-lit towers over them. Data only (see
 * `zero-island-region.ts`): the terrain reads the pads, the map stands the
 * pieces, and tools/map/regions/neon.py builds their looks inside these boxes.
 *
 * - Four enterable buildings: two brick walk-ups (a shop below, a flat over
 *   it, stairs up through both to a roof behind a parapet) and two arcade
 *   halls (one big room of machines, a fire stair up the back to the roof).
 * - The highway: a deck 9 m up on a row of piers down the cross street's
 *   middle, broken off at both ends, stalled cars and a bus on it; a stair
 *   tower up to it from each side of the street.
 * - Four towers, outer shells only: storefronts at their foot, lit windows
 *   and neon up their sides.
 * - The street (`NC_EXTRA`): parked cars, jersey barriers and stacks of boxes
 *   by the shops, dressed by the kit like the cover pass's pieces.
 *
 * Doors and stairs are 2.4 m wide or more, so the nav finds a way through.
 */

/** The crossroads, and the city's level (zero-island-terrain.ts's Core). */
export const NC = { x: 410, z: 87, floor: 3 } as const;

/** A flight of steps rising `rise` from `y0` along +x (or -x for `dir` -1) from `x0`, `z0` to `z1` across: each step solid down to y0. */
function flight(x0: number, y0: number, rise: number, count: number, z0: number, z1: number, dir: 1 | -1 = 1, part = 'step'): PartBox[] {
  const tread = 0.45;
  return Array.from({ length: count }, (_, k): PartBox => {
    const top = y0 + (rise * (k + 1)) / count;
    const a = x0 + dir * tread * k;
    const b = x0 + dir * tread * (k + 1);
    return { part, c: [(a + b) / 2, (y0 + top) / 2, (z0 + z1) / 2], s: [tread, top - y0, z1 - z0] };
  });
}

/** A slab of floor or roof from x0..x1, z0..z1, its top at `top`. */
const slab = (part: string, x0: number, x1: number, z0: number, z1: number, top: number, thick = 0.3): PartBox => ({ part, c: [(x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2], s: [x1 - x0, thick, z1 - z0] });

/**
 * A walk-up: 16 by 12 m of brick, two floors and a roof. The shop below opens
 * on the street (+z) by a shopfront and a door, a side door east; a stair up
 * the back wall to the flat, a second on to the roof, a parapet round it.
 */
const W = { hx: 8, hz: 6, wall: 0.3, first: 4, roof: 7.5, top: 8.5 } as const;
const WALKUP: BuiltPiece = {
  near: 200,
  boxes: [
    ...wallBoxes('brick-wall', -W.hx, W.hx, W.hz - W.wall / 2, W.wall, -0.6, W.top, [
      { from: -6, to: 0, bottom: -0.6, top: 3 },
      { from: 3, to: 6, bottom: -0.6, top: 2.8 },
      { from: -6, to: -3.5, bottom: 4.9, top: 6.5 },
      { from: -2, to: 0.5, bottom: 4.9, top: 6.5 },
      { from: 2, to: 4.5, bottom: 4.9, top: 6.5 },
    ]),
    ...wallBoxes('brick-wall', -W.hx, W.hx, -W.hz + W.wall / 2, W.wall, -0.6, W.top, [
      { from: -5, to: -2.5, bottom: 1.2, top: 2.6 },
      { from: 2, to: 4.5, bottom: 4.9, top: 6.5 },
    ]),
    ...wallBoxes('brick-wall', -W.hz + W.wall, W.hz - W.wall, W.hx - W.wall / 2, W.wall, -0.6, W.top, [
      { from: -1, to: 2, bottom: -0.6, top: 2.8 },
      { from: -4.5, to: -2.5, bottom: 4.9, top: 6.5 },
    ], 'z'),
    ...wallBoxes('brick-wall', -W.hz + W.wall, W.hz - W.wall, -W.hx + W.wall / 2, W.wall, -0.6, W.top, [
      { from: 0, to: 3, bottom: 1, top: 2.4 },
      { from: -1, to: 2, bottom: 4.9, top: 6.5 },
    ], 'z'),
    // The flat's floor, open over the first stair; the roof, open over the second.
    slab('floor-slab', -7.7, 7.7, -3.2, 5.7, W.first),
    slab('floor-slab', -2.45, 7.7, -5.7, -3.2, W.first),
    slab('roof-slab', -7.7, 7.7, -3.2, 5.7, W.roof),
    slab('roof-slab', -7.7, 1, -5.7, -3.2, W.roof),
    slab('roof-slab', 5.5, 7.7, -5.7, -3.2, W.roof),
    // The stairs, up the back wall: the shop to the flat (west, stepping off sideways at its head), then the flat to the roof (east).
    ...flight(-2.45, 0, W.first, 11, -5.7, -3.3, -1),
    ...flight(1, W.first, W.roof - W.first, 10, -5.7, -3.3),
    // Rails round the stairwells.
    { part: 'rail', c: [-3.875, W.first + 0.5, -3.12], s: [2.85, 1, 0.1], material: 'metal' },
    { part: 'rail', c: [-2.4, W.first + 0.5, -4.45], s: [0.1, 1, 2.5], material: 'metal' },
    { part: 'rail', c: [2.75, W.roof + 0.5, -3.12], s: [3.5, 1, 0.1], material: 'metal' },
    { part: 'rail', c: [0.95, W.roof + 0.5, -4.45], s: [0.1, 1, 2.5], material: 'metal' },
    // The shop: its counter and shelves; the flat: a sofa and a table.
    { part: 'counter', c: [-3, 0.55, 2.4], s: [4, 1.1, 0.8], material: 'wood' },
    { part: 'shelf', c: [-7.25, 1, 2], s: [0.6, 2, 4], material: 'wood' },
    { part: 'sofa', c: [3, W.first + 0.45, 3.6], s: [2.4, 0.9, 0.9], material: 'wood' },
    { part: 'table', c: [-4, W.first + 0.4, 1.8], s: [1.6, 0.8, 1], material: 'wood' },
    // Neon: the shop's sign over its front, a blade sign at the corner; a billboard and plant on the roof.
    { part: 'sign', c: [-3, 3.9, 6.15], s: [6, 1.4, 0.3], material: 'metal' },
    { part: 'blade', c: [7.2, 6, 6.85], s: [0.3, 3.5, 1.4], material: 'metal' },
    { part: 'billboard', c: [-4, W.roof + 1.6, -5.2], s: [6, 3.2, 0.3], material: 'metal' },
    { part: 'ac', c: [-4, W.roof + 0.7, 2.2], s: [2, 1.4, 1.4], material: 'metal' },
    { part: 'tank', c: [4, W.roof + 1.1, 3], s: [2, 2.2, 2], material: 'metal' },
  ],
};

/**
 * An arcade hall: 20 by 14 m, one big room of machines under a flat roof,
 * three shutters open on the street (+z), a door at the back and the east
 * side, a fire stair up the back wall to the roof, through its parapet.
 */
const M = { hx: 10, hz: 7, wall: 0.3, roof: 5.3, top: 6.2 } as const;
const MARKET: BuiltPiece = {
  near: 200,
  boxes: [
    ...wallBoxes('block-wall', -M.hx, M.hx, M.hz - M.wall / 2, M.wall, -0.6, M.top, [
      { from: -8, to: -4, bottom: -0.6, top: 3.2 },
      { from: -2, to: 2, bottom: -0.6, top: 3.2 },
      { from: 4, to: 8, bottom: -0.6, top: 3.2 },
    ]),
    ...wallBoxes('block-wall', -M.hx, M.hx, -M.hz + M.wall / 2, M.wall, -0.6, M.top, [
      { from: 5, to: 8, bottom: -0.6, top: 2.8 },
      { from: -2.25, to: 0.25, bottom: M.roof, top: M.top },
    ]),
    ...wallBoxes('block-wall', -M.hz + M.wall, M.hz - M.wall, M.hx - M.wall / 2, M.wall, -0.6, M.top, [
      { from: 1, to: 4, bottom: -0.6, top: 2.8 },
      { from: -4, to: -1, bottom: 2, top: 3.4 },
    ], 'z'),
    ...wallBoxes('block-wall', -M.hz + M.wall, M.hz - M.wall, -M.hx + M.wall / 2, M.wall, -0.6, M.top, [{ from: -4, to: -1, bottom: 2, top: 3.4 }], 'z'),
    slab('roof-slab', -M.hx + M.wall, M.hx - M.wall, -M.hz + M.wall, M.hz - M.wall, M.roof),
    // The fire stair up the back, and its landing at the roof.
    ...flight(-9, 0, M.roof, 15, -9.3, -7, 1, 'fire-step'),
    { part: 'landing', c: [-1, M.roof / 2, -8.15], s: [2.5, M.roof, 2.3], material: 'metal' },
    // Two rows of machines and the change counter.
    ...[-6.5, -4, -1.5, 1, 3.5, 6].flatMap((x): PartBox[] => [
      { part: 'cabinet', c: [x, 0.9, -1.6], s: [0.8, 1.8, 0.9], material: 'metal' },
      { part: 'cabinet', c: [x, 0.9, 1.6], s: [0.8, 1.8, 0.9], yaw: Math.PI, material: 'metal' },
    ]),
    { part: 'counter', c: [6.5, 0.55, -5], s: [3.5, 1.1, 0.8], material: 'wood' },
    // Neon over the shutters, a billboard on the roof's west side, the plant.
    { part: 'sign', c: [0, 4.2, 7.15], s: [16, 1.4, 0.3], material: 'metal' },
    { part: 'billboard', c: [-9.25, M.roof + 2.3, 0], s: [0.3, 4.6, 10], material: 'metal' },
    { part: 'ac', c: [3, M.roof + 0.7, 2], s: [2, 1.4, 1.4], material: 'metal' },
    { part: 'ac', c: [6, M.roof + 0.7, -2], s: [2, 1.4, 1.4], material: 'metal' },
  ],
};

/** A tower's shell: storefronts at its foot, its body, and what crowns it; signs up its corners. Not entered. */
function tower(width: number, height: number, setback?: { readonly at: number; readonly width: number }): BuiltPiece {
  const base = 6;
  const top = setback ? setback.at : height;
  const boxes: PartBox[] = [
    { part: 'podium', c: [0, (base - 0.6) / 2, 0], s: [width, base + 0.6, width] },
    { part: 'tower-body', c: [0, (base + top) / 2, 0], s: [width, top - base, width] },
  ];
  if (setback) boxes.push({ part: 'tower-body', c: [0, (top + height) / 2, 0], s: [setback.width, height - top, setback.width] });
  const crown = setback ? setback.width : width;
  boxes.push({ part: 'crown', c: [0, height + 3, 0], s: [crown * 0.45, 6, crown * 0.45], material: 'metal' });
  // A vertical sign on two corners, off the face it lights.
  boxes.push({ part: 'vsign', c: [width / 2 + 0.3, base + 9, width / 2 - 2], s: [0.6, 14, 2.4], material: 'metal' });
  boxes.push({ part: 'vsign', c: [-width / 2 + 2, base + 12, width / 2 + 0.3], s: [2.4, 18, 0.6], material: 'metal' });
  return { near: 400, boxes };
}

/**
 * The highway: a deck 9 m up along x, piers down its middle 16 m apart,
 * parapets along both edges open where the stair towers come up, broken off
 * at both ends; stalled traffic on it.
 */
const DECK = 9;
// Its ends stop short of the spawns at the cross street's ends.
const HALF = 52;
const stairA = flight(-40, 0, DECK, 25, -8.4, -6);
const stairB = flight(40, 0, DECK, 25, 6, 8.4, -1);
const HIGHWAY: BuiltPiece = {
  near: 300,
  boxes: [
    ...Array.from({ length: 7 }, (_, i): PartBox => ({ part: 'deck', c: [-HALF + (HALF / 7) * (2 * i + 1), DECK - 0.6, 0], s: [(2 * HALF) / 7, 1.2, 12] })),
    ...[-48, -32, -16, 0, 16, 32, 48].map((x): PartBox => ({ part: 'pier', c: [x, (DECK - 1.2 - 0.6) / 2, 0], s: [1.6, DECK - 1.2 + 0.6, 2.4] })),
    // Parapets: the north one open at stair A's landing (x -28.75..-26.35), the south at stair B's (26.35..28.75).
    { part: 'parapet', c: [(-HALF - 28.75) / 2, DECK + 0.55, -5.8], s: [HALF - 28.75, 1.1, 0.4] },
    { part: 'parapet', c: [(-26.35 + HALF) / 2, DECK + 0.55, -5.8], s: [HALF + 26.35, 1.1, 0.4] },
    { part: 'parapet', c: [(-HALF + 26.35) / 2, DECK + 0.55, 5.8], s: [HALF + 26.35, 1.1, 0.4] },
    { part: 'parapet', c: [(28.75 + HALF) / 2, DECK + 0.55, 5.8], s: [HALF - 28.75, 1.1, 0.4] },
    // The stair towers and their landings onto the deck.
    ...stairA,
    ...stairB,
    { part: 'landing', c: [-27.55, (DECK - 0.6) / 2, -7.2], s: [2.4, DECK + 0.6, 2.4] },
    { part: 'landing', c: [27.55, (DECK - 0.6) / 2, 7.2], s: [2.4, DECK + 0.6, 2.4] },
    // Jersey barriers across each broken end, and down the middle in places.
    { part: 'jersey', c: [-HALF + 1, DECK + 0.45, -2.5], s: [0.6, 0.9, 6] },
    { part: 'jersey', c: [HALF - 1, DECK + 0.45, 2.5], s: [0.6, 0.9, 6] },
    { part: 'jersey', c: [-6, DECK + 0.45, 0], s: [8, 0.9, 0.6] },
    // Stalled traffic: cars, and a bus slewed across two lanes.
    { part: 'hw-car', c: [-44, DECK + 0.75, -3], s: [4.4, 1.5, 2], yaw: 0.1, material: 'metal' },
    { part: 'hw-car', c: [-18, DECK + 0.75, 3], s: [4.4, 1.5, 2], yaw: -0.15, material: 'metal' },
    { part: 'hw-car', c: [14, DECK + 0.75, -2.8], s: [4.4, 1.5, 2], yaw: 0.05, material: 'metal' },
    { part: 'hw-car', c: [42, DECK + 0.75, 2.6], s: [4.4, 1.5, 2], yaw: 2.9, material: 'metal' },
    { part: 'bus', c: [-30, DECK + 1.5, 1.2], s: [11, 3, 2.6], yaw: 0.35, material: 'metal' },
    // Lamp posts on the parapets.
    ...[-40, -8, 24].map((x): PartBox => ({ part: 'lamp', c: [x, DECK + 3.6, -5.8], s: [0.4, 5, 0.4], material: 'metal' })),
    ...[-24, 8, 40].map((x): PartBox => ({ part: 'lamp', c: [x, DECK + 3.6, 5.8], s: [0.4, 5, 0.4], material: 'metal' })),
  ],
};

/** Neon City's built pieces, by asset name in the kit. */
export const NC_PIECES = {
  'nc-walkup': WALKUP,
  'nc-arcade': MARKET,
  'nc-highway': HIGHWAY,
  'nc-tower-a': tower(20, 64),
  'nc-tower-b': tower(18, 48, { at: 30, width: 12 }),
  'nc-tower-c': tower(20, 72, { at: 52, width: 14 }),
  'nc-tower-d': tower(18, 40),
} as const satisfies Record<string, BuiltPiece>;

const at = (dx: number, dz: number) => ({ x: NC.x + dx, z: NC.z + dz });

/** The city's one pad: the blocks, the streets and the highway's length, levelled. */
export const NC_PADS: readonly Pad[] = [{ ...at(0, 0), halfX: 58, halfZ: 58, level: NC.floor, blend: 8 }];

export const NC_PLACED: readonly Placed[] = [
  // North-west block: a walk-up on the cross street, a tower behind it.
  { asset: 'nc-walkup', ...at(-19, -16), yaw: 0, pad: 0 },
  { asset: 'nc-tower-a', ...at(-36, -36), yaw: 0, pad: 0 },
  // North-east: an arcade on the cross street, a stepped tower behind.
  { asset: 'nc-arcade', ...at(24, -18), yaw: 0, pad: 0 },
  { asset: 'nc-tower-b', ...at(38, -42), yaw: 0, pad: 0 },
  // South-west: an arcade facing north onto the cross street, the tallest tower behind.
  { asset: 'nc-arcade', ...at(-26, 20), yaw: Math.PI, pad: 0 },
  { asset: 'nc-tower-c', ...at(-38, 42), yaw: Math.PI / 2, pad: 0 },
  // South-east: a walk-up facing north, the low tower behind.
  { asset: 'nc-walkup', ...at(20, 16), yaw: Math.PI, pad: 0 },
  { asset: 'nc-tower-d', ...at(38, 36), yaw: Math.PI, pad: 0 },
  // The highway down the cross street.
  { asset: 'nc-highway', ...at(0, 0), yaw: 0, pad: 0 },
];

/**
 * The streets, kept clear of the cover pass's pieces: discs down the avenue
 * and the cross street (x, z, radius). The kit's own street pieces
 * (`NC_EXTRA`) stand at the kerbs.
 */
export const NC_CLEAR: readonly (readonly [x: number, z: number, radius: number])[] = [
  ...Array.from({ length: 15 }, (_, i) => [NC.x, NC.z - 56 + 8 * i, 8] as const),
  ...Array.from({ length: 15 }, (_, i) => [NC.x - 56 + 8 * i, NC.z, 7] as const),
];

/** The street's pieces: offset from the crossroads, footprint, height, turn. */
type Extra = readonly [kind: 'wreck' | 'crate' | 'wall', dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
const EXTRA: readonly Extra[] = [
  // Cars parked along the avenue's kerbs, and two stopped in the crossing.
  ['wreck', -6, -40, 4.4, 2, 1.6, Math.PI / 2],
  ['wreck', -6, -26, 4.4, 2, 1.6, Math.PI / 2 + 0.05],
  ['wreck', 6, -34, 4.4, 2, 1.6, -Math.PI / 2],
  ['wreck', 6, 26, 4.4, 2, 1.6, -Math.PI / 2 - 0.08],
  ['wreck', -6, 38, 4.4, 2, 1.6, Math.PI / 2],
  ['wreck', 3, -4, 4.4, 2, 1.6, 0.6],
  ['wreck', -12, 4.5, 4.4, 2, 1.6, -0.2],
  ['wreck', 40, -4.2, 4.4, 2, 1.6, 0.1],
  ['wreck', -46, 4, 4.4, 2, 1.6, 0.05],
  // Jersey barriers closing lanes.
  ['wall', 0, -18, 6, 0.7, 1.1, 0],
  ['wall', 0, 16, 6, 0.7, 1.1, 0.1],
  ['wall', 22, 3, 6, 0.7, 1.1, Math.PI / 2],
  ['wall', -22, -3, 6, 0.7, 1.1, Math.PI / 2],
  // Stacks of boxes outside the shops and in the alleys.
  ['crate', -9.5, -8.6, 2.2, 2.2, 1.3, 0.2],
  ['crate', 12, -9.5, 2.2, 2.2, 2.2, 0.5],
  ['crate', -12, 10, 2.2, 2.2, 2.2, 0.1],
  ['crate', 10, 9, 2.2, 2.2, 1.3, 0.8],
  ['crate', -30, -24, 2.2, 2.2, 2.2, 0.3],
  ['crate', 27, 26, 2.2, 2.2, 1.3, 0.4],
  ['crate', -44, 24, 2.2, 2.2, 2.2, 0],
  ['crate', 44, -26, 2.2, 2.2, 1.3, 0.6],
];

export const NC_EXTRA = EXTRA.map(([kind, dx, dz, width, depth, height, yaw]) => ({ kind, ...at(dx, dz), width, depth, height, yaw }));

/**
 * How Neon City's kit dresses the cover pass's pieces there (and its own
 * extras): the blocks as shuttered shop buildings, walls as jersey barriers
 * under graffiti, wrecks as cars, crates as stacked boxes.
 */
export const NC_KIT: Readonly<Record<string, KitDress>> = {
  block: { asset: 'nc-shop', fit: 'stretch', near: 120, far: 2000 },
  wall: { asset: 'nc-barrier', fit: 'stretch', near: 45, far: 800 },
  wreck: { asset: 'nc-car', fit: 'stand', near: 50, far: 700 },
  'wreck-b': { asset: 'nc-car-b', fit: 'stand', near: 50, far: 700 },
  crate: { asset: 'nc-boxes', fit: 'stretch', near: 40, far: 500 },
};
