import { INTERMISSION, type ChargeSite, type Ladder, type Material, type NavOptions, type Solid, type SpawnPoint, type Vec3, type Zone } from '@duty-shooter/fps-core';
import { linearRgb, normalize, type EndingShot, type Finish, type Lamp, type Lighting, type Look } from '@duty-shooter/fps-client/surfaces';
import { Builder, groundTiles, type Opening, type Rect } from './builder';
import type { CameraKey, CameraSpot, IndoorZone, MapDefinition } from './definition';
import { MAP_CATALOGUE } from './catalogue';
import { facingOpen } from './spawn-facing';

/**
 * Station Nine: an instrument station on a weapons test range, at dawn on
 * the morning of a tower shot. Its cameras and recorders all face the shot
 * tower on the plain to the east-north-east, black against the sunrise, and
 * the match is the countdown: it ends when the device goes off.
 *
 * The station is walled on three sides with earth-backed concrete
 * revetments, and open to the desert on the fourth (north) behind a low
 * barrier. It is mirrored east to west. Three lanes run its length:
 *
 * - the cable trench (north): a 4.25 m wide concrete trench, a metre deep,
 *   in three runs, with a lattice camera tower on each side of it, each
 *   climbed by a ladder;
 * - the recording bunker (middle): a low concrete bunker with doors north
 *   and south, the recorders inside, and ladders and crates to its roof;
 * - the loading docks (south): two docks facing each other over a 4.25 m
 *   gap, the generator houses beyond them and the fuel tanks behind those.
 *
 * Built for movement: a sprint jump falls short of the trench and of the
 * gap between the docks, but the Slide's Kick clears both; the docks, crates
 * and trench walls are at mantle heights, and four ladders climb to the
 * camera towers and the bunker roof. Team 1 starts at the west end, team 2
 * at the east end, where both Charge sites are.
 *
 * Metres, x east, y up, z south; the origin is the station's centre.
 */

/** The playable edge, a hair outside the perimeter walls' outer faces. */
const EDGE_X = 40.35;
const EDGE_Z = 28.35;
/** The perimeter: the walls' inner faces, thickness, and heights (the low barrier on the desert side, the revetment elsewhere). */
const INNER_X = 40;
const INNER_Z = 28;
const PERIMETER_T = 0.3;
const BARRIER_H = 1.0;
const WALL_H = 3.2;
/** Boundary clip reaches this high: out of reach of any jump or mantle. */
const SKY = 100;
const DOOR_H = 2.15;
export const DOOR_W = 1.15;

/**
 * The gap the Kick is built for: wider than a sprint jump carries (about
 * 4.1 m) and narrower than a jump out of a kicked slide (about 4.3 m).
 */
export const KICK_GAP = 4.25;

/**
 * The cable trench: its inner faces (z), floor height, the lining's
 * thickness, and its three runs (inner x), with crossings on the level
 * between them.
 */
export const TRENCH = {
  z0: -21.125,
  z1: -21.125 + KICK_GAP,
  floor: -1.0,
  lining: 0.25,
  runs: [
    [-27, -12.5],
    [-8.5, 8.5],
    [12.5, 27],
  ],
} as const;

/** The camera towers (the east one; the west one mirrors it): footprint, the platform's top, and the ladder's foot and landing. */
export const TOWER = { x0: 17, x1: 21, z0: -27, z1: -23, deck: 5.0, ladderX: 21.5, landingX: 19.9, ladderZ: -25 } as const;
/** The tower's rails round its deck, and the gap in them over the ladder (z). */
const TOWER_RAIL_H = 1.0;
const TOWER_GAP: readonly [number, number] = [-25.55, -24.45];

/** The recording bunker: its outer faces, wall thickness, the roof's underside and top. */
export const BUNKER = { x0: -6, x1: 6, z0: -6, z1: 2, wall: 0.4, ceiling: 3.0, roof: 3.25 } as const;
/** Its doors (x, from) in the north and south walls. */
const BUNKER_DOORS = [-3.6, 2.45] as const;
/** The bunker's ladders, one on each end wall: the foot (x out from the wall) and the landing on the roof, at this z. */
export const BUNKER_LADDER = { x: 6.5, landing: 4.9, z: -4.2 } as const;
/** The crates climbed to the bunker's roof, against its north and south faces (x0, x1, z0, z1). */
export const ROOF_CRATES: readonly (readonly [number, number, number, number])[] = [
  [-0.6, 0.6, 2.0, 3.2],
  [-0.6, 0.6, -7.2, -6.0],
];
export const ROOF_CRATE_H = 1.35;

/** The loading docks (the east one; the west mirrors it), with the Kick gap between them at the middle. */
export const DOCK = { x0: KICK_GAP / 2, x1: 12, z0: 12.5, z1: 18.5, top: 1.4, stairs: [13.6, 12], stairsZ: [12.5, 15] } as const;

/** The generator houses (the east one; the west mirrors it): wall centre lines, height and roof top. */
export const HOUSE = { x0: 17, x1: 26, z0: 12, z1: 21, wall: 0.25, height: 3.0, roof: 3.2 } as const;
/** Crates up to the generator houses' roofs: one by the road, one round the back (x0, x1, z0, z1, east side). */
export const HOUSE_CRATES: readonly (readonly [number, number, number, number])[] = [
  [26.125, 27.325, 13, 14.2],
  [17.3, 18.5, 10.6, 11.8],
];
export const HOUSE_CRATE_H = 1.4;

/** The playable area: the station inside its perimeter. */
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

/** Where the device stands: on its tower out on the plain, east-north-east, with the sun coming up behind it. */
export const GROUND_ZERO: Vec3 = [430, 0, -260];

/** Yaw that looks along +x / -x / +z / -z (yaw 0 looks -z). */
const LOOK = { east: -Math.PI / 2, west: Math.PI / 2, south: Math.PI, north: 0 } as const;

