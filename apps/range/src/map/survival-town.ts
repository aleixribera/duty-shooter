import { createWorld, raycastWorld, yawBox, type Material, type PlayerSpawn, type Solid, type SpawnPoint, type Vec3, type World } from '@duty-shooter/fps-core';
import type { Finish, Look } from '@duty-shooter/fps-client/surfaces';
import { Builder, FRAME_PROUD, groundTiles, SINK, type Opening, type Rect, type WallTrim } from './builder';
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

/**
 * The town's finishes: a 1950s palette of pastel siding with white trim,
 * shingle roofs, oak floors and cream plaster inside.
 */
const FINISHES: Readonly<Record<string, Finish>> = {
  'north.siding': { family: 'siding', color: 0x9dcdb3 },
  'north.shutter': { family: 'paint', color: 0x3d6b58 },
  'south.siding': { family: 'siding', color: 0xecd9a0 },
  'south.shutter': { family: 'paint', color: 0x8e4a3c },
  trim: { family: 'paint', color: 0xf3efe4 },
  soffit: { family: 'paint', color: 0xe6e0d2 },
  shingles: { family: 'shingles', color: 0x6b6058, accent: 0x50473f },
  'roof.flat': { family: 'asphalt', color: 0x5d5853 },
  wall: { family: 'plaster', color: 0xeadfc6 },
  ceiling: { family: 'plaster', color: 0xf3efe6 },
  floor: { family: 'floor', color: 0xa87a4f, accent: 0x7d5634 },
  deck: { family: 'floor', color: 0x8f6a4a, accent: 0x6c4f37 },
  walk: { family: 'concrete', color: 0xc4bfb4, accent: 0x99948a },
  'garage.floor': { family: 'concrete', color: 0xa6a198, accent: 0x86827a },
  lawn: { family: 'grass', color: 0x7a9a4c, accent: 0xa4ad58 },
  street: { family: 'asphalt', color: 0x47494c },
  desert: { family: 'sand', color: 0xc9a87c },
  brick: { family: 'brick', color: 0xa4573f, accent: 0xd2c8b8 },
  fence: { family: 'fence', color: 0xf0eee6, accent: 0xdcd8cc },
  sofa: { family: 'plastic', color: 0xd48f8a },
  bedspread: { family: 'plastic', color: 0x86a9cf },
  cabinet: { family: 'paint', color: 0xf0e9d8 },
  counter: { family: 'tile', color: 0x7fc6c0, accent: 0xf2f0ea },
  table: { family: 'floor', color: 0x9b6a42, accent: 0x83583a },
  'ac.unit': { family: 'sheetMetal', color: 0xc4c9cc },
  soil: { family: 'dirt', color: 0x6f5841, accent: 0x5a4634 },
  // Vehicles and the boat.
  'bus.paint': { family: 'paint', color: 0xe3a92b },
  'bus.roof': { family: 'paint', color: 0xeeeae0 },
  'bus.trim': { family: 'paint', color: 0x26282b },
  'van.paint': { family: 'paint', color: 0xe7e3d8 },
  'van.stripe': { family: 'paint', color: 0x2f8a87 },
  'pickup.paint': { family: 'paint', color: 0x9a3a2f },
  'wagon.paint': { family: 'paint', color: 0x88aabd },
  'wagon.wood': { family: 'floor', color: 0x9a6a3f, accent: 0x7b5230 },
  'window.tint': { family: 'paint', color: 0x2a3843 },
  tyre: { family: 'plastic', color: 0x1e1f21 },
  chrome: { family: 'sheetMetal', color: 0xc8ccd0 },
  lamp: { family: 'plastic', color: 0xf3edd0 },
  'tail.lamp': { family: 'plastic', color: 0xb3362c },
  'boat.hull': { family: 'paint', color: 0xf1efe8 },
  'boat.stripe': { family: 'paint', color: 0x2b6f9e },
  'boat.deck': { family: 'floor', color: 0xb08355, accent: 0x8a6640 },
  trailer: { family: 'sheetMetal', color: 0x6f767c },
  // Mannequins: one skin, outfits in the houses' colours.
  mannequin: { family: 'plastic', color: 0xe6d2b8 },
  'outfit.blue': { family: 'plastic', color: 0x5f86a8 },
  'outfit.red': { family: 'plastic', color: 0xc65d4f },
  'outfit.green': { family: 'plastic', color: 0x6e9a72 },
  'outfit.mustard': { family: 'plastic', color: 0xd9b04e },
  'outfit.charcoal': { family: 'plastic', color: 0x3c4048 },
  'outfit.khaki': { family: 'plastic', color: 0x8a7658 },
  // The test site round the town.
  'site.paint': { family: 'paint', color: 0xd8d2c4 },
  'site.steel': { family: 'paint', color: 0x7b8085 },
  'site.red': { family: 'paint', color: 0xb04a33 },
  tank: { family: 'sheetMetal', color: 0xb7bcbf },
  bunker: { family: 'concrete', color: 0xb9b2a4, accent: 0x9a9386 },
  pole: { family: 'floor', color: 0x6b5038, accent: 0x5a4330 },
  // The population sign.
  'sign.board': { family: 'paint', color: 0xf2ead6 },
  'sign.post': { family: 'paint', color: 0x3c3f43 },
};

/** Ground tiles by material. */
const GROUND: Partial<Record<Material, string>> = { wood: 'floor', concrete: 'walk', grass: 'lawn', asphalt: 'street', sand: 'desert' };

