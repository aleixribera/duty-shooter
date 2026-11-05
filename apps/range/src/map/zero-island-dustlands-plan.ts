import { wallBoxes, type BuiltPiece, type KitDress, type Pad, type PartBox, type Placed } from './zero-island-region';

/**
 * The Dustlands' plan (ticket 18): a mining camp round a crashed cargo jet on
 * the canyon floor, between the mesas. Data only (see `zero-island-region.ts`):
 * the terrain reads the pads, the map stands the pieces, and
 * tools/map/regions/dustlands.py builds their looks inside these boxes.
 *
 * - The jet: its fuselage broken in two across the middle of the camp, one
 *   wing still on, resting on its engines (crouch under it), the other torn
 *   off and lying apart, the tail fin up, panels strewn round it.
 * - Four plank shacks with a wide door in each long side, so none is a dead
 *   end, crates and a bench inside.
 * - The mine office: adobe, two rooms, a porch out front, its water tank on
 *   the roof.
 * - The ore hopper on its timber legs over a heap of ore, with a loading deck
 *   to climb onto.
 * - Round them, dry-stone walls, burnt-out pickups, crate stacks and drums
 *   (`DL_EXTRA`), dressed by the kit like the cover pass's pieces.
 *
 * Doors are 3 m wide: the nav's 2 m grid, less a body's width each side,
 * always finds a way through one.
 */

/** The camp's middle and the canyon floor's level (zero-island-terrain.ts's Core). */
export const DL = { x: -215, z: 239, floor: 7 } as const;

const DOOR = 3;

/** A crate in a piece, `h` tall and `w` a side. */
const crate = (x: number, z: number, w: number, h: number, yaw = 0): PartBox => ({ part: 'crate', c: [x, h / 2, z], s: [w, h, w], yaw, material: 'wood' });

/**
 * The jet, along +x nose first: the aft fuselage and tail, a gap where it
 * broke, the fore fuselage kinked off the line and the nose. Its starboard
 * wing (+z) is still on, sitting on its two engines; its port wing lies apart.
 */
const FUSE_R = 2.2;
/** The aft fuselage's axis over the ground; the fore half lies 0.15 m lower, dug in. */
const FUSE_Y = 1.75;
const JET: BuiltPiece = {
  near: 160,
  boxes: [
    { part: 'fuselage', c: [-8, (FUSE_Y + FUSE_R - 0.6) / 2, 0], s: [14, FUSE_Y + FUSE_R + 0.6, 2 * FUSE_R], material: 'metal' },
    // The tail cone, narrowing up to the fin.
    { part: 'tail-cone', c: [-18, (FUSE_Y + FUSE_R - 0.6) / 2, 0], s: [6, FUSE_Y + FUSE_R + 0.6, 2 * FUSE_R], material: 'metal' },
    { part: 'fin', c: [-19, FUSE_Y + FUSE_R + 2.6, 0], s: [5.5, 5.2, 0.5], material: 'metal' },
    { part: 'tailplane', c: [-19.5, FUSE_Y + 1.2, 0], s: [3.4, 0.35, 11], material: 'metal' },
    // The fore half, broken off and turned a little.
    { part: 'fuselage', c: [6.6, (FUSE_Y - 0.15 + FUSE_R - 0.6) / 2, 0.9], s: [11, FUSE_Y - 0.15 + FUSE_R + 0.6, 2 * FUSE_R], yaw: 0.16, material: 'metal' },
    { part: 'nose', c: [14.5, (FUSE_Y - 0.15 + FUSE_R - 0.6) / 2, -0.37], s: [5.4, FUSE_Y - 0.15 + FUSE_R + 0.6, 2 * FUSE_R], yaw: 0.16, material: 'metal' },
    // The starboard wing, swept, on its engines: crouched, a body fits under it.
    { part: 'wing', c: [-6.5, 1.65, 6.7], s: [6, 0.4, 9.4], material: 'metal' },
    { part: 'wing', c: [-8.8, 1.65, 14.2], s: [4, 0.4, 5.6], material: 'metal' },
    { part: 'engine', c: [-4.6, 0.425, 6.4], s: [4.2, 2.05, 1.9], material: 'metal' },
    { part: 'engine', c: [-7.6, 0.425, 12.2], s: [4.2, 2.05, 1.9], material: 'metal' },
    // The port wing, torn off and lying apart, its root on the ground and its tip on a rock.
    { part: 'wing-off', c: [-1, 0.1, -12.5], s: [5.6, 1.4, 11], yaw: -0.35, material: 'metal' },
    // Panels and a cargo pallet thrown out of the break.
    { part: 'panel', c: [1.6, 0.05, 4.6], s: [3.2, 1.3, 2.4], yaw: 0.6, material: 'metal' },
    { part: 'panel', c: [-1.4, 0.0, -4.2], s: [2.6, 1.2, 2.2], yaw: -0.3, material: 'metal' },
    crate(1.2, 7.6, 1.5, 1.4, 0.3),
    crate(2.5, 8.7, 1.2, 1.0, 0.8),
  ],
};

