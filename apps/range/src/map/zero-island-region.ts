import type { Material } from '@duty-shooter/fps-core';

/**
 * How a Region of Zero Island is built (ticket 17, the first of six passes),
 * so every Region pass follows the same few steps:
 *
 * 1. A plan (`zero-island-<region>-plan.ts`, data only, importing only this): the
 *    Region's pads, where the ground is levelled for what's built on it, and
 *    its built pieces, each a list of tagged boxes in the piece's own frame.
 *    The boxes are the envelope its look is built in. Their part tag says
 *    what the box is (a bunker's wall, a pipe, a broken wall's top), and
 *    nothing else.
 * 2. A Blender generator (`tools/map/regions/<region>.py`) reads the plan's
 *    boxes from `tools/map/regions/<region>.json` (written by its test from
 *    the plan) and builds each piece's look part by part inside its boxes,
 *    within 5 cm of them, so nothing is drawn past what can stop a bullet. It also
 *    builds the Region's kit for the cover pass's pieces (walls, sheds,
 *    wrecks...), as unit boxes scaled to each piece.
 * 3. `node tools/map/fit-solids.mjs` (ticket 63) fits the solids to the GLB:
 *    a plan box its model fills to within 5 cm stays; one it doesn't (a
 *    ruin's broken top, a round pipe, rubble) becomes the few boxes that fit
 *    inside the model there, and each kit model gets the boxes that fit
 *    inside it, as the rocks do. Those boxes (`kit-solids.ts`) are the
 *    collision: they stop bodies, bullets, grenades and sight, and the nav is
 *    built from them. `kit-solids.test.ts` holds them inside the models.
 * 4. The map (`zero-island.ts`, through `zero-island-kit.ts`) stands the
 *    pieces on their pads and dresses the cover pass's pieces in the Region
 *    with its kit: both are drawn instanced with the plants (`PlantKind.url`,
 *    `built`), and their solids get no faces. The terrain levels the pads.
 */

/** A box of a built piece, in the piece's own frame: centre (y up from its pad), size along x, y, z, and a turn about +y. */
export interface PartBox {
  /** What the box is, for the look built inside it (see tools/map/regionkit.py). */
  readonly part: string;
  readonly c: readonly [x: number, y: number, z: number];
  readonly s: readonly [x: number, y: number, z: number];
  readonly yaw?: number;
  /** What a bullet meets: concrete unless said. */
  readonly material?: Material;
}

/** A built piece: one model of the Region's kit, and the boxes it is drawn in place of. */
export interface BuiltPiece {
  readonly boxes: readonly PartBox[];
  /** Metres from the camera within which the full model is drawn; past it, its cheaper one. */
  readonly near: number;
}

/** Ground brought level for building on: a rectangle (x, z, half sizes), eased back to the ground round it over `blend` metres. */
export interface Pad {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  /** The level, or null for the ground's own height at its middle. */
  readonly level: number | null;
  readonly blend: number;
  /** The ground layer it wears, if not the Region's own (`slab`: scorched concrete). */
  readonly surface?: 'slab';
}

/** Where a built piece stands: on the pad of its plan, at (x, z), turned `yaw`. */
export interface Placed {
  readonly asset: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Which pad it stands on: its level is the piece's floor. */
  readonly pad: number;
}

/**
 * How the Region's kit dresses one kind of the cover pass's pieces: `stretch`
 * scales a unit model to the whole solid, buried foot and all (walls, sheds,
 * slabs); `stand` keeps it its own height, standing on the ground under the
 * piece's middle (a car, a wagon), up to the solid's top.
 */
export interface KitDress {
  readonly asset: string;
  readonly fit: 'stretch' | 'stand';
  readonly near: number;
  readonly far: number;
}

/** A box turned about +y and moved: centre and corners in the world, for the map and the tests alike. */
export function placeBox(box: PartBox, x: number, y: number, z: number, yaw: number): { center: [number, number, number]; size: [number, number, number]; yaw: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const [bx, by, bz] = box.c;
  // +x looks along (cos yaw, 0, -sin yaw), as a placed model does.
  return { center: [x + bx * c + bz * s, y + by, z - bx * s + bz * c], size: [...box.s], yaw: yaw + (box.yaw ?? 0) };
}

/** An octagon (inradius `r`, from y0 to y1) as the four boxes whose corners are its corners. */
export function octagon(part: string, r: number, y0: number, y1: number, material?: Material): PartBox[] {
  const half = r * Math.tan(Math.PI / 8);
  return [0, 1, 2, 3].map((k) => ({ part, c: [0, (y0 + y1) / 2, 0], s: [2 * r, y1 - y0, 2 * half], yaw: (k * Math.PI) / 4, ...(material ? { material } : {}) }));
}

/** Where a straight wall's pieces go, x along it, z across, at the given turn: full-height spans with doors and windows cut out. */
export function wallBoxes(
  part: string,
  from: number,
  to: number,
  at: number,
  thick: number,
  y0: number,
  y1: number,
  openings: readonly { readonly from: number; readonly to: number; readonly bottom: number; readonly top: number }[] = [],
  along: 'x' | 'z' = 'x',
): PartBox[] {
  const out: PartBox[] = [];
  const box = (a: number, b: number, lo: number, hi: number) => {
    if (b - a < 1e-6 || hi - lo < 1e-6) return;
    const mid = (a + b) / 2;
    out.push(along === 'x' ? { part, c: [mid, (lo + hi) / 2, at], s: [b - a, hi - lo, thick] } : { part, c: [at, (lo + hi) / 2, mid], s: [thick, hi - lo, b - a] });
  };
  let cursor = from;
  for (const o of [...openings].sort((p, q) => p.from - q.from)) {
    box(cursor, o.from, y0, y1);
    box(o.from, o.to, y0, o.bottom);
    box(o.from, o.to, o.top, y1);
    cursor = o.to;
  }
  box(cursor, to, y0, y1);
  return out;
}