/** An outside wall: siding out, plaster in, trim on its ends, top and underside. */
const outsideWall = (siding: string): Look => ({ side: siding, inside: 'wall', edge: 'trim', top: 'trim', bottom: 'trim' });
const INSIDE_WALL: Look = { side: 'wall', edge: 'trim', top: 'trim', bottom: 'trim' };
const SLAB: Look = { side: 'trim', top: 'floor', bottom: 'ceiling' };
const CEILING: Look = { side: 'trim', top: 'ceiling', bottom: 'ceiling' };
const ROOF: Look = { side: 'trim', top: 'shingles', bottom: 'soffit' };

/** Yaw that looks from `p` toward the cul-de-sac centre. */
function faceCentre(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Yaw that looks along +x / -x / +z / -z. */
const LOOK = { east: -Math.PI / 2, west: Math.PI / 2, south: Math.PI, north: 0 } as const;

/** A house's own colours: its siding and its shutters. */
interface Palette {
  readonly siding: string;
  readonly shutter: string;
}

const PALETTES = {
  north: { siding: 'north.siding', shutter: 'north.shutter' },
  south: { siding: 'south.siding', shutter: 'south.shutter' },
} as const satisfies Record<string, Palette>;

/**
 * Builds one house and its yard at distance `d` from the street axis, on the
 * side `s` (-1 north, +1 south), in that house's palette.
 */
class Side {
  readonly palette: Palette;

  constructor(
    readonly b: Builder,
    readonly s: -1 | 1,
  ) {
    this.palette = s === -1 ? PALETTES.north : PALETTES.south;
  }

  /** Paints what `fn` builds in `look`. */
  paint(look: Look | string, fn: () => void): void {
    this.b.paint(look, fn);
  }

  /**
   * Trim for a wall whose inside face looks toward `inside` (+1/-1 across its
   * thickness): frames and shutters outside, frames and baseboards inside.
   * An inside wall gets frames and baseboards on both faces.
   */
  trim(inside: 1 | -1 | 'both'): WallTrim[] {
    if (inside === 'both') return [1, -1].map((face) => ({ face: face as 1 | -1, frames: 'trim', baseboard: 'trim' }));
    return [
      { face: -inside as 1 | -1, frames: 'trim', shutters: this.palette.shutter },
      { face: inside, frames: 'trim', baseboard: 'trim' },
    ];
  }

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

  /** Options for a wall: its look, and which way its inside faces (in distance terms for wallX: toward larger d is +1). */
  #dress(look: Look | undefined, inside: 1 | -1 | 'both' | undefined, flip: boolean): { look?: Look; trim?: WallTrim[] } {
    if (!look) return {};
    const face = inside === undefined || inside === 'both' ? inside : flip ? ((inside * this.s) as 1 | -1) : inside;
    return { look, ...(face === undefined ? {} : { trim: this.trim(face) }) };
  }

  /** A wall running along x at distance d; `inside` is the side of it that is indoors (+1: toward larger d). Returns its full-height pieces, west to east. */
  wallX(d: number, x0: number, x1: number, bottom: number, height: number, material: Material, thickness: number, openings: readonly Opening[] = [], look?: Look, inside?: 1 | -1 | 'both'): Solid[] {
    return this.b.wall({ along: 'x', at: this.z(d), from: x0, to: x1, thickness, bottom, height, material, openings, ...this.#dress(look, inside, true) });
  }

  /** A wall running along z at x, from distance d0 to d1, with openings given in distances; `inside` is +1 toward +x. */
  wallD(x: number, d0: number, d1: number, bottom: number, height: number, material: Material, thickness: number, openings: readonly Opening[] = [], look?: Look, inside?: 1 | -1 | 'both'): Solid[] {
    const mapped = openings.map((o) => ({ ...o, from: Math.min(this.z(o.from), this.z(o.to)), to: Math.max(this.z(o.from), this.z(o.to)) }));
    return this.b.wall({ along: 'z', at: x, from: this.z(d0), to: this.z(d1), thickness, bottom, height, material, openings: mapped, ...this.#dress(look, inside, false) });
  }

  /**
   * White corner boards where an x wall ends at an outside corner: one on
   * its outside face (looking `out`, +1 toward larger d), one on its end.
   */
  corner(piece: Solid | undefined, end: 'west' | 'east', out: 1 | -1): void {
    if (!piece) return;
    const ex = end === 'east' ? 1 : -1;
    const xe = end === 'east' ? piece.max[0] : piece.min[0];
    const fo = out * this.s;
    const zf = fo > 0 ? piece.max[2] : piece.min[2];
    const zb = fo > 0 ? piece.min[2] : piece.max[2];
    const [y0, y1] = [piece.min[1], piece.max[1]];
    const sort = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);
    const [fx0, fx1] = sort(xe - ex * 0.12, xe + ex * FRAME_PROUD);
    const [fz0, fz1] = sort(zf - fo * SINK, zf + fo * FRAME_PROUD);
    this.b.decorateBox(piece, [fx0, y0, fz0], [fx1, y1, fz1], 'trim');
    const [sx0, sx1] = sort(xe - ex * SINK, xe + ex * FRAME_PROUD);
    const [sz0, sz1] = sort(zb, zf + fo * FRAME_PROUD);
    this.b.decorateBox(piece, [sx0, y0, sz0], [sx1, y1, sz1], 'trim');
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

  const out = outsideWall(side.palette.siding);

  // Main block, ground floor (wood frame walls with siding).
  const front = side.wallX(M.d0, M.x0 - h, M.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(-6, -3.5), door(HOUSE.frontDoor.x0), glass(3, 5)], out, 1);
  const back = side.wallX(M.d1, M.x0 - h, M.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [door(-4), glass(1, 4, 1.0)], out, -1);
  side.wallD(M.x1, M.d0 + h, M.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(17, 19.5), glass(26, 28)], out, -1);
  side.wallD(M.x0, M.d0 + h, M.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [door(16), door(25), glass(29, 30.5)], out, 1);
  side.corner(front[0], 'west', -1);
  side.corner(front.at(-1), 'east', -1);
  side.corner(back[0], 'west', 1);
  side.corner(back.at(-1), 'east', 1);

  // Inside stairs to the upper floor, climbing away from the street.
  const S = HOUSE.stairs;
  side.paint({ side: 'trim', top: 'floor' }, () => b.stairs({ along: 'z', from: side.z(S.d0), to: side.z(S.d1), across: [S.x0, S.x1], bottom: 0, top: UPPER_FLOOR, material: 'wood' }));

  // Upper floor: a slab over the two-storey part with the stairwell left open, and the den's ceiling beside it.
  const slab = UPPER_FLOOR - 0.2;
  side.paint(SLAB, () => {
    side.box(S.x1, slab, M.d0 + h, M.x1 - h, UPPER_FLOOR, M.d1 - h, 'wood');
    side.box(M.upperX0, slab, M.d0 + h, S.x1, UPPER_FLOOR, S.d0, 'wood');
    side.box(M.upperX0, slab, S.d1, S.x1, UPPER_FLOOR, M.d1 - h, 'wood');
  });
  side.paint(CEILING, () => side.box(M.x0 + h, slab, M.d0 + h, M.upperX0, UPPER_FLOOR, M.d1 - h, 'plaster'));
  // Railing round the stairwell.
  side.paint('trim', () => {
    side.box(S.x1, UPPER_FLOOR, S.d0, S.x1 + 0.08, UPPER_FLOOR + 1, S.d1, 'wood');
    side.box(S.x0, UPPER_FLOOR, S.d0, S.x1, UPPER_FLOOR + 1, S.d0 + 0.08, 'wood');
  });

  // Upper storey walls, the front window open to the street.
  const upper = UPPER_TOP - UPPER_FLOOR;
  const W = HOUSE.window;
  const upperFront = side.wallX(M.d0, M.upperX0 - h, M.x1 + h, UPPER_FLOOR, upper, 'wood', OUTER, [{ from: W.x0, to: W.x1, bottom: W.sill, top: W.top }], out, 1);
  const upperBack = side.wallX(M.d1, M.upperX0 - h, M.x1 + h, UPPER_FLOOR, upper, 'wood', OUTER, [door(0), glass(3, 5)], out, -1);
  side.wallD(M.x1, M.d0 + h, M.d1 - h, UPPER_FLOOR, upper, 'wood', OUTER, [glass(18, 20)], out, -1);
  side.wallD(M.upperX0, M.d0 + h, M.d1 - h, UPPER_FLOOR, upper, 'wood', OUTER, [], out, 1);
  side.corner(upperFront[0], 'west', -1);
  side.corner(upperFront.at(-1), 'east', -1);
  side.corner(upperBack[0], 'west', 1);
  side.corner(upperBack.at(-1), 'east', 1);
  // Partitions stop under the ceiling slabs.
  side.wallX(24, M.upperX0 + h, M.x1 - h, UPPER_FLOOR, upper - 0.2, 'plaster', INNER, [door(3)], INSIDE_WALL, 'both');
  side.paint(CEILING, () => side.box(M.upperX0 + h, UPPER_TOP - 0.2, M.d0 + h, M.x1 - h, UPPER_TOP, M.d1 - h, 'plaster'));

  // Garage block: the garage at the front, open to the driveway, and a utility room behind it.
  const garageFront = side.wallX(G.d0, G.x0 - h, G.x1 + h, 0, UPPER_FLOOR, 'wood', OUTER, [{ from: -15.5, to: -9.5, bottom: 0, top: 2.4 }], out, 1);
  const garageBack = side.wallX(G.d1, G.x0 - h, G.x1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [door(-12)], out, -1);
  side.wallD(G.x0, G.d0 + h, G.d1 - h, 0, UPPER_FLOOR, 'wood', OUTER, [glass(23, 24.5)], out, 1);
  side.wallD(G.x1, G.d0 + h, M.d0 - h, 0, UPPER_FLOOR, 'wood', OUTER, [], out, -1);
  side.corner(garageFront[0], 'west', -1);
  side.corner(garageFront.at(-1), 'east', -1);
  side.corner(garageBack[0], 'west', 1);
  side.wallX(G.partition, G.x0 + h, G.x1 - h, 0, slab, 'plaster', INNER, [door(-14)], INSIDE_WALL, 'both');
  side.paint(CEILING, () => side.box(G.x0 + h, slab, G.d0 + h, G.x1 - h, UPPER_FLOOR, G.d1 - h, 'plaster'));

  // Roofs: the two-storey gable, the den's lean-to against it and the garage's gable across it.
  const R = HOUSE.roof;
  const eave = R.eave;
  const roofLooks = { looks: { roof: ROOF, gable: out } };
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
    gables: { at: [side.z(M.d0), side.z(M.d1)], thickness: OUTER, material: 'wood', overhang: eave },
    ...roofLooks,
  });
  const [dz0, dz1] = [side.z(M.d0 - h - eave), side.z(M.d1 + h)].sort((p, q) => p - q) as [number, number];
  side.paint(ROOF, () => b.slope({ from: [M.x0 - h, 0], to: [M.upperX0 - h, 0], along: 'x', across: [dz0, dz1], base: UPPER_FLOOR, low: UPPER_FLOOR, high: R.denHigh, material: 'wood' }));
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
    gables: { at: [G.x0, G.x1], thickness: OUTER, material: 'wood', overhang: eave },
    ...roofLooks,
  });

  // Front porch: a flat roof on two posts over the front door, climbable from the planter beside it.
  const P = HOUSE.porch;
  side.paint({ side: 'trim', top: 'roof.flat', bottom: 'soffit' }, () => side.box(P.x0, P.top - 0.15, P.d0, P.x1, P.top, M.d0 - h, 'wood'));
  side.paint('trim', () => {
    side.box(P.x0, 0, P.d0, P.x0 + 0.15, P.top - 0.15, P.d0 + 0.15, 'wood');
    side.box(P.x1 - 0.15, 0, P.d0, P.x1, P.top - 0.15, P.d0 + 0.15, 'wood');
  });
  side.paint({ side: 'brick', top: 'soil' }, () => {
    side.box(3, 0, 10.8, 4.6, 0.8, 11.9, 'brick');
    side.box(-4.75, 0, 12.2, -1.6, 0.6, 13.6, 'brick');
  });

  // Back deck at the upper floor, with outdoor stairs up from the yard.
  const D = HOUSE.deck;
  const deckD0 = M.d1 + h;
  side.paint({ side: 'trim', top: 'deck', bottom: 'deck' }, () => side.box(D.x0, slab, deckD0, D.x1, UPPER_FLOOR, D.d1, 'wood'));
  side.paint('trim', () => {
    for (const x of [D.x0, -2.6, D.x1 - 0.15]) side.box(x, 0, D.d1 - 0.15, x + 0.15, slab, D.d1, 'wood');
  });
  side.paint({ side: 'fence', top: 'trim', edge: 'trim' }, () => {
    side.box(D.x0, UPPER_FLOOR, D.d1 - 0.08, D.x1, UPPER_FLOOR + 1, D.d1, 'wood');
    side.box(D.x1 - 0.08, UPPER_FLOOR, deckD0, D.x1, UPPER_FLOOR + 1, D.d1 - 0.08, 'wood');
    side.box(D.x0, UPPER_FLOOR, deckD0, D.x0 + 0.08, UPPER_FLOOR + 1, D.d1 - 1.4, 'wood');
  });
  const [sz0, sz1] = [side.z(D.d1 - 1.4), side.z(D.d1)].sort((p, q) => p - q) as [number, number];
  side.paint({ side: 'trim', top: 'deck' }, () => b.stairs({ along: 'x', from: D.stairsX0, to: D.x0, across: [sz0, sz1], bottom: 0, top: UPPER_FLOOR, material: 'wood' }));

  // Furniture: cover inside, gaps either a body wide or closed.
  side.paint('sofa', () => side.box(2, 0, 21, 5, 0.85, 22, 'wood'));
  side.paint({ side: 'cabinet', top: 'counter' }, () => {
    side.box(5, 0, 25, M.x1 - h, 0.9, 30, 'wood'); // kitchen counter
    side.box(1, 0, 27, 3.5, 0.9, 28.2, 'wood'); // kitchen island
  });
  side.paint('table', () => {
    side.box(-6, 0, 18, -4, 0.75, 19.5, 'wood'); // den table
    side.box(G.x0 + h, 0, 14, -16.2, 0.9, 18, 'wood'); // workbench
  });
  side.paint({ side: 'table', top: 'bedspread' }, () => {
    side.box(4, UPPER_FLOOR, 15, M.x1 - h, UPPER_FLOOR + 0.6, 17, 'wood'); // front bedroom bed
    side.box(3.5, UPPER_FLOOR, 27, M.x1 - h, UPPER_FLOOR + 0.6, 29.5, 'wood'); // back bedroom bed
  });
  side.paint('cabinet', () => side.box(-1.5, UPPER_FLOOR, 22.9, 0, UPPER_FLOOR + 1.2, 23.9, 'wood')); // dresser

  // The yard: an air-conditioning unit behind the garage (a step up to its roof) and a raised bed along the east side.
  side.paint('ac.unit', () => side.box(-15.5, 0, G.d1 + h, -14.5, 1.2, G.d1 + h + 1, 'metal'));
  side.paint({ side: 'deck', top: 'soil' }, () => side.box(6.2, 0, 17, 7.6, 0.3, 29, 'dirt'));
}