/** A plank shack: 7 by 5.5 m, a wide door in each long side, windows, a tin roof; crates and a bench inside. */
const SHACK_HIGH = 2.9;
const SHACK: BuiltPiece = {
  near: 90,
  boxes: [
    ...wallBoxes('plank-wall', -3.5, 3.5, 2.65, 0.2, -0.6, SHACK_HIGH, [
      { from: -2.9, to: -2.9 + DOOR, bottom: -0.6, top: 2.3 },
      { from: 1.2, to: 2.7, bottom: 1.0, top: 1.9 },
    ]),
    ...wallBoxes('plank-wall', -3.5, 3.5, -2.65, 0.2, -0.6, SHACK_HIGH, [
      { from: -0.1, to: -0.1 + DOOR, bottom: -0.6, top: 2.3 },
      { from: -2.8, to: -1.4, bottom: 1.0, top: 1.9 },
    ]),
    ...wallBoxes('plank-wall', -2.55, 2.55, 3.4, 0.2, -0.6, SHACK_HIGH, [{ from: -0.7, to: 0.7, bottom: 1.0, top: 1.9 }], 'z'),
    ...wallBoxes('plank-wall', -2.55, 2.55, -3.4, 0.2, -0.6, SHACK_HIGH, [], 'z'),
    { part: 'tin-roof', c: [0, SHACK_HIGH + 0.1, 0], s: [7.6, 0.2, 6.1], material: 'metal' },
    crate(2.4, -1.6, 1.2, 1.1),
    crate(2.5, -0.3, 0.9, 0.8, 0.4),
    { part: 'bench', c: [-2.4, 0.4, 1.8], s: [1.8, 0.8, 0.7], material: 'wood' },
  ],
};