/** Yaw that looks from (x, z) toward the station's centre. */
function faceCentre(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** An x span on the east side (s = 1) or mirrored onto the west (s = -1), low end first. */
function span(s: 1 | -1, a: number, c: number): [number, number] {
  return s > 0 ? [a, c] : [-c, -a];
}

/**
 * The station's finishes: pale desert sand and bleached concrete, the
 * towers in safety orange, olive and white range containers, hazard yellow
 * on the edges a foot could go over.
 */
const FINISHES: Readonly<Record<string, Finish>> = {
  yard: { family: 'sand', color: 0xcbb28c, accent: 0xb59b74 },
  land: { family: 'sand', color: 0xc0a47c, accent: 0xa98d66 },
  track: { family: 'dirt', color: 0xa68c69, accent: 0x8f775a },
  road: { family: 'asphalt', color: 0x4d4944 },
  pad: { family: 'concrete', color: 0xbdb5a6, accent: 0x9e968a },
  revetment: { family: 'concrete', color: 0xc2b7a4, accent: 0xa2988a },
  bunker: { family: 'concrete', color: 0xaea697, accent: 0x8f887c },
  'bunker.inside': { family: 'wornPlaster', color: 0xd3cbb9 },
  'bunker.floor': { family: 'concrete', color: 0x8d877d, accent: 0x77726a },
  trench: { family: 'concrete', color: 0x958d80, accent: 0x7b746a },
  'trench.floor': { family: 'gravel', color: 0x7d746a },
  trim: { family: 'paint', color: 0xe4dccb },
  'roof.flat': { family: 'asphalt', color: 0x5b5650 },
  house: { family: 'sheetMetal', color: 0xd8d2c3 },
  'house.inside': { family: 'plaster', color: 0xcfc6b4 },
  'house.floor': { family: 'concrete', color: 0x8f897f, accent: 0x7a746b },
  dock: { family: 'concrete', color: 0xb3ab9c, accent: 0x958e81 },
  'dock.top': { family: 'concrete', color: 0xa69e90, accent: 0x8a8377 },
  steel: { family: 'paint', color: 0x3e4143 },
  hazard: { family: 'paint', color: 0xdfae2e },
  tower: { family: 'paint', color: 0xc4522f },
  'tower.deck': { family: 'sheetMetal', color: 0x6e6a65 },
  ladder: { family: 'paint', color: 0xcfcabd },
  rack: { family: 'paint', color: 0x5d6a5e },
  console: { family: 'paint', color: 0x8c9187 },
  camera: { family: 'paint', color: 0xdcd6c6 },
  lens: { family: 'glass', color: 0x1a2630 },
  generator: { family: 'paint', color: 0x4f6b4c },
  drum: { family: 'paint', color: 0x2f5a7a },
  'drum.red': { family: 'paint', color: 0x9a3a2a },
  tank: { family: 'paint', color: 0xe3ddce },
  trailer: { family: 'sheetMetal', color: 0xd9d3c4 },
  'trailer.stripe': { family: 'paint', color: 0xc4522f },
  reel: { family: 'floor', color: 0x8f6c45, accent: 0x6f5334 },
  cable: { family: 'paint', color: 0x26282a },
  sandbag: { family: 'plaster', color: 0xb9a37f },
  crate: { family: 'floor', color: 0xa7865a, accent: 0x86683f },
  'crate.frame': { family: 'floor', color: 0x7a5f3e, accent: 0x5f4a30 },
  'container.olive': { family: 'sheetMetal', color: 0x5d6642 },
  'container.white': { family: 'sheetMetal', color: 0xd4d0c4 },
  'container.orange': { family: 'sheetMetal', color: 0xb8622c },
  hut: { family: 'concrete', color: 0xb4ab9b, accent: 0x978f82 },
  shield: { family: 'sheetMetal', color: 0x67635d },
  pier: { family: 'concrete', color: 0xa39b8d, accent: 0x868075 },
  pole: { family: 'floor', color: 0x6a5440, accent: 0x55432f },
  window: { family: 'glass', color: 0x1f2d36 },
  'lamp.cage': { family: 'paint', color: 0x3b3f3a },
  'lamp.glow': { family: 'lamp', color: 0xffd9a0 },
  tyre: { family: 'paint', color: 0x1e1f21, roughness: 0.9, metalness: 0 },
  siren: { family: 'paint', color: 0xb9b4a6, roughness: 0.4, metalness: 0.4 },
  insulator: { family: 'plastic', color: 0x5f8a7f, roughness: 0.15 },
};

/**
 * Dawn: the sun a dozen degrees up in the east-north-east, right behind the
 * shot tower, warm orange; a cool blue sky going peach at the horizon, and
 * sand-coloured light off the ground.
 */
const DAWN: Lighting = {
  sunDirection: normalize([0.8, 0.2, -0.42]),
  sunColor: [1.0, 0.64, 0.44],
  sunIntensity: 2.4,
  sunSpread: 0.022,
  skyZenith: [0.2, 0.3, 0.55],
  skyHorizon: [1.0, 0.72, 0.58],
  skyIntensity: 0.7,
  ground: [0.36, 0.29, 0.24],
  cloudCover: 0.3,
};

/** The work lamps' light (linear): a warm white. */
const WORK_LIGHT = linearRgb(0xffd9a0);

const wallLook = (outside: string, inside: string): Look => ({ side: outside, inside, edge: 'trim', top: outside, bottom: outside });
const FLAT_ROOF: Look = { side: 'trim', top: 'roof.flat', bottom: 'house.inside' };

/** A door in a wall, from `from` along it. */
const door = (from: number): Opening => ({ from, to: from + DOOR_W, bottom: 0, top: DOOR_H });
/** A glazed window from `from` to `to` along a wall. */
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

/** A size in a model's name, in whole centimetres (tools/map/station-nine.py names its models the same way; three.js would mangle a dot). */
const size = (v: number): string => String(Math.round(v * 100));

/** A box resting on the ground (or on `y`), from its footprint. */
function block(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, material: Material, look: string | Look, y = 0): Solid {
  return b.add([x0, y, z0], [x1, y + height, z1], material, { look });
}

/** A crate, or a stack of them (a `crate-<x>x<z>x<height>` model, in cm), from its footprint, `height` tall, resting at `y`. */
function crate(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, y = 0): Solid {
  let solid!: Solid;
  b.model(`crate-${size(x1 - x0)}x${size(z1 - z0)}x${size(height)}`, [(x0 + x1) / 2, y, (z0 + z1) / 2], 0, () => (solid = block(b, x0, x1, z0, z1, height, 'wood', 'crate', y)));
  return solid;
}

type Paint = 'olive' | 'white' | 'orange';

/** A range container (a `container-<length in cm>-<paint>` model) from its footprint, 2.6 m tall; it lies along its footprint's longer side. */
function container(b: Builder, x0: number, x1: number, z0: number, z1: number, paint: Paint): void {
  const along = x1 - x0 >= z1 - z0;
  b.model(`container-${size(Math.max(x1 - x0, z1 - z0))}-${paint}`, [(x0 + x1) / 2, 0, (z0 + z1) / 2], along ? 0 : Math.PI / 2, () => block(b, x0, x1, z0, z1, 2.6, 'metal', `container.${paint}`));
}

/** A line of sandbags (a `sandbags-<length>x<height>` model) from its footprint, resting at `y`; it lies along its footprint's longer side. */
function sandbags(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, y = 0): void {
  const along = x1 - x0 >= z1 - z0;
  b.model(`sandbags-${size(Math.max(x1 - x0, z1 - z0))}x${size(height)}`, [(x0 + x1) / 2, y, (z0 + z1) / 2], along ? 0 : Math.PI / 2, () => block(b, x0, x1, z0, z1, height, 'dirt', 'sandbag', y));
}

/** A wooden cable reel on its side (the `cable-reel` model), its axle along x, at (x, z). */
const REEL = { width: 1.0, diameter: 1.6 } as const;
function reel(b: Builder, x: number, z: number): void {
  const w = REEL.width / 2;
  const r = REEL.diameter / 2;
  b.model('cable-reel', [x, 0, z], 0, () => block(b, x - w, x + w, z - r, z + r, REEL.diameter, 'wood', 'reel'));
}

/** Four drums on a pallet (the `drums-4` model), at (x, z). */
function drums(b: Builder, x: number, z: number): void {
  b.model('drums-4', [x, 0, z], 0, () => block(b, x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0.95, 'metal', 'drum'));
}

/** A concrete instrument pier, waist high. */
function pier(b: Builder, x: number, z: number): void {
  b.model('instrument-pier', [x, 0, z], 0, () => block(b, x - 0.6, x + 0.6, z - 0.6, z + 0.6, 1.2, 'concrete', 'pier'));
}

/**
 * A ladder up a face (the `ladder-<height>` model): two rails and rungs
 * every 0.3 m, on the face at `face` (x) looking out toward `out`, centred
 * on `z`. Its rails and rungs stop bullets but never players; the climb is
 * the map's ladder route.
 */
function ladder(b: Builder, face: number, out: 1 | -1, z: number, top: number): void {
  const x0 = face + out * 0.04;
  const x1 = face + out * 0.12;
  const [a, c] = [Math.min(x0, x1), Math.max(x0, x1)];
  b.model(`ladder-${size(top)}`, [(a + c) / 2, 0, z], out > 0 ? 0 : Math.PI, () => {
    for (const dz of [-0.45, 0.45]) b.add([a, 0, z + dz - 0.04], [c, top, z + dz + 0.04], 'metal', { look: 'ladder', blocks: 'bullets' });
    for (let y = 0.3; y < top - 0.2; y += 0.3) b.add([a, y, z - 0.41], [c, y + 0.05, z + 0.41], 'metal', { look: 'ladder', blocks: 'bullets' });
  });
}

// ---------------------------------------------------------------------------
// The ground, the perimeter and the plain beyond it.

/** The trench's outer rectangles (lining included): holes in the ground. */
function trenchHoles(): Rect[] {
  const t = TRENCH.lining;
  return TRENCH.runs.map(([x0, x1]) => ({ x0: x0 - t, x1: x1 + t, z0: TRENCH.z0 - t, z1: TRENCH.z1 + t }));
}

function buildGround(b: Builder): void {
  const layers: { rect: Rect; material: Material; look: string; hole?: boolean }[] = [
    ...trenchHoles().map((rect) => ({ rect, material: 'concrete' as Material, look: 'trench', hole: true })),
    // Floors: the bunker's and the generator houses'.
    { rect: { x0: BUNKER.x0, x1: BUNKER.x1, z0: BUNKER.z0, z1: BUNKER.z1 }, material: 'concrete', look: 'bunker.floor' },
    ...([-1, 1] as const).map((s) => {
      const [x0, x1] = span(s, HOUSE.x0 - HOUSE.wall / 2, HOUSE.x1 + HOUSE.wall / 2);
      return { rect: { x0, x1, z0: HOUSE.z0 - HOUSE.wall / 2, z1: HOUSE.z1 + HOUSE.wall / 2 }, material: 'concrete' as Material, look: 'house.floor' };
    }),
    // The road along the docks, and the concrete aprons the docks and the tanks stand on.
    { rect: { x0: -EDGE_X, x1: EDGE_X, z0: 8.5, z1: 11.5 }, material: 'asphalt', look: 'road' },
    { rect: { x0: -14.5, x1: 14.5, z0: 11.5, z1: 20 }, material: 'concrete', look: 'pad' },
    { rect: { x0: -27.5, x1: -16.5, z0: 22, z1: EDGE_Z }, material: 'concrete', look: 'pad' },
    { rect: { x0: 16.5, x1: 27.5, z0: 22, z1: EDGE_Z }, material: 'concrete', look: 'pad' },
    // A vehicle track round the bunker, then the station's sand, then the plain.
    { rect: { x0: -EDGE_X, x1: EDGE_X, z0: -11.5, z1: -8.5 }, material: 'dirt', look: 'track' },
    { rect: { x0: -EDGE_X, x1: EDGE_X, z0: -EDGE_Z, z1: EDGE_Z }, material: 'sand', look: 'yard' },
    { rect: { x0: -200, x1: 200, z0: -160, z1: 120 }, material: 'sand', look: 'land' },
  ];
  for (const { rect, material, look, hole } of groundTiles(layers)) {
    if (!hole) b.add([rect.x0, -0.5, rect.z0], [rect.x1, 0, rect.z1], material, { look });
  }
}

/** The low barrier along the desert side (north) and the revetments round the other three sides, each wholly inside the edge. */
function buildPerimeter(b: Builder): void {
  const t = PERIMETER_T;
  b.paint({ side: 'revetment', top: 'revetment', bottom: 'revetment', edge: 'revetment' }, () => {
    const barrier = b.add([-INNER_X - t, 0, -INNER_Z - t], [INNER_X + t, BARRIER_H, -INNER_Z], 'concrete');
    // Hazard paint along the barrier's top edge, inside.
    b.decorateBox(barrier, [-INNER_X, BARRIER_H - 0.15, -INNER_Z - 0.01], [INNER_X, BARRIER_H, -INNER_Z + 0.02], 'hazard');
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

/** The cable line's poles, from beyond the barrier out toward the shot tower. */
function cablePoles(): Vec3[] {
  const from: Vec3 = [24, 0, -34];
  const dx = GROUND_ZERO[0] - from[0];
  const dz = GROUND_ZERO[2] - from[2];
  const length = Math.hypot(dx, dz);
  const poles: Vec3[] = [];
  for (let d = 0; d < length - 40; d += 32) poles.push([from[0] + (dx / length) * d, 0, from[2] + (dz / length) * d]);
  return poles;
}

/** Beyond the barrier: the shot tower on the plain, the cable line running out to it, and the bunkers of the other stations. */
function buildScenery(b: Builder): void {
  const yaw = Math.atan2(GROUND_ZERO[2] - -34, GROUND_ZERO[0] - 24);
  b.scenery('shot-tower', GROUND_ZERO, 0.4);
  for (const p of cablePoles()) b.scenery('cable-pole', p, -yaw);
  // Other instrument stations, low and far off across the plain.
  b.scenery('far-bunker', [-160, 0, -150], 0.3);
  b.scenery('far-bunker', [180, 0, -120], -0.5);
  b.scenery('far-bunker', [330, 0, -60], 1.2);
}

// ---------------------------------------------------------------------------
// Work lamps.

/** A caged work lamp hanging from a roof whose underside is at `ceiling` (the `lamp-cage` model); returns where its light is. */
function cageLamp(b: Builder, x: number, y: number, z: number, ceiling: number): Vec3 {
  b.model('lamp-cage', [x, y, z], 0, () => {
    b.add([x - 0.02, y + 0.3, z - 0.02], [x + 0.02, ceiling, z + 0.02], 'metal', { look: 'lamp.cage' });
    b.add([x - 0.13, y, z - 0.13], [x + 0.13, y + 0.3, z + 0.13], 'metal', { look: 'lamp.cage' });
  });
  return [x, y - 0.15, z];
}

/** The work lamps left burning in the bunker and the generator houses; they hum. */
function buildLamps(b: Builder): { lamps: Lamp[]; humming: Vec3[] } {
  const humming: Vec3[] = [];
  const inside = (p: Vec3): Lamp => (humming.push(p), { position: p, color: WORK_LIGHT, intensity: 9, range: 11 });
  const lamps = [
    inside(cageLamp(b, -2.5, 2.4, -2, BUNKER.ceiling)),
    inside(cageLamp(b, 2.5, 2.4, -2, BUNKER.ceiling)),
    inside(cageLamp(b, -21.5, 2.4, 14.5, HOUSE.height)),
    inside(cageLamp(b, 21.5, 2.4, 14.5, HOUSE.height)),
  ];
  return { lamps, humming };
}

// ---------------------------------------------------------------------------
// The north lane: the cable trench and the camera towers.

/** The trench's runs: a concrete floor a metre down and a lining round it, flush with the ground. */
function buildTrench(b: Builder): void {
  const { z0, z1, floor, lining: t } = TRENCH;
  const bottom = floor - 0.5;
  const LINING: Look = { side: 'trench', top: 'trench', bottom: 'trench', edge: 'trench' };
  for (const [x0, x1] of TRENCH.runs) {
    const north = b.add([x0 - t, bottom, z0 - t], [x1 + t, 0, z0], 'concrete', { look: LINING });
    const south = b.add([x0 - t, bottom, z1], [x1 + t, 0, z1 + t], 'concrete', { look: LINING });
    b.add([x0 - t, bottom, z0], [x0, 0, z1], 'concrete', { look: LINING });
    b.add([x1, bottom, z0], [x1 + t, 0, z1], 'concrete', { look: LINING });
    const bed = b.add([x0, bottom, z0], [x1, floor, z1], 'concrete', { look: { side: 'trench', top: 'trench.floor' } });
    // Hazard paint along the lips, and the cable runs along the floor.
    b.decorateBox(north, [x0 - t, -0.01, z0 - t], [x1 + t, 0.01, z0 - t + 0.12], 'hazard');
    b.decorateBox(south, [x0 - t, -0.01, z1 + t - 0.12], [x1 + t, 0.01, z1 + t], 'hazard');
    for (const z of [z0 + 0.35, z0 + 0.6, z1 - 0.45]) b.decorateBox(bed, [x0, floor - 0.01, z - 0.06], [x1, floor + 0.04, z + 0.06], 'cable');
  }
}

/**
 * A camera tower: a steel lattice on four legs with a ring of beams halfway
 * up, a deck at 5 m with rails round it (open over the ladder), a camera
 * housing on the deck facing the shot tower, a siren post, and the ladder up
 * its outer face. Modelled; its legs, beams, deck and rails collide.
 */
function buildTower(b: Builder, s: 1 | -1): void {
  const [x0, x1] = span(s, TOWER.x0, TOWER.x1);
  const { z0, z1, deck } = TOWER;
  const leg = 0.3;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const outer = s > 0 ? x1 : x0;
  b.model('camera-tower', [cx, 0, cz], s > 0 ? 0 : Math.PI, () => {
    b.paint('tower', () => {
      for (const x of [x0, x1 - leg]) for (const z of [z0, z1 - leg]) b.add([x, 0, z], [x + leg, deck - 0.2, z + leg], 'metal');
      // The ring beams.
      b.add([x0 + leg, 2.4, z0], [x1 - leg, 2.55, z0 + leg], 'metal');
      b.add([x0 + leg, 2.4, z1 - leg], [x1 - leg, 2.55, z1], 'metal');
      b.add([x0, 2.4, z0 + leg], [x0 + leg, 2.55, z1 - leg], 'metal');
      b.add([x1 - leg, 2.4, z0 + leg], [x1, 2.55, z1 - leg], 'metal');
    });
    b.add([x0, deck - 0.2, z0], [x1, deck, z1], 'metal', { look: { side: 'tower', top: 'tower.deck', bottom: 'tower' } });
    // The rails: sheet panels on three sides, and on the ladder's side either side of the gap.
    b.paint({ side: 'tower', top: 'tower', bottom: 'tower', edge: 'tower' }, () => {
      const r = 0.05;
      const top = deck + TOWER_RAIL_H;
      b.add([x0, deck, z0], [x1, top, z0 + r], 'sheetMetal');
      b.add([x0, deck, z1 - r], [x1, top, z1], 'sheetMetal');
      const inner = s > 0 ? x0 : x1 - r;
      b.add([inner, deck, z0 + r], [inner + r, top, z1 - r], 'sheetMetal');
      const o = s > 0 ? x1 - r : x0;
      b.add([o, deck, z0 + r], [o + r, top, TOWER_GAP[0]], 'sheetMetal');
      b.add([o, deck, TOWER_GAP[1]], [o + r, top, z1 - r], 'sheetMetal');
    });
  });
  // The camera housing on its stand, looking at the shot tower over the inner rail.
  const [hx0, hx1] = span(s, 17.25, 18.35);
  b.model('camera-housing', [(hx0 + hx1) / 2, deck, -26.2], 0, () => block(b, hx0, hx1, -26.75, -25.65, 1.1, 'metal', 'camera', deck));
  // The siren on its post at the deck's inner south corner.
  const [px0, px1] = span(s, 17.1, 17.5);
  b.model('siren-post', [(px0 + px1) / 2, deck, -23.3], 0, () => {
    block(b, px0 + 0.14, px1 - 0.14, -23.44, -23.16, 1.5, 'metal', 'siren', deck);
    block(b, px0, px1, -23.5, -23.1, 0.45, 'metal', 'siren', deck + 1.5);
  });
  ladder(b, outer, s, TOWER.ladderZ, deck + 1.05);
}

/** The towers' ladders, and the bunker's. */
function stationLadders(): Ladder[] {
  const out: Ladder[] = [];
  for (const s of [-1, 1] as const) {
    out.push({ bottom: [s * TOWER.ladderX, 0, TOWER.ladderZ], landing: [s * TOWER.landingX, TOWER.deck, TOWER.ladderZ] });
    out.push({ bottom: [s * BUNKER_LADDER.x, 0, BUNKER_LADDER.z], landing: [s * BUNKER_LADDER.landing, BUNKER.roof, BUNKER_LADDER.z] });
  }
  return out;
}

/** Cover along the trench lane: cable reels, piers and sandbag lines, mirrored. */
function buildNorthCover(b: Builder): void {
  for (const s of [-1, 1] as const) {
    reel(b, s * 3.2, -25.2);
    reel(b, s * 19, -25);
    reel(b, s * 28.5, -24.5);
    pier(b, s * 10.5, -25.6);
    pier(b, s * 24.5, -14.2);
    const [a, c] = span(s, 13.5, 16.5);
    sandbags(b, a, c, -15.9, -15.4, 0.9);
    const [d, e] = span(s, 5, 7.4);
    sandbags(b, d, e, -14.6, -14.1, 0.9);
  }
  // Zone A's cover: a reel south of the trench's middle run.
  reel(b, 0, -13.6);
}

// ---------------------------------------------------------------------------
// The middle lane: the recording bunker.

/**
 * The bunker: thick concrete walls with two doors in each long side, the
 * recorder racks along its end walls and the recording console between,
 * under a flat roof reached by a ladder at each end or a crate at each side,
 * with sandbag lines up there for cover.
 */
function buildBunker(b: Builder): void {
  const { x0, x1, z0, z1, wall: t, ceiling, roof } = BUNKER;
  const h = t / 2;
  const doors = BUNKER_DOORS.map((x) => door(x));
  // The walls run up to the roof's top, round the slab: no ledge at the slab's foot to pull up on from a jump.
  const walls = { ...wallLook('bunker', 'bunker.inside'), top: 'roof.flat' };
  room(b, { x0: x0 + h, x1: x1 - h, z0: z0 + h, z1: z1 - h, bottom: 0, height: roof, thickness: t, material: 'concrete', look: walls, north: doors, south: doors });
  b.add([x0 + t, ceiling, z0 + t], [x1 - t, roof, z1 - t], 'concrete', { look: { side: 'bunker.inside', top: 'roof.flat', bottom: 'bunker.inside' } });
  // The racks against each end wall, the console in the middle, facing north.
  for (const s of [-1, 1] as const) {
    const [a, c] = span(s, 4.95, x1 - t);
    b.model('instrument-racks', [(a + c) / 2, 0, -2.3], s > 0 ? 0 : Math.PI, () => block(b, a, c, -4.6, 0.0, 2.0, 'metal', 'rack'));
  }
  b.model('recorder-console', [0, 0, -4.6], 0, () => block(b, -1.4, 1.4, -4.95, -4.25, 1.1, 'metal', 'console'));
  // Sandbags on the roof.
  for (const s of [-1, 1] as const) {
    const [a, c] = span(s, 2.0, 2.45);
    sandbags(b, a, c, -3.6, -0.6, 0.7, roof);
  }
  // The ways up.
  for (const [a, c, d, e] of ROOF_CRATES) crate(b, a, c, d, e, ROOF_CRATE_H);
  for (const s of [-1, 1] as const) ladder(b, s * x1, s, BUNKER_LADDER.z, roof + 1.0);
}

/** Cover between the bunker and the ends: blast shields, a container, crates, drums and sandbags. */
function buildMiddleCover(b: Builder): void {
  for (const s of [-1, 1] as const) {
    const [a, c] = span(s, 11.6, 12.0);
    b.model('blast-shield', [(a + c) / 2, 0, -2.5], s > 0 ? 0 : Math.PI, () => block(b, a, c, -4.5, -0.5, 2.6, 'metal', 'shield'));
    drums(b, s * 9, 4.6);
    const [d, e] = span(s, 18, 24);
    container(b, d, e, -10.2, -7.8, s > 0 ? 'white' : 'olive');
    const [f, g] = span(s, 21, 22.2);
    crate(b, f, g, -2.0, -0.8, 1.1);
    const [i, j] = span(s, 24.5, 27.5);
    sandbags(b, i, j, 2.5, 3.0, 0.9);
    pier(b, s * 16.5, 1.2);
  }
}

// ---------------------------------------------------------------------------
// The south lane: the docks, the generator houses and the tanks.

/** The two loading docks, facing over the Kick gap, each with steps up from its outer end. */
function buildDocks(b: Builder): void {
  const { z0, z1, top } = DOCK;
  for (const s of [-1, 1] as const) {
    const [x0, x1] = span(s, DOCK.x0, DOCK.x1);
    const deck = block(b, x0, x1, z0, z1, top, 'concrete', { side: 'dock', top: 'dock.top', bottom: 'dock', edge: 'dock' });
    // Hazard paint along the edge over the gap, rubber bumpers on its face.
    const lip = s > 0 ? x0 : x1;
    const inward = s > 0 ? 1 : -1;
    b.decorateBox(deck, [Math.min(lip, lip + inward * 0.15), top - 0.01, z0], [Math.max(lip, lip + inward * 0.15), top + 0.01, z1], 'hazard');
    for (const z of [z0 + 1.2, (z0 + z1) / 2, z1 - 1.2]) b.decorateBox(deck, [Math.min(lip, lip - inward * 0.04), 0.5, z - 0.25], [Math.max(lip, lip - inward * 0.04), 1.1, z + 0.25], 'tyre');
    const [from, to] = [s * DOCK.stairs[0], s * DOCK.stairs[1]];
    b.paint({ side: 'dock', top: 'dock.top' }, () => b.stairs({ along: 'x', from, to, across: DOCK.stairsZ, bottom: 0, top, material: 'concrete', maxRise: 0.4 }));
  }
  // A stack of pallets at the far end of each dock, and crates below the gap.
  crate(b, -11.2, -10.0, 17.0, 18.2, 1.0, DOCK.top);
  crate(b, 10.0, 11.2, 17.0, 18.2, 1.0, DOCK.top);
}

/** A generator house: a sheet-metal shed on a slab with doors on three sides and windows north and south, a generator inside. */
function buildHouse(b: Builder, s: 1 | -1): void {
  const [x0, x1] = span(s, HOUSE.x0, HOUSE.x1);
  const spec = { x0, x1, z0: HOUSE.z0, z1: HOUSE.z1, thickness: HOUSE.wall };
  const along = (a: number, c: number): [number, number] => span(s, a, c);
  const [n0] = along(23, 23 + DOOR_W);
  const [s0] = along(19.5, 19.5 + DOOR_W);
  const [nw0, nw1] = along(18.5, 20.5);
  const [sw0, sw1] = along(22.5, 24);
  const side = [door(15.5)];
  room(b, {
    ...spec, bottom: 0, height: HOUSE.height, material: 'sheetMetal', look: wallLook('house', 'house.inside'),
    north: [door(n0), glazed(nw0, nw1)],
    south: [door(s0), glazed(sw0, sw1)],
    west: s > 0 ? side : [],
    east: s > 0 ? [] : side,
  });
  const t = HOUSE.wall / 2;
  b.add([x0 - t, HOUSE.height, HOUSE.z0 - t], [x1 + t, HOUSE.roof, HOUSE.z1 + t], 'sheetMetal', { look: FLAT_ROOF });
  // The generator, against the far end, and drums by the road door.
  const [g0, g1] = span(s, 21.2, 25.0);
  b.model('generator', [(g0 + g1) / 2, 0, 17.3], s > 0 ? 0 : Math.PI, () => block(b, g0, g1, 16.5, 18.1, 1.8, 'metal', 'generator'));
  drums(b, s * 18.2, 13.3);
  for (const [a, c, d, e] of HOUSE_CRATES) {
    const [p, q] = span(s, a, c);
    crate(b, p, q, d, e, HOUSE_CRATE_H);
  }
}

/**
 * A fuel tank lying on saddles (the `fuel-tank` model), along x from x0 to
 * x1 on centre line z. Its collision is stepped round the barrel: each step
 * (height above and below the axis, half-width) covers the circle over its
 * height, and the narrowest runs down to the ground over the saddles.
 */
const TANK = { z: 24.8, radius: 1.3, axis: 1.75, steps: [[0.5, 1.3], [0.85, 1.2], [1.1, 0.99]] } as const;
function fuelTank(b: Builder, x0: number, x1: number): void {
  const { z, axis, radius, steps } = TANK;
  b.model('fuel-tank', [(x0 + x1) / 2, 0, z], 0, () => {
    b.add([x0, 0, z - 0.7], [x1, axis + radius, z + 0.7], 'metal', { look: 'tank' });
    for (const [dy, w] of steps) b.add([x0, axis - dy, z - w], [x1, axis + dy, z + w], 'metal', { look: 'tank' });
  });
}

/** An instrument trailer (the `instrument-trailer` model) from its footprint, lying along x. */
function trailer(b: Builder, x0: number, x1: number, z0: number, z1: number): void {
  b.model('instrument-trailer', [(x0 + x1) / 2, 0, (z0 + z1) / 2], 0, () => block(b, x0, x1, z0, z1, 3.4, 'metal', 'trailer'));
}

function buildSouth(b: Builder): void {
  buildDocks(b);
  for (const s of [-1, 1] as const) {
    buildHouse(b, s);
    const [a, c] = span(s, 18.5, 25.5);
    fuelTank(b, a, c);
    const [d, e] = span(s, 5, 13);
    trailer(b, d, e, 21.5, 24);
  }
  // Behind the trailers, at the middle: a crate stack and sandbags.
  crate(b, -0.6, 0.6, 24.6, 25.8, 1.2);
  sandbags(b, -1.5, 1.5, 21.0, 21.5, 0.9);
}

// ---------------------------------------------------------------------------
// The spawn screens.

/**
 * The screens across each end, between the spawns and the lanes: concrete
 * huts, containers, crate stacks and wall pieces (z0, z1), with gaps to walk
 * through. The two ends' gaps never share a z, so no straight line down a
 * lane joins the spawns. Each piece stands x0..x1 east of the centre, and
 * mirrored at the west end; `west` and `east` list each end's pieces.
 */
const SCREENS = {
  x: [31, 33.4],
  east: [
    { z: [-28, -22], kind: 'container', paint: 'white' },
    { z: [-19.6, -16.4], kind: 'hut' },
    { z: [-14.2, -11.0], kind: 'crates' },
    { z: [-8.2, -2.2], kind: 'container', paint: 'orange' },
    { z: [0.4, 3.6], kind: 'hut' },
    { z: [6.2, 9.4], kind: 'crates' },
    { z: [12, 18], kind: 'container', paint: 'white' },
    { z: [20.4, 23.6], kind: 'hut' },
    { z: [25.6, 28], kind: 'wall' },
  ],
  west: [
    { z: [-25.4, -19.4], kind: 'container', paint: 'olive' },
    { z: [-17.2, -14.0], kind: 'hut' },
    { z: [-11.8, -8.0], kind: 'crates' },
    { z: [-5.2, 0.8], kind: 'container', paint: 'orange' },
    { z: [3.2, 6.4], kind: 'hut' },
    { z: [8.8, 12.4], kind: 'crates' },
    { z: [14.8, 20.8], kind: 'container', paint: 'olive' },
    { z: [23.2, 26.4], kind: 'hut' },
  ],
} as const;

function buildScreens(b: Builder): void {
  for (const side of ['west', 'east'] as const) {
    const s = side === 'east' ? 1 : -1;
    for (const piece of SCREENS[side]) {
      const { z, kind } = piece;
      const [x0, x1] = span(s, SCREENS.x[0], SCREENS.x[1]);
      if (kind === 'hut') {
        b.model('instrument-hut', [(x0 + x1) / 2, 0, (z[0] + z[1]) / 2], s > 0 ? Math.PI / 2 : -Math.PI / 2, () => block(b, x0, x1, z[0], z[1], 2.6, 'concrete', 'hut'));
      } else if (kind === 'container') {
        container(b, x0, x1, z[0], z[1], 'paint' in piece ? piece.paint : 'olive');
      } else if (kind === 'crates') {
        crate(b, x0, x1, z[0], z[1], 2.2);
      } else {
        block(b, x0, x1, z[0], z[1], 2.6, 'concrete', { side: 'revetment', top: 'revetment', edge: 'revetment' });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spawns, objectives and bots.

/** Team 2's spawns at the east end (x, z), each facing a gap in the east screen; team 1's mirror them at the west end. */
const END_SPAWNS: readonly (readonly [number, number])[] = [
  [38.0, -25.5],
  [39.2, -19.5],
  [38.0, -13.5],
  [39.2, -7.5],
  [38.0, -1.5],
  [39.2, 4.5],
  [38.0, 10.5],
  [39.2, 16.5],
  [38.0, 23.5],
];

/**
 * An end spawn at (s * x, z), looking at the middle of the nearest gap in its
 * own end's screen (or between the screen and the boundary, where that is 2 m
 * or more), so a player's first step goes out toward the lanes rather
 * than into a container.
 */
function endSpawn(s: 1 | -1, x: number, z: number): SpawnPoint {
  const edges = [-INNER_Z, ...SCREENS[s > 0 ? 'east' : 'west'].flatMap((piece) => piece.z), INNER_Z];
  const gaps: number[] = [];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1]! - edges[i]! >= 2) gaps.push((edges[i]! + edges[i + 1]!) / 2);
  const gz = gaps.reduce((best, g) => (Math.abs(g - z) < Math.abs(best - z) ? g : best));
  const ax = (s * (SCREENS.x[0] + SCREENS.x[1])) / 2;
  return { position: [s * x, 0, z], yaw: Math.atan2(s * x - ax, z - gz) };
}

function spawnSets(): { ffa: SpawnPoint[]; teams: [SpawnPoint[], SpawnPoint[]] } {
  const team = (s: -1 | 1) => END_SPAWNS.map(([x, z]) => endSpawn(s, x, z));
  const ffa: SpawnPoint[] = [];
  for (const s of [-1, 1] as const) {
    for (const [x, z] of [END_SPAWNS[1]!, END_SPAWNS[3]!, END_SPAWNS[6]!, END_SPAWNS[8]!]) ffa.push(endSpawn(s, x, z));
  }
  for (const [x, z, yaw] of [
    [0, -25.5, LOOK.south], // north of the trench's middle run
    [-14.5, -9, null], // the track, either side
    [14.5, -9, null],
    [0, 6.5, LOOK.north], // between the bunker and the road
    [-9, 26.3, LOOK.east], // behind the trailers
    [9, 26.3, LOOK.west],
  ] as const) {
    ffa.push({ position: [x, 0, z], yaw: yaw ?? faceCentre(x, z) });
  }
  return { ffa, teams: [team(-1), team(1)] };
}

/** Outposts: one zone on each lane, all three at the middle: down in the trench, inside the bunker, and over the gap between the docks. */
const ZONES: readonly Zone[] = [
  { id: 'A', name: 'Trench', center: [0, TRENCH.floor, (TRENCH.z0 + TRENCH.z1) / 2], radius: 2.3, height: 3 },
  { id: 'B', name: 'Bunker', center: [0, 0, -2], radius: 3, height: 3 },
  { id: 'C', name: 'Docks', center: [0, 0, 15.5], radius: 3.4, height: 3 },
];

/** Charge: both sites are at the east end, where team 2 (the second team set) starts: A is the east camera tower, foot and deck; B the east generator house. */
const SITES: readonly ChargeSite[] = [
  { id: 'A', name: 'Camera tower', min: [15.5, 0, -28], max: [22.5, TOWER.deck + 1.3, -21.6] },
  { id: 'B', name: 'Generator house', min: [HOUSE.x0 + 0.15, 0, HOUSE.z0 + 0.15], max: [HOUSE.x1 - 0.15, 2.9, HOUSE.z1 - 0.15] },
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
 * Where the nav grid needs help: both sides of every door, down into the
 * trench and out of it, the docks' steps, the crates up to the roofs, and
 * the towers' decks. Each node stands on the surface at or below its hint.
 */
function navHints(): Vec3[] {
  const hints: Vec3[] = [];
  // The bunker.
  for (const x of BUNKER_DOORS) hints.push(...doorHintsX(x, BUNKER.z0 + BUNKER.wall / 2, 0, 0.9), ...doorHintsX(x, BUNKER.z1 - BUNKER.wall / 2, 0, 0.9));
  for (const [a, c, z0, z1] of ROOF_CRATES) {
    const x = (a + c) / 2;
    const out = z0 > 0 ? 1 : -1;
    const zc = (z0 + z1) / 2;
    hints.push([x, 0, zc + out * 1.4], [x, ROOF_CRATE_H, zc], [x, BUNKER.roof, zc - out * 1.6]);
  }
  for (const s of [-1, 1] as const) hints.push([s * 3.5, BUNKER.roof, -4.2], [s * 3.5, BUNKER.roof, 0.6], [s * 1.0, BUNKER.roof, -2.0]);
  // The trench: along its floor, and the lips either side.
  for (const [x0, x1] of TRENCH.runs) {
    const n = Math.ceil((x1 - x0 - 2) / 3);
    for (let i = 0; i <= n; i++) hints.push([x0 + 1 + (i * (x1 - x0 - 2)) / n, TRENCH.floor, (TRENCH.z0 + TRENCH.z1) / 2]);
  }
  for (const s of [-1, 1] as const) {
    // The towers' decks, and the generator houses' doors, roofs and crates.
    hints.push([s * 19.3, TOWER.deck, -24.2], [s * 18.2, TOWER.deck, -23.8]);
    const [n0] = span(s, 23, 23 + DOOR_W);
    const [s0] = span(s, 19.5, 19.5 + DOOR_W);
    hints.push(...doorHintsX(n0, HOUSE.z0), ...doorHintsX(s0, HOUSE.z1), ...doorHintsZ(s * HOUSE.x0, 15.5));
    for (const [a, c, z0, z1] of HOUSE_CRATES) {
      const [p, q] = span(s, a, c);
      hints.push([(p + q) / 2, HOUSE_CRATE_H, (z0 + z1) / 2]);
    }
    hints.push([s * 25.2, HOUSE.roof, 13.6], [s * 18.0, HOUSE.roof, 12.9], [s * 21.5, HOUSE.roof, 16.5]);
    // The docks' steps and decks.
    hints.push([s * 14.2, 0, 13.7], [s * 11.4, DOCK.top, 13.7], [s * 7, DOCK.top, 15.5], [s * 3, DOCK.top, 15.5]);
  }
  return hints;
}

function navOptions(): NavOptions {
  // The trench's floor is a metre down, below the ground's own underside.
  return { area: BOUNDARY, spacing: 2, hints: navHints(), ceiling: 8, floor: TRENCH.floor - 0.5 };
}

function indoorZones(): IndoorZone[] {
  const { x0, x1, z0, z1, wall, ceiling } = BUNKER;
  const house = (s: 1 | -1): IndoorZone => {
    const [a, c] = span(s, HOUSE.x0, HOUSE.x1);
    return { name: s > 0 ? 'east generator house' : 'west generator house', min: [a, 0, HOUSE.z0], max: [c, HOUSE.height, HOUSE.z1] };
  };
  return [{ name: 'bunker', min: [x0 + wall, 0, z0 + wall], max: [x1 - wall, ceiling, z1 - wall] }, house(-1), house(1)];
}

// ---------------------------------------------------------------------------
// The ending and the cameras.

/**
 * The ending's shot: from above the west end, over the station toward the
 * shot tower and the sunrise behind it, pulling up and back while the siren
 * sounds and tilting up after the cloud as it climbs, then holding behind
 * the scoreboard.
 */
export const NUKE_SHOT: EndingShot = {
  from: [-30, 7, 12],
  to: [-36, 12, 20],
  lookFrom: [GROUND_ZERO[0], 30, GROUND_ZERO[2]],
  lookTo: [GROUND_ZERO[0], 150, GROUND_ZERO[2]],
  seconds: INTERMISSION.nuke + INTERMISSION.vote,
  fov: 62,
};

const EYE = 1.6;

function referenceSpots(): CameraSpot[] {
  return [
    { name: 'west spawn', position: [-37, EYE, -4.5], yaw: LOOK.east, pitch: -0.03 },
    { name: 'east spawn', position: [37, EYE, -4.5], yaw: LOOK.west, pitch: -0.03 },
    { name: 'trench lane west', position: [-29.5, EYE, -22.5], yaw: LOOK.east, pitch: 0 },
    { name: 'down the trench', position: [-11, TRENCH.floor + EYE, -19], yaw: LOOK.east, pitch: -0.02 },
    { name: 'camera tower deck', position: [19.3, TOWER.deck + EYE, -24.2], yaw: LOOK.west + 0.35, pitch: -0.18 },
    { name: 'camera tower foot', position: [14, EYE, -25.5], yaw: LOOK.east, pitch: 0.12 },
    { name: 'bunker', position: [0, EYE, -1.0], yaw: LOOK.north, pitch: -0.05 },
    { name: 'bunker roof', position: [-4.2, BUNKER.roof + EYE, -2], yaw: LOOK.east, pitch: -0.12 },
    { name: 'middle track', position: [-28, EYE, -12], yaw: LOOK.east, pitch: 0 },
    { name: 'road', position: [-28, EYE, 10], yaw: LOOK.east, pitch: 0 },
    { name: 'dock edge', position: [-3.2, DOCK.top + EYE, 15.5], yaw: LOOK.east, pitch: -0.08 },
    { name: 'generator house', position: [18.6, EYE, 19.5], yaw: LOOK.north + 0.6, pitch: -0.02 },
    { name: 'fuel tanks', position: [15, EYE, 26.5], yaw: LOOK.east, pitch: 0 },
    { name: 'shot tower', position: [0, 2.2, -27.2], yaw: Math.atan2(-(GROUND_ZERO[0] - 0), -(GROUND_ZERO[2] + 27.2)), pitch: 0.06 },
    { name: 'overview', position: [0, 38, 46], yaw: LOOK.north, pitch: -0.78 },
  ];
}

/** Down the trench lane, round the east end, back along the road, through the generator house and over the docks, then the bunker. */
function benchmarkPath(): CameraKey[] {
  const k = (x: number, z: number, yaw: number, y = EYE, pitch = 0): CameraKey => ({ position: [x, y, z], yaw, pitch });
  return [
    k(-36, -12.9, LOOK.east),
    k(-26, -12.9, LOOK.east + 0.2),
    k(-12, -15, LOOK.east + 0.3),
    k(14, -15, LOOK.east - 0.3),
    k(29, -15, LOOK.south),
    k(29, 10, LOOK.west),
    k(23.6, 10, LOOK.south),
    k(23.6, 14.5, LOOK.west),
    k(20.1, 14.5, LOOK.south),
    k(20.1, 22.4, LOOK.west),
    k(14.5, 22.4, LOOK.north),
    k(14.5, 13.8, LOOK.west, DOCK.top + EYE),
    k(3, 15.5, LOOK.west, DOCK.top + EYE),
    k(-3, 15.5, LOOK.west, DOCK.top + EYE),
    k(-3.0, 6, LOOK.north),
    k(-3.0, -1, LOOK.north),
    k(3.0, -4.0, LOOK.east),
  ];
}

/** A slow ellipse above the station, looking in at its middle. */
function flyThrough(): CameraKey[] {
  const keys: CameraKey[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 56;
    const z = Math.cos(a) * 44;
    const y = 16 + Math.sin(a * 2) * 4;
    keys.push({ position: [x, y, z], yaw: faceCentre(x, z), pitch: -Math.atan2(y - 2, Math.hypot(x, z)) });
  }
  return keys;
}

export function buildStationNine(): MapDefinition {
  const b = new Builder();
  buildGround(b);
  buildPerimeter(b);
  buildTrench(b);
  for (const s of [-1, 1] as const) buildTower(b, s);
  buildNorthCover(b);
  buildBunker(b);
  buildMiddleCover(b);
  buildSouth(b);
  buildScreens(b);
  buildScenery(b);
  const { lamps, humming } = buildLamps(b);
  buildBoundary(b);
  const spawns = facingOpen(spawnSets(), [...b.solids, ...b.hidden], PLAY_AREA);
  return {
    id: 'station-nine',
    name: MAP_CATALOGUE['station-nine'].name,
    solids: b.solids,
    hiddenSolids: b.hidden,
    ladders: stationLadders(),
    finishes: FINISHES,
    looks: b.looks,
    decorations: b.decorations,
    models: { url: 'models/station-nine.glb', placements: b.models },
    ramps: [],
    labels: [],
    populationSign: null,
    lighting: DAWN,
    lamps,
    horizon: { ground: 'land', inner: { x0: -200, x1: 200, z0: -160, z1: 120 }, light: [-100, 80] },
    scatter: { on: ['land', 'yard'], within: { x0: -200, x1: 200, z0: -160, z1: 120 }, open: 140, walls: 70, seed: 909 },
    nuke: { groundZero: GROUND_ZERO, siren: [17.3, TOWER.deck + 1.7, -23.3], shot: NUKE_SHOT },
    train: null,
    ambience: [
      { kind: 'wind' },
      { kind: 'birds', position: [-20, 1.5, -29] },
      { kind: 'birds', position: [26, 1.5, -29] },
      { kind: 'radio', position: [0, 1.4, -4.6] },
      // The generators run, and the work lamps hum.
      { kind: 'hum', position: [-23.1, 1.0, 17.3] },
      { kind: 'hum', position: [23.1, 1.0, 17.3] },
      ...humming.map((position) => ({ kind: 'hum' as const, position })),
    ],
    spawns,
    zones: ZONES,
    sites: SITES,
    offlineSpawn: spawns.teams[0][4]!,
    overview: { name: 'overview', position: [0, 38, 46], yaw: LOOK.north, pitch: -0.78 },
    dummies: [],
    loadoutStation: null,
    rangeLanesWestOf: null,
    indoorZones: indoorZones(),
    referenceSpots: referenceSpots(),
    benchmarkPath: benchmarkPath(),
    flyThrough: flyThrough(),
    playArea: PLAY_AREA,
    nav: navOptions(),
    measurements: [],
  };
}