/** The asphalt cul-de-sac: strips across z that stay inside the circle, the middle ones running on down the street. */
function circleStrips(): Rect[] {
  const strips: Rect[] = [];
  const step = 0.1;
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
  const layers: { rect: Rect; material: Material; look?: string }[] = [];
  for (const side of sides) {
    const M = HOUSE.main;
    const G = HOUSE.garage;
    layers.push({ rect: side.rectD(M.x0 - OUTER / 2, M.x1 + OUTER / 2, M.d0 - OUTER / 2, M.d1 + OUTER / 2), material: 'wood' });
    layers.push({ rect: side.rectD(G.x0 - OUTER / 2, G.x1 + OUTER / 2, G.d0 - OUTER / 2, G.d1 + OUTER / 2), material: 'concrete', look: 'garage.floor' });
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
  for (const { rect, material, look: own } of groundTiles(layers)) {
    const look = own ?? GROUND[material];
    b.add([rect.x0, -0.5, rect.z0], [rect.x1, 0, rect.z1], material, look ? { look } : {});
  }
  // A low curb round the cul-de-sac, over the asphalt strips' stepped ends, open where the street leaves.
  const n = 64;
  const r = CIRCLE_R - 0.05;
  const length = 2 * r * Math.tan(Math.PI / n) + 0.02;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (x > 0 && Math.abs(z) < STREET_HALF + 0.3) continue;
    b.turned([x, CURB_H / 2, z], [0.3, CURB_H, length], -a, 'concrete');
  }
}