/** The mine office: 14 by 9 m of adobe, two rooms with a door between, a porch on posts, its water tank on the roof. */
const OFFICE_HIGH = 3.4;
const OFFICE: BuiltPiece = {
  near: 120,
  boxes: [
    ...wallBoxes('adobe-wall', -7, 7, 4.3, 0.4, -0.6, OFFICE_HIGH, [
      { from: -5.5, to: -5.5 + DOOR, bottom: -0.6, top: 2.4 },
      { from: 3, to: 3 + DOOR, bottom: -0.6, top: 2.4 },
      { from: -1.2, to: 1.2, bottom: 1.0, top: 2.1 },
    ]),
    ...wallBoxes('adobe-wall', -7, 7, -4.3, 0.4, -0.6, OFFICE_HIGH, [
      { from: -1, to: -1 + DOOR, bottom: -0.6, top: 2.4 },
      { from: -5.6, to: -3.6, bottom: 1.0, top: 2.1 },
      { from: 3.4, to: 5.4, bottom: 1.0, top: 2.1 },
    ]),
    ...wallBoxes('adobe-wall', -4.1, 4.1, -6.8, 0.4, -0.6, OFFICE_HIGH, [{ from: -1, to: 1, bottom: 1.0, top: 2.1 }], 'z'),
    ...wallBoxes('adobe-wall', -4.1, 4.1, 6.8, 0.4, -0.6, OFFICE_HIGH, [{ from: -1, to: 1, bottom: 1.0, top: 2.1 }], 'z'),
    // The wall between the rooms, a door through it.
    ...wallBoxes('adobe-wall', -4.1, 4.1, 0.6, 0.3, -0.6, OFFICE_HIGH, [{ from: -1.8, to: -1.8 + DOOR, bottom: -0.6, top: 2.4 }], 'z'),
    { part: 'tin-roof', c: [0, OFFICE_HIGH + 0.1, 0], s: [14.6, 0.2, 9.4], material: 'metal' },
    // The porch: posts and its own lower roof.
    ...[-6.6, -2.2, 2.2, 6.6].map((x): PartBox => ({ part: 'post', c: [x, 1.2, 6.9], s: [0.25, 3.6, 0.25], material: 'wood' })),
    { part: 'awning', c: [0, 3.06, 5.8], s: [14.2, 0.12, 2.6], material: 'metal' },
    { part: 'tank', c: [3.6, OFFICE_HIGH + 1.6, -1.8], s: [2.6, 2.8, 2.6], material: 'metal' },
    // Inside: desks and crates.
    { part: 'desk', c: [-4.6, 0.4, -2.6], s: [2.2, 0.8, 1], material: 'wood' },
    { part: 'desk', c: [4.2, 0.4, 2.4], s: [2.2, 0.8, 1], material: 'wood' },
    crate(-5.8, 2.8, 1.3, 1.2),
    crate(5.6, -3, 1.3, 1.2, 0.3),
    crate(4.3, -3.2, 1, 0.9),
  ],
};