/** The cul-de-sac's curb height: low enough to walk over without a step. */
const CURB_H = 0.06;

/** One box of a vehicle (or a mannequin): from `from` to `to` along its length, `width` across and `height` up from `bottom`. */
interface Part {
  readonly from: number;
  readonly to: number;
  readonly width: number;
  readonly height: number;
  readonly bottom?: number;
  readonly material: Material;
  readonly look: Look | string;
}

/**
 * Something built in its own frame, turned `yaw` about a centre on the
 * ground: positions along it (a), up (y) and across to its left (c). Vehicles
 * and mannequins are boxes laid out this way, with trim on their faces.
 */
class Frame {
  readonly #c: readonly [number, number];
  readonly #u: readonly [number, number];
  readonly #v: readonly [number, number];

  constructor(
    readonly b: Builder,
    center: readonly [number, number],
    readonly yaw: number,
  ) {
    this.#c = center;
    this.#u = [Math.cos(yaw), -Math.sin(yaw)];
    this.#v = [Math.sin(yaw), Math.cos(yaw)];
  }

  /** The world point `a` along, `y` up and `c` across. */
  at(a: number, y: number, c: number): Vec3 {
    return [this.#c[0] + this.#u[0] * a + this.#v[0] * c, y, this.#c[1] + this.#u[1] * a + this.#v[1] * c];
  }

  part(p: Part): Solid {
    const bottom = p.bottom ?? 0;
    return this.b.turned(this.at((p.from + p.to) / 2, bottom + p.height / 2, 0), [p.to - p.from, p.height, p.width], this.yaw, p.material, p.look);
  }

  /** Trim on a solid, as ranges along, up and across. */
  trim(solid: Solid, a0: number, a1: number, y0: number, y1: number, c0: number, c1: number, finish: string): void {
    this.b.decorate(solid, this.at((a0 + a1) / 2, (y0 + y1) / 2, (c0 + c1) / 2), [a1 - a0, y1 - y0, c1 - c0], finish, this.yaw);
  }

  /** A panel standing `proud` off a part's left side (+1), right side (-1) or both (0), from a0 to a1 along and y0 to y1 up. */
  side(solid: Solid, p: Part, which: 1 | -1 | 0, a0: number, a1: number, y0: number, y1: number, finish: string, proud = 0.015): void {
    const w = p.width / 2;
    if (which >= 0) this.trim(solid, a0, a1, y0, y1, w - SINK, w + proud, finish);
    if (which <= 0) this.trim(solid, a0, a1, y0, y1, -w - proud, -w + SINK, finish);
  }

  /** A panel standing `proud` off a part's front (+1) or back (-1) end, from c0 to c1 across and y0 to y1 up. */
  end(solid: Solid, p: Part, which: 1 | -1, c0: number, c1: number, y0: number, y1: number, finish: string, proud = 0.015): void {
    const [a0, a1] = which > 0 ? [p.to - SINK, p.to + proud] : [p.from - proud, p.from + SINK];
    this.trim(solid, a0, a1, y0, y1, c0, c1, finish);
  }

  /** A wheel on both sides of a part at each `a`: a tyre and a hub cap. */
  wheels(solid: Solid, p: Part, at: readonly number[], r: number): void {
    for (const a of at) {
      this.side(solid, p, 0, a - r, a + r, 0, 2 * r, 'tyre', 0.035);
      this.side(solid, p, 0, a - r * 0.45, a + r * 0.45, r * 0.55, r * 1.45, 'chrome', 0.045);
    }
  }

  /** A front end: bumper, grille `grille` either side of the middle, and headlights at `lights` up. */
  face(solid: Solid, p: Part, grille: number, lights: number): void {
    const w = p.width / 2;
    this.end(solid, p, 1, -w + 0.05, w - 0.05, 0.28, 0.46, 'chrome', 0.04);
    this.end(solid, p, 1, -grille, grille, 0.5, lights + 0.12, 'chrome', 0.02);
    for (const c of [-1, 1]) this.end(solid, p, 1, c > 0 ? w - 0.32 : -w + 0.1, c > 0 ? w - 0.1 : -w + 0.32, lights, lights + 0.2, 'lamp', 0.025);
  }

  /** A back end: bumper and tail lamps at `lights` up. */
  tail(solid: Solid, p: Part, lights: number): void {
    const w = p.width / 2;
    this.end(solid, p, -1, -w + 0.05, w - 0.05, 0.28, 0.46, 'bus.trim', 0.04);
    for (const c of [-1, 1]) this.end(solid, p, -1, c > 0 ? w - 0.25 : -w + 0.08, c > 0 ? w - 0.08 : -w + 0.25, lights, lights + 0.22, 'tail.lamp', 0.02);
  }
}

/** Windows in a row along a part's sides: `count` panes `pane` long from `a0`, `gap` apart. */
function windowRow(f: Frame, solid: Solid, p: Part, which: 1 | -1 | 0, a0: number, count: number, pane: number, gap: number, y0: number, y1: number): void {
  for (let i = 0; i < count; i++) f.side(solid, p, which, a0 + i * (pane + gap), a0 + i * (pane + gap) + pane, y0, y1, 'window.tint', 0.012);
}

const BUS = { center: [5.4, 2.2] as const, yaw: 0.28, length: 12.2 };

/** The cul-de-sac's vehicles: a school bus, a moving van, a pickup and a station wagon, all original designs. */
function buildStreet(b: Builder): void {
  // The school bus, nose to the east: body and engine hood.
  const half = BUS.length / 2;
  const bus = new Frame(b, BUS.center, BUS.yaw);
  const body: Part = { from: -half, to: half - 1.8, width: 2.5, height: 3.1, material: 'sheetMetal', look: { side: 'bus.paint', top: 'bus.roof' } };
  const hood: Part = { from: half - 1.8, to: half, width: 2.2, height: 1.45, material: 'metal', look: 'bus.paint' };
  const bodySolid = bus.part(body);
  const hoodSolid = bus.part(hood);
  windowRow(bus, bodySolid, body, 0, -5.5, 7, 0.8, 0.2, 1.75, 2.55);
  windowRow(bus, bodySolid, body, 1, 1.5, 2, 0.8, 0.2, 1.75, 2.55);
  // The door on the curb side (the bus's right), and black rub rails up to it.
  bus.side(bodySolid, body, -1, 2.15, 3.05, 0.35, 2.6, 'window.tint', 0.012);
  for (const y of [0.95, 1.45]) {
    bus.side(bodySolid, body, -1, -half + 0.1, 2.05, y, y + 0.08, 'bus.trim', 0.02);
    bus.side(bodySolid, body, 1, -half + 0.1, half - 1.9, y, y + 0.08, 'bus.trim', 0.02);
  }
  bus.end(bodySolid, body, 1, -1.1, 1.1, 1.75, 2.6, 'window.tint');
  bus.end(bodySolid, body, -1, -0.6, 0.6, 1.8, 2.5, 'window.tint');
  bus.tail(bodySolid, body, 0.9);
  bus.wheels(bodySolid, body, [-3.6, 3.45], 0.5);
  bus.face(hoodSolid, hood, 0.6, 0.95);

  // The moving van, its cab toward the pickup: box, cab and hood.
  const van = new Frame(b, [-6.3, -3.0], 0.05);
  const box: Part = { from: -4.2, to: 1.8, width: 2.5, height: 3.4, material: 'sheetMetal', look: 'van.paint' };
  const cab: Part = { from: 1.8, to: 3.6, width: 2.3, height: 2.3, material: 'metal', look: { side: 'van.stripe', top: 'van.paint' } };
  const vanHood: Part = { from: 3.6, to: 4.4, width: 2.0, height: 1.3, material: 'metal', look: 'van.stripe' };
  const boxSolid = van.part(box);
  const cabSolid = van.part(cab);
  const vanHoodSolid = van.part(vanHood);
  van.side(boxSolid, box, 0, -4.1, 1.7, 1.9, 2.3, 'van.stripe');
  van.end(boxSolid, box, -1, -0.02, 0.02, 0.5, 3.2, 'bus.trim', 0.01);
  van.tail(boxSolid, box, 0.8);
  van.wheels(boxSolid, box, [-3.1, -1.9], 0.45);
  van.side(cabSolid, cab, 0, 2.0, 3.3, 1.35, 2.0, 'window.tint', 0.012);
  van.trim(cabSolid, 3.6 - SINK, 3.6 + 0.015, 1.35, 2.05, -1.0, 1.0, 'window.tint');
  van.wheels(cabSolid, cab, [2.7], 0.45);
  van.face(vanHoodSolid, vanHood, 0.5, 0.75);

  // The pickup truck: bed, cab and hood.
  const pickup = new Frame(b, [2.2, -3.6], -0.1);
  const bed: Part = { from: -2.7, to: -0.4, width: 2.0, height: 1.0, material: 'sheetMetal', look: { side: 'pickup.paint', top: 'deck' } };
  const pcab: Part = { from: -0.4, to: 1.3, width: 2.0, height: 1.8, material: 'metal', look: 'pickup.paint' };
  const phood: Part = { from: 1.3, to: 2.7, width: 1.9, height: 1.15, material: 'metal', look: 'pickup.paint' };
  const bedSolid = pickup.part(bed);
  const pcabSolid = pickup.part(pcab);
  const phoodSolid = pickup.part(phood);
  pickup.tail(bedSolid, bed, 0.7);
  pickup.wheels(bedSolid, bed, [-1.9], 0.4);
  pickup.side(pcabSolid, pcab, 0, -0.25, 0.95, 1.15, 1.65, 'window.tint', 0.012);
  pickup.trim(pcabSolid, -0.4 - 0.012, -0.4 + SINK, 1.15, 1.65, -0.7, 0.7, 'window.tint');
  pickup.trim(pcabSolid, 1.3 - SINK, 1.3 + 0.012, 1.2, 1.7, -0.85, 0.85, 'window.tint');
  pickup.wheels(phoodSolid, phood, [2.0], 0.4);
  pickup.face(phoodSolid, phood, 0.45, 0.7);

  // A woody station wagon parked across the street end.
  const wagon = new Frame(b, [15.75, -0.75], Math.PI / 2 + 0.06);
  const car: Part = { from: -2.4, to: 2.4, width: 1.9, height: 1.45, material: 'sheetMetal', look: 'wagon.paint' };
  const carSolid = wagon.part(car);
  wagon.side(carSolid, car, 0, -2.2, 1.2, 0.48, 0.92, 'wagon.wood');
  windowRow(wagon, carSolid, car, 0, -2.2, 3, 1.0, 0.15, 1.0, 1.38);
  wagon.end(carSolid, car, 1, -0.75, 0.75, 0.98, 1.38, 'window.tint');
  wagon.end(carSolid, car, -1, -0.7, 0.7, 0.98, 1.36, 'window.tint');
  wagon.wheels(carSolid, car, [-1.5, 1.5], 0.36);
  wagon.face(carSolid, car, 0.45, 0.62);
  wagon.tail(carSolid, car, 0.62);
}

function buildYards(b: Builder): void {
  const north = new Side(b, -1);
  const south = new Side(b, 1);
  // North yard: a garden shed by the back fence and a picnic table.
  north.paint({ side: north.palette.siding, top: 'roof.flat', edge: 'trim' }, () => north.box(-5, 0, 48, -1, 2.4, 50.5, 'wood'));
  north.paint('table', () => north.box(-11, 0, 44.5, -9, 0.75, 45.5, 'wood'));
  // South yard: a boat on its trailer, along the west fence, and its own picnic table.
  const boat = new Frame(b, [-20.4, 36], 1.33);
  const trailer: Part = { from: -2.5, to: 2.5, width: 2.0, height: 0.5, material: 'metal', look: 'trailer' };
  const hull: Part = { from: -2.4, to: 2.4, width: 1.9, height: 1.1, bottom: 0.5, material: 'wood', look: { side: 'boat.hull', top: 'boat.deck', edge: 'boat.hull' } };
  const trailerSolid = boat.part(trailer);
  const hullSolid = boat.part(hull);
  boat.side(trailerSolid, trailer, 0, -0.75, 0.15, 0, 0.5, 'tyre', 0.035);
  boat.side(hullSolid, hull, 0, -2.3, 2.3, 1.22, 1.36, 'boat.stripe', 0.02);
  boat.end(hullSolid, hull, 1, -0.5, 0.5, 1.22, 1.36, 'boat.stripe', 0.02);
  south.paint('table', () => south.box(-11, 0, 44.5, -9, 0.75, 45.5, 'wood'));
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
      b.turned([(ax + bx) / 2, 0.5, (az + bz) / 2], [len - 0.14, 1.0, 0.08], yaw, 'wood', { side: 'fence', top: 'trim' });
    }
    for (const [x, z] of inner) b.add([x - 0.07, 0, z - 0.07], [x + 0.07, 1.1, z + 0.07], 'wood', { look: 'trim' });
  }
}