/** The ore hopper: a bin on four timber legs (up into its sloped bottom, to where its sides run straight) over its heap of ore, and a loading deck beside it to climb onto. */
const HOPPER: BuiltPiece = {
  near: 140,
  boxes: [
    ...[[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].map(([x, z]): PartBox => ({ part: 'leg', c: [x!, 4.9, z!], s: [0.45, 11, 0.45], material: 'wood' })),
    { part: 'beam', c: [0, 3.2, -2.6], s: [5.7, 0.3, 0.3], material: 'wood' },
    { part: 'beam', c: [0, 3.2, 2.6], s: [5.7, 0.3, 0.3], material: 'wood' },
    { part: 'bin', c: [0, 9.7, 0], s: [6.4, 4.6, 6.4], material: 'wood' },
    { part: 'ore', c: [0, 0.2, 0], s: [4.6, 1.6, 4.6], material: 'gravel' },
    // The loading deck, chest high, its stairs up at the far end.
    { part: 'deck', c: [0, 0.35, 6.4], s: [8, 1.9, 3.2], material: 'wood' },
    { part: 'deck', c: [5.2, -0.05, 6.4], s: [2.4, 1.1, 3.2], material: 'wood' },
    crate(-2.6, 7.1, 1.2, 1.1),
  ],
};

/** The Dustlands' built pieces, by asset name in the kit. */
export const DL_PIECES = {
  'dl-jet': JET,
  'dl-shack': SHACK,
  'dl-office': OFFICE,
  'dl-hopper': HOPPER,
} as const satisfies Record<string, BuiltPiece>;

const at = (dx: number, dz: number) => ({ x: DL.x + dx, z: DL.z + dz });
const pad = (dx: number, dz: number, halfX: number, halfZ: number): Pad => ({ ...at(dx, dz), halfX, halfZ, level: DL.floor, blend: 4 });

/** The Dustlands' pads: the Core is already level, so these only hold each piece's floor. */
export const DL_PADS: readonly Pad[] = [
  pad(0, 2, 24, 18),
  pad(-30, -22, 5, 4.5),
  pad(28, -26, 5, 4.5),
  pad(-34, 20, 4.5, 5),
  pad(24, 30, 5, 4.5),
  pad(2, -34, 8.5, 7.5),
  pad(33, 4, 5, 8),
];

export const DL_PLACED: readonly Placed[] = [
  { asset: 'dl-jet', ...at(0, 2), yaw: 0.42, pad: 0 },
  { asset: 'dl-shack', ...at(-30, -22), yaw: 0.12, pad: 1 },
  { asset: 'dl-shack', ...at(28, -26), yaw: -0.2, pad: 2 },
  { asset: 'dl-shack', ...at(-34, 20), yaw: 1.62, pad: 3 },
  { asset: 'dl-shack', ...at(24, 30), yaw: 2.9, pad: 4 },
  { asset: 'dl-office', ...at(2, -34), yaw: 0, pad: 5 },
  { asset: 'dl-hopper', ...at(33, 4), yaw: 0.05, pad: 6 },
];

/** What the kit's extra pieces in the camp are: dry-stone walls, burnt-out pickups, ore wagons, crate stacks and drums. Offset from the camp's middle, footprint, height, turn. */
type Extra = readonly [kind: 'wall' | 'wreck' | 'wagon' | 'crate' | 'drums', dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
const EXTRA: readonly Extra[] = [
  // Walls of piled stone, chest high, in short broken runs.
  ['wall', -14, -14, 8, 1, 1.3, 0.2],
  ['wall', -44, -4, 7, 1, 1.3, 1.5],
  ['wall', 16, -12, 6.5, 1, 1.2, -0.4],
  ['wall', 44, -14, 7, 1, 1.4, 1.3],
  ['wall', -18, 34, 8, 1, 1.3, 0.1],
  ['wall', 10, 44, 7, 1, 1.2, -0.2],
  ['wall', 40, 22, 6, 1, 1.3, 1.1],
  ['wall', -46, 34, 6, 1, 1.2, 0.8],
  ['wall', -20, -42, 7, 1, 1.3, 0.3],
  // Burnt-out pickups.
  ['wreck', -18, -2, 4.4, 2, 1.6, 2.2],
  ['wreck', 18, 18, 4.4, 2, 1.6, 0.7],
  ['wreck', -8, 26, 4.4, 2, 1.6, -0.5],
  ['wreck', 14, -20, 4.4, 2, 1.6, 1.2],
  // Ore wagons: a short rake parked under the hopper's chute, and one run off on its own.
  ['wagon', 26, -8, 3.2, 2, 2.2, 0],
  ['wagon', 29.6, -8, 3.2, 2, 2.2, 0],
  ['wagon', 33.2, -8, 3.2, 2, 2.2, 0],
  ['wagon', -40, 10, 3.2, 2, 2.2, 0.9],
  // Crate stacks.
  ['crate', -24, 6, 2.2, 2.2, 2.2, 0.3],
  ['crate', 6, 24, 2.2, 2.2, 1.3, 0.8],
  ['crate', 20, -40, 2.2, 2.2, 2.2, 0],
  ['crate', -40, -26, 2.2, 2.2, 1.3, 0.6],
  ['crate', 42, -2, 2, 2, 1.3, 0.2],
  // Drums: a cluster of oil drums.
  ['drums', -10, -26, 2.4, 2.4, 1.0, 0.4],
  ['drums', 26, 12, 2.4, 2.4, 1.0, 1.1],
  ['drums', -30, 36, 2.4, 2.4, 1.0, 0],
  ['drums', 36, -38, 2.4, 2.4, 1.0, 0.7],
];

export const DL_EXTRA = EXTRA.map(([kind, dx, dz, width, depth, height, yaw]) => ({ kind, ...at(dx, dz), width, depth, height, yaw }));

/** How the Dustlands' kit dresses the cover pass's pieces there (and its own extras), by their kind. */
export const DL_KIT: Readonly<Record<string, KitDress>> = {
  shed: { asset: 'dl-hut', fit: 'stretch', near: 60, far: 2000 },
  wreck: { asset: 'dl-pickup', fit: 'stand', near: 45, far: 600 },
  wagon: { asset: 'dl-orecar', fit: 'stand', near: 60, far: 1200 },
  wall: { asset: 'dl-stonewall', fit: 'stretch', near: 45, far: 600 },
  crate: { asset: 'dl-crates', fit: 'stretch', near: 40, far: 500 },
  drums: { asset: 'dl-drums', fit: 'stretch', near: 40, far: 400 },
};