/** Mannequin heads are props named like this, numbered from 0. */
export const MANNEQUIN_HEAD = 'mannequin-head-';

/** Outfits, shirt then trousers. */
const OUTFITS: readonly (readonly [string, string])[] = [
  ['outfit.blue', 'outfit.charcoal'],
  ['outfit.red', 'outfit.khaki'],
  ['outfit.green', 'outfit.charcoal'],
  ['outfit.mustard', 'outfit.khaki'],
];

/**
 * A shop-window mannequin standing at (x, z) on a floor at `floor`, facing
 * `yaw`: legs and a torso that collide, arms and a neck as trim, and a head
 * that is a prop (bullets pass through it and knock it off).
 */
function mannequin(b: Builder, x: number, z: number, floor: number, yaw: number, outfit: number, id: string): void {
  const f = new Frame(b, [x, z], yaw);
  const [shirt, trousers] = OUTFITS[outfit % OUTFITS.length]!;
  const legs: Part = { from: -0.17, to: 0.17, width: 0.22, height: 0.86, bottom: floor, material: 'plastic', look: trousers };
  const torso: Part = { from: -0.23, to: 0.23, width: 0.26, height: 0.56, bottom: floor + 0.86, material: 'plastic', look: shirt };
  const legsSolid = f.part(legs);
  const torsoSolid = f.part(torso);
  // A seam between the legs, front and back.
  f.side(legsSolid, legs, 0, -0.012, 0.012, floor, floor + 0.7, 'outfit.charcoal', 0.004);
  for (const end of [1, -1] as const) f.end(torsoSolid, torso, end, -0.06, 0.06, floor + 0.92, floor + 1.38, 'mannequin', 0.045);
  f.trim(torsoSolid, -0.05, 0.05, floor + 1.42 - SINK, floor + 1.46, -0.05, 0.05, 'mannequin');
  b.add([x - 0.105, floor + 1.45, z - 0.115], [x + 0.105, floor + 1.72, z + 0.115], 'plastic', { prop: id, look: 'mannequin' });
}

/**
 * The mannequins, after the original's: on both front lawns and in both back
 * yards, in the living rooms, kitchens and front bedrooms, and two out by the
 * vehicles. (x, distance from the street axis, floor, indoors).
 */
const HOUSE_MANNEQUINS: readonly (readonly [number, number, number, boolean])[] = [
  [-7, 10.2, 0, false],
  [6.6, 10, 0, false],
  [5.2, 19.4, 0, true],
  [2.2, 30.9, 0, true],
  [-1.3, 15, UPPER_FLOOR, true],
  [-19.5, 31, 0, false],
  [1.5, 36.6, 0, false],
];

function buildMannequins(b: Builder, sides: readonly Side[]): void {
  let n = 0;
  for (const side of sides) {
    for (const [x, d, floor, indoors] of HOUSE_MANNEQUINS) {
      const z = side.z(d);
      mannequin(b, x, z, floor, indoors ? side.towardStreet : faceCentre(x, z), n, `${MANNEQUIN_HEAD}${n}`);
      n++;
    }
  }
  for (const [x, z] of [
    [-1.5, -6],
    [8.6, 4.7],
  ] as const) {
    mannequin(b, x, z, 0, faceCentre(x, z), n, `${MANNEQUIN_HEAD}${n}`);
    n++;
  }
}

/**
 * The population sign at the town's entrance, facing down the street: a
 * board on two posts. Returns where its live display goes (the board's front
 * face).
 */
function buildSign(b: Builder): NonNullable<MapDefinition['populationSign']> {
  const [x0, x1] = [11.4, 14.6];
  const [y0, y1] = [1.15, 2.55];
  const [z0, z1] = [-7.27, -7.17];
  b.add([x0, y0, z0], [x1, y1, z1], 'wood', { look: { side: 'sign.board', edge: 'sign.post', top: 'sign.post', bottom: 'sign.post' } });
  for (const x of [x0 + 0.15, x1 - 0.3]) b.add([x, 0, z0 - 0.13], [x + 0.15, y1 + 0.1, z0], 'wood', { look: 'sign.post' });
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2, z1], yaw: 0, width: x1 - x0 - 0.2, height: y1 - y0 - 0.2 };
}

/** Four square legs `size` apart (centre to centre) and `thick` thick, from the ground to `top`, with braces every `brace` m. */
function legs(b: Builder, x: number, z: number, size: number, thick: number, top: number, brace: number): void {
  const h = size / 2;
  const t = thick / 2;
  b.paint('site.steel', () => {
    for (const [dx, dz] of [
      [-h, -h],
      [h, -h],
      [-h, h],
      [h, h],
    ] as const) {
      b.add([x + dx - t, 0, z + dz - t], [x + dx + t, top, z + dz + t], 'metal');
    }
    // Braces between the legs, all round.
    for (let y = brace; y < top - 0.5; y += brace) {
      b.add([x - h + t, y, z - h - 0.06], [x + h - t, y + 0.12, z - h + 0.06], 'metal');
      b.add([x - h + t, y, z + h - 0.06], [x + h - t, y + 0.12, z + h + 0.06], 'metal');
      b.add([x - h - 0.06, y, z - h + t], [x - h + 0.06, y + 0.12, z + h - t], 'metal');
      b.add([x + h - 0.06, y, z - h + t], [x + h + 0.06, y + 0.12, z + h - t], 'metal');
    }
  });
}

/**
 * The test site beyond the boundary: a water tower, two instrument towers,
 * bunkers, sheds and the power line down the street. Out of reach, but
 * solid, so shots that leave the town land on them like anything else.
 */
function buildScenery(b: Builder): void {
  // The town's water tower, west of the houses.
  legs(b, -46, 14, 4.4, 0.35, 14, 4.5);
  b.add([-49, 14, 11], [-43, 19, 17], 'sheetMetal', { look: { side: 'tank', top: 'site.red', bottom: 'site.paint' } });
  // Instrument towers out in the desert, a cabin on a platform.
  for (const [x, z] of [
    [-30, -68],
    [34, 44],
  ] as const) {
    legs(b, x, z, 3, 0.3, 18, 4.5);
    b.add([x - 2.2, 18, z - 2.2], [x + 2.2, 18.3, z + 2.2], 'metal', { look: 'site.paint' });
    b.add([x - 1.8, 18.3, z - 1.8], [x + 1.8, 20.9, z + 1.8], 'sheetMetal', { look: { side: 'site.paint', top: 'site.red' } });
  }
  // Concrete bunkers, low and long, and two sheds.
  b.paint({ side: 'bunker', top: 'bunker' }, () => {
    b.add([-49, 0, -40], [-39, 3, -33], 'concrete');
    b.add([36, 0, -38], [44, 2.5, -32], 'concrete');
  });
  b.paint({ side: 'site.paint', top: 'roof.flat' }, () => {
    b.add([54, 0, -24], [66, 5, -16], 'sheetMetal');
    b.add([-65, 0, -15], [-55, 4, -5], 'sheetMetal');
  });
  // The power line along the street's north side, east of the street end.
  b.paint('pole', () => {
    for (const x of [26, 40, 54, 68, 82]) {
      b.add([x - 0.15, 0, -7.65], [x + 0.15, 9, -7.35], 'wood');
      b.add([x - 0.08, 8.2, -8.7], [x + 0.08, 8.35, -6.3], 'wood');
    }
  });
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

/** The wind, birds on the poles and towers round the town, the population sign creaking and a radio in the north living room. */
function ambience(sign: NonNullable<MapDefinition['populationSign']>): MapDefinition['ambience'] {
  const perches: Vec3[] = [[26, 9, -7.5], [54, 9, -7.5], [82, 9, -7.5], [-46, 19.5, 14], [-30, 21, -68], [34, 21, 44]];
  return [{ kind: 'wind' }, ...perches.map((position) => ({ kind: 'birds' as const, position })), { kind: 'sign', position: sign.center }, { kind: 'radio', position: [5, 1, -26] }];
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
  buildMannequins(b, sides);
  const populationSign = buildSign(b);
  buildScenery(b);
  buildBoundary(b);
  const spawns = spawnSets();
  const dummies: PlayerSpawn[] = [];
  return {
    id: 'survival-town',
    name: 'Survival Town',
    solids: b.solids,
    hiddenSolids: b.hidden,
    finishes: FINISHES,
    looks: b.looks,
    decorations: b.decorations,
    ramps: [],
    labels: [],
    populationSign,
    horizon: { ground: 'desert', inner: { x0: -90, x1: 90, z0: -90, z1: 90 }, light: [-80, -80] },
    // Out on the test range east-north-east of town, in full view over the rooftops; the siren is on the water tower.
    nuke: { groundZero: [420, 0, -160], siren: [-46, 19.5, 14] },
    ambience: ambience(populationSign),
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
