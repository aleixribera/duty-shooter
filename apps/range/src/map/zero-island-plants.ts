import type { SoftCover, Terrain, TerrainData } from '@duty-shooter/fps-core';
import { type PlantKind, type Plants } from '@duty-shooter/fps-client/surfaces';
import { KIT_SOLIDS } from './kit-solids';
import type { CoverKind } from './zero-island-cover';
import { CRATER, regionAt, TERRAIN_LAYERS, type RegionId, type RoutePoint } from './zero-island-terrain';

/**
 * Zero Island's vegetation and rocks (ticket 29), from the kit in
 * tools/map/vegetation.py:
 *
 * - The cover pass's rocks and trunks (ticket 28) wear the kit's rocks and
 *   trees. Each model is picked first (`Dresser`), and the map makes the
 *   piece's solids the boxes fitted inside that model (`KIT_SOLIDS`, ticket
 *   63), so what's seen is what stops bullets, bodies and the bots' sight.
 * - Soft cover fills the ground between them: thickets, shrubs, ferns and tall
 *   grass by what each Region's ground is, in patches with clearings between.
 *   It hides a body from bots (`MapDefinition.soft`) and stops nothing.
 * - Low tufts over the grassy and dry ground, seen near, hide nothing.
 *
 * Paved ground (roads, the city, the docks, ballast) and ice stay bare, as do
 * the routes, spawns and runway the cover pass keeps open.
 */

/** A cover piece the kit dresses, as the map built its solid. */
export interface DressedPiece {
  readonly kind: CoverKind;
  readonly region: RegionId | 'sea';
  /** Its solids' indices in the map: one box, or the boxes fitted to the model it wears. */
  readonly solids: readonly number[];
  /** The kit model it wears and that model's turn, when the vegetation kit dresses it. */
  readonly dress: Dress | null;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly yaw: number;
  /** The solid's bottom (sunk under the ground) and top. */
  readonly bottom: number;
  readonly top: number;
  /** The ground it stands on, at its lowest. */
  readonly ground: number;
}

/** A kit model a cover piece wears: its x along the piece's width, turned by `yaw` (the piece's, or a half turn more; any for a trunk). */
export interface Dress {
  readonly asset: string;
  readonly yaw: number;
  /** How much wider and deeper than its piece the model stands, when it does: a boulder, rounded where the stone it replaced was square. */
  readonly across?: number;
}

/**
 * A granite boulder's rounded corners and drawn-in top leave about a tenth of
 * its piece's box empty that the square stone before it filled (ticket 78);
 * stood this much wider and deeper, it blocks the sightlines that stone did.
 */
const BOULDER_ACROSS = 1.08;

/**
 * Picks the model each rock and trunk of the cover pass wears, before the map
 * makes its solids from that model's fit. Called once a piece, in the cover
 * pass's order, on client and server alike: its own seeded numbers, so the
 * picks are the same on both.
 */
export class Dresser {
  readonly #r = random(63);

  dress(p: { readonly kind: CoverKind; readonly region: RegionId | 'sea'; readonly x: number; readonly z: number; readonly width: number; readonly depth: number; readonly yaw: number }): Dress | null {
    if (p.kind === 'rock') {
      const long = Math.max(p.width, p.depth) / Math.min(p.width, p.depth) > 2.2 || p.region === 'the-dustlands';
      // The crater's rocks are what the blast left of its concrete (ticket 78); elsewhere boulders, or ledges where long.
      const rubble = p.region === 'ground-zero' && Math.hypot(p.x - CRATER.x, p.z - CRATER.z) < CRATER.rim;
      const asset = long && !rubble ? 'rock-strata' : `${rubble ? 'rubble' : 'rock'}-${this.#r() < 0.5 ? 'a' : 'b'}`;
      // A half turn now and then hides that every rock is the same way up.
      const yaw = p.yaw + (this.#r() < 0.5 ? 0 : Math.PI);
      return asset.startsWith('rock-') && asset !== 'rock-strata' ? { asset, yaw, across: BOULDER_ACROSS } : { asset, yaw };
    }
    if (p.kind === 'trunk') return { asset: p.region === 'frostbite-peaks' ? 'pine-trunk' : 'broadleaf-trunk', yaw: this.#r() * Math.PI * 2 };
    return null;
  }
}

/**
 * The solids of a piece wearing `dress`, scaled to the piece as the model is:
 * the boxes fitted inside the model (`KIT_SOLIDS`), each as a centre, size and
 * turn; none when the model has no fit.
 */
export function fittedSolids(dress: Dress, x: number, bottom: number, z: number, width: number, height: number, depth: number): { center: [number, number, number]; size: [number, number, number]; yaw: number }[] {
  const c = Math.cos(dress.yaw);
  const s = Math.sin(dress.yaw);
  return (KIT_SOLIDS[dress.asset] ?? []).map((box) => {
    const [u, v, w] = [box.c[0] * width, box.c[1] * height, box.c[2] * depth];
    // Turned as the model is, about +y: its +x toward (cos, 0, -sin).
    return { center: [x + u * c + w * s, bottom + v, z - u * s + w * c], size: [box.s[0] * width, box.s[1] * height, box.s[2] * depth], yaw: dress.yaw };
  });
}

export interface PlantGround {
  readonly terrain: Terrain;
  /** The same ground as data: its palette says what grows where. */
  readonly data: TerrainData;
  readonly inside: (x: number, z: number) => boolean;
  readonly routes: readonly { readonly line: readonly RoutePoint[]; readonly half: number }[];
  readonly spots: readonly (readonly [x: number, z: number, radius: number])[];
  /** Footprints of every solid, as boxes (x0, z0, x1, z1). */
  readonly built: readonly (readonly [x0: number, z0: number, x1: number, z1: number])[];
  readonly runway: readonly [from: readonly [number, number], to: readonly [number, number], half: number];
}

/** The kit's soft plants: how far each reaches from its middle and how tall it stands (m, as built), from vegetation.py's `SOFT`. */
export const SOFT_PLANTS = {
  'bush-leafy': { reach: 0.97, top: 1.61 },
  'bush-dry': { reach: 0.84, top: 1.38 },
  juniper: { reach: 0.92, top: 1.53 },
  fern: { reach: 0.88, top: 1.15 },
  'grass-tall': { reach: 0.5, top: 1.19 },
  'grass-dry': { reach: 0.5, top: 1.1 },
} as const;
type SoftPlant = keyof typeof SOFT_PLANTS;

/** Metres of trunk a crown is built for (vegetation.py's `CROWN_FOR`), and the canopy it hides bots behind, as shares of that. */
const CROWNS = {
  'pine-crown': { built: 12, reach: 2.4, bottom: 0.3, top: 1.08 },
  'broadleaf-crown': { built: 13, reach: 3.8, bottom: 0.5, top: 1.02 },
} as const;

/** How each ground grows, by its photo layer: metres between candidate spots, the chance one grows, and what. */
const GROWTH: Readonly<Record<string, { spacing: number; chance: number; mix: readonly (readonly [SoftPlant, number])[]; tufts: 'tuft' | 'tuft-dry' | null }>> = {
  meadow: { spacing: 4, chance: 0.85, mix: [['bush-leafy', 35], ['grass-tall', 65]], tufts: 'tuft' },
  jungle: { spacing: 3.4, chance: 0.85, mix: [['fern', 45], ['bush-leafy', 40], ['grass-tall', 15]], tufts: 'tuft' },
  bed: { spacing: 4, chance: 0.7, mix: [['grass-tall', 80], ['bush-leafy', 20]], tufts: 'tuft' },
  dust: { spacing: 4.2, chance: 0.85, mix: [['bush-dry', 55], ['grass-dry', 45]], tufts: 'tuft-dry' },
  rock: { spacing: 5.5, chance: 0.6, mix: [['bush-dry', 70], ['grass-dry', 30]], tufts: 'tuft-dry' },
  ash: { spacing: 4, chance: 0.85, mix: [['grass-dry', 55], ['bush-dry', 45]], tufts: 'tuft-dry' },
  beach: { spacing: 7, chance: 0.4, mix: [['grass-dry', 100]], tufts: 'tuft-dry' },
  snow: { spacing: 4.2, chance: 0.8, mix: [['juniper', 100]], tufts: null },
};

/** Tufts: metres between them, and the chance of one. */
const TUFT_SPACING = 2.2;
const TUFT_CHANCE = 0.7;
/** Patches (m a cycle) and how hard they thin or thicken the growth: thickets and clearings, not an even lawn. */
const PATCH = 38;
const PATCH_STRENGTH = 1.1;
/** Ground this high or lower is sea. */
const SHORE = 0.5;
/** Clear ground left round solids, so a bush never pokes through a wall (m). */
const SOLID_GAP = 0.8;

/** Rock colours by Region: the Dustlands' red sandstone, the peaks' cold grey, the jungle's moss. */
const ROCK: Readonly<Record<RegionId | 'sea', number>> = {
  // Granite and concrete a little lighter than the old sandstone-photo rocks were (ticket 78): weathered granite is pale.
  'ground-zero': 0xaaa59a,
  'the-dustlands': 0xc08460,
  'frostbite-peaks': 0xa9adb3,
  'mutant-jungle': 0x8c9878,
  'neon-city': 0xa29f99,
  'rogue-harbor': 0x9e9a92,
  sea: 0x7c7a72,
};
/** Foliage tint by Region: lush in the jungle, sun-bleached on the plain. */
const LEAF: Readonly<Record<RegionId, number>> = {
  'ground-zero': 0xd6d2a4,
  'the-dustlands': 0xe6d2ae,
  'frostbite-peaks': 0xbcc8c4,
  'mutant-jungle': 0xb4d49c,
  'neon-city': 0xc8d0a8,
  'rogue-harbor': 0xc8cfac,
};

/** Dry scrub and straw: muted, so it reads as dead grass at dusk rather than gold. */
const DRY = 0xe2d8c2;

/** A small, fast, seeded random. */
function random(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise, 0 to 1, a cycle every `size` m. */
function patches(seed: number, size: number): (x: number, z: number) => number {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const fx = x / size;
    const fz = z / size;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * su;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

/** A colour scaled in brightness. */
function shade(color: number, k: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((color >> s) & 0xff) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** What's kept bare, rastered at `KEEP_CELL` m: routes, spots, the runway, and round every solid. */
const KEEP_CELL = 1;
class Keep {
  readonly #x0: number;
  readonly #z0: number;
  readonly #w: number;
  readonly #h: number;
  readonly #cells: Uint8Array;

  constructor(x0: number, z0: number, x1: number, z1: number) {
    this.#x0 = x0;
    this.#z0 = z0;
    this.#w = Math.ceil((x1 - x0) / KEEP_CELL);
    this.#h = Math.ceil((z1 - z0) / KEEP_CELL);
    this.#cells = new Uint8Array(this.#w * this.#h);
  }

  box(x0: number, z0: number, x1: number, z1: number): void {
    const i0 = Math.max(0, Math.floor((x0 - this.#x0) / KEEP_CELL));
    const i1 = Math.min(this.#w - 1, Math.floor((x1 - this.#x0) / KEEP_CELL));
    const j0 = Math.max(0, Math.floor((z0 - this.#z0) / KEEP_CELL));
    const j1 = Math.min(this.#h - 1, Math.floor((z1 - this.#z0) / KEEP_CELL));
    for (let j = j0; j <= j1; j++) this.#cells.fill(1, j * this.#w + i0, j * this.#w + i1 + 1);
  }

  /** A band `half` m either side of the segment from a to b. */
  band(ax: number, az: number, bx: number, bz: number, half: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / KEEP_CELL));
    for (let k = 0; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps;
      const z = az + ((bz - az) * k) / steps;
      this.disc(x, z, half);
    }
  }

  disc(x: number, z: number, radius: number): void {
    const i0 = Math.max(0, Math.floor((x - radius - this.#x0) / KEEP_CELL));
    const i1 = Math.min(this.#w - 1, Math.floor((x + radius - this.#x0) / KEEP_CELL));
    const j0 = Math.max(0, Math.floor((z - radius - this.#z0) / KEEP_CELL));
    const j1 = Math.min(this.#h - 1, Math.floor((z + radius - this.#z0) / KEEP_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = this.#x0 + (i + 0.5) * KEEP_CELL - x;
        const dz = this.#z0 + (j + 0.5) * KEEP_CELL - z;
        if (dx * dx + dz * dz <= radius * radius) this.#cells[j * this.#w + i] = 1;
      }
    }
  }

  /** True when nothing kept lies within `radius` of (x, z) (checked at its middle and four points round it). */
  free(x: number, z: number, radius: number): boolean {
    const at = (px: number, pz: number) => {
      const i = Math.floor((px - this.#x0) / KEEP_CELL);
      const j = Math.floor((pz - this.#z0) / KEEP_CELL);
      return i < 0 || j < 0 || i >= this.#w || j >= this.#h || this.#cells[j * this.#w + i] === 0;
    };
    return at(x, z) && at(x + radius, z) && at(x - radius, z) && at(x, z + radius) && at(x, z - radius);
  }
}

/** Gathers each kind's plants. */
class Kinds {
  readonly #lists = new Map<string, { kind: Omit<PlantKind, 'instances'>; values: number[] }>();

  add(kind: Omit<PlantKind, 'instances'>, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, color: number, snow: number): void {
    const key = `${kind.asset} ${kind.far} ${kind.layer ?? ''}`;
    let list = this.#lists.get(key);
    if (!list) this.#lists.set(key, (list = { kind, values: [] }));
    list.values.push(x, y, z, yaw, sx, sy, sz, color, snow);
  }

  done(): PlantKind[] {
    return [...this.#lists.values()].map(({ kind, values }) => ({ ...kind, instances: new Float32Array(values) }));
  }
}

/** Rocks under 6 m are left out past 400 m, as the surfaces' far blocks leave out their solids (ticket 10). */
const SMALL_ROCK = 6;
const FAR_SMALL = 400;
const FAR = 2000;
/** A trunk past this is under a pixel wide, and its crown stands over it. */
const FAR_TRUNK = 600;

const rockKind = (asset: string, small: boolean, layer: string): Omit<PlantKind, 'instances'> => ({ asset, lod: `${asset}-lod`, near: 50, far: small ? FAR_SMALL : FAR, thin: false, sway: 0, layer });

/**
 * The ground photo layer a rock wears (ticket 78), by the Region it stands in:
 * the Dustlands' rocks the old sandstone, rubble the concrete wall, the
 * jungle's rocks moss and lichen, and every other rock weathered granite.
 */
function rockLayer(asset: string, region: RegionId): string {
  if (asset.startsWith('rubble-')) return 'wall';
  if (region === 'the-dustlands') return 'rock';
  return region === 'mutant-jungle' ? 'moss' : 'boulder';
}
const KIND = {
  'pine-trunk': { asset: 'pine-trunk', lod: 'pine-trunk-lod', near: 35, far: FAR_TRUNK, thin: false, sway: 0 },
  'pine-crown': { asset: 'pine-crown', lod: 'pine-crown-lod', near: 45, far: FAR, thin: false, sway: 0.002 },
  'broadleaf-trunk': { asset: 'broadleaf-trunk', lod: 'broadleaf-trunk-lod', near: 35, far: FAR_TRUNK, thin: false, sway: 0 },
  'broadleaf-crown': { asset: 'broadleaf-crown', lod: 'broadleaf-crown-lod', near: 45, far: FAR, thin: false, sway: 0.002 },
  'bush-leafy': { asset: 'bush-leafy', lod: 'bush-leafy-lod', near: 22, far: 320, thin: false, sway: 0.03 },
  'bush-dry': { asset: 'bush-dry', lod: 'bush-dry-lod', near: 22, far: 320, thin: false, sway: 0.03 },
  juniper: { asset: 'juniper', lod: 'juniper-lod', near: 22, far: 320, thin: false, sway: 0.02 },
  fern: { asset: 'fern', lod: 'fern-lod', near: 20, far: 200, thin: true, sway: 0.05 },
  'grass-tall': { asset: 'grass-tall', lod: 'grass-tall-lod', near: 20, far: 220, thin: true, sway: 0.07 },
  'grass-dry': { asset: 'grass-dry', lod: 'grass-dry-lod', near: 20, far: 220, thin: true, sway: 0.07 },
  tuft: { asset: 'tuft', lod: null, near: 45, far: 45, thin: true, sway: 0.08 },
  'tuft-dry': { asset: 'tuft-dry', lod: null, near: 45, far: 45, thin: true, sway: 0.08 },
} as const satisfies Record<string, Omit<PlantKind, 'instances'>>;

export interface PlantLayout {
  readonly plants: Plants;
  readonly soft: SoftCover[];
}

/** Lays the island's plants out. */
export function placePlants(ground: PlantGround, dressed: readonly DressedPiece[]): PlantLayout {
  const { terrain } = ground;
  const kinds = new Kinds();
  const soft: SoftCover[] = [];
  const modelled: number[] = [];
  const r = random(29);

  // The cover pass's rocks and trunks.
  for (const p of dressed) {
    const snow = p.region === 'frostbite-peaks' ? 1 : 0;
    if (!p.dress) continue;
    const { asset, yaw } = p.dress;
    if (p.kind === 'rock') {
      const small = Math.max(p.width, p.depth, p.top - p.ground) < SMALL_ROCK;
      // Its finish and colour by the Region it stands in, which a piece of the sea's or a border's needn't be named for.
      const where = regionAt(p.x, p.z);
      kinds.add(rockKind(asset, small, rockLayer(asset, where)), p.x, p.bottom, p.z, yaw, p.width, p.top - p.bottom, p.depth, shade(ROCK[where], 0.88 + r() * 0.24), snow);
      modelled.push(...p.solids);
    } else if (p.kind === 'trunk') {
      const pine = asset === 'pine-trunk';
      const crown = pine ? 'pine-crown' : 'broadleaf-crown';
      const tall = p.top - p.ground;
      const s = tall / CROWNS[crown].built;
      kinds.add(KIND[asset as 'pine-trunk' | 'broadleaf-trunk'], p.x, p.bottom, p.z, yaw, p.width, p.top - p.bottom, p.depth, shade(0xffffff, 0.85 + r() * 0.2), 0);
      const leaf = p.region === 'sea' ? 0xffffff : LEAF[p.region];
      kinds.add(KIND[crown], p.x, p.ground, p.z, yaw, s, s, s, shade(leaf, 0.85 + r() * 0.25), snow * 0.8);
      const c = CROWNS[crown];
      soft.push({ x: p.x, z: p.z, radius: c.reach * s, bottom: p.ground + c.bottom * c.built * s, top: p.ground + c.top * c.built * s });
      modelled.push(...p.solids);
    }
  }

  // What stays bare.
  const [x0, z0, x1, z1] = [-720, -680, 720, 660];
  const keep = new Keep(x0, z0, x1, z1);
  for (const { line, half } of ground.routes) {
    for (let i = 1; i < line.length; i++) keep.band(line[i - 1]!.x, line[i - 1]!.z, line[i]!.x, line[i]!.z, half);
  }
  for (const [x, z, radius] of ground.spots) keep.disc(x, z, radius + 1);
  const [[ax, az], [bx, bz], half] = ground.runway;
  keep.band(ax, az, bx, bz, half);
  for (const [bx0, bz0, bx1, bz1] of ground.built) keep.box(bx0 - SOLID_GAP, bz0 - SOLID_GAP, bx1 + SOLID_GAP, bz1 + SOLID_GAP);

  const { data } = ground;
  const layerAt = (x: number, z: number): string | null => {
    const i = Math.floor((x - data.origin[0]) / data.cell);
    const j = Math.floor((z - data.origin[1]) / data.cell);
    if (i < 0 || j < 0 || i >= data.columns || j >= data.rows || !data.materials) return null;
    return TERRAIN_LAYERS[data.materials[j * data.columns + i]!] ?? null;
  };
  const growsAt = (x: number, z: number, reach: number): number | null => {
    const y = terrain.heightAt(x, z);
    if (y <= SHORE || terrain.steepAt(x, z) || !ground.inside(x, z) || !keep.free(x, z, reach)) return null;
    return y;
  };
  const patch = patches(2929, PATCH);

  // Soft cover, a jittered grid per ground.
  const step = 3;
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      // Each spot takes its ground's spacing by skipping candidates: a coarse ground uses fewer of them.
      const px = x + (r() - 0.5) * step;
      const pz = z + (r() - 0.5) * step;
      const layer = layerAt(px, pz);
      const growth = layer ? GROWTH[layer] : undefined;
      if (!growth) continue;
      const thick = Math.max(0, 1 + (patch(px, pz) - 0.5) * 2 * PATCH_STRENGTH);
      const chance = growth.chance * thick * (step / growth.spacing) ** 2;
      if (r() >= chance) continue;
      let pick = r() * growth.mix.reduce((sum, [, w]) => sum + w, 0);
      let plant: SoftPlant = growth.mix[0]![0];
      for (const [name, w] of growth.mix) {
        pick -= w;
        if (pick < 0) {
          plant = name;
          break;
        }
      }
      const size = 0.8 + r() * 0.45;
      const reach = SOFT_PLANTS[plant].reach * size;
      const y = growsAt(px, pz, reach);
      if (y === null) continue;
      const region = regionAt(px, pz);
      const snow = layer === 'snow' ? 0.7 : 0;
      const tint = plant === 'bush-dry' || plant === 'grass-dry' ? DRY : LEAF[region];
      kinds.add(KIND[plant], px, y - 0.08, pz, r() * Math.PI * 2, size, size * (0.85 + r() * 0.3), size, shade(tint, 0.82 + r() * 0.3), snow);
      soft.push({ x: px, z: pz, radius: reach, bottom: y - 0.2, top: y + SOFT_PLANTS[plant].top * size });
    }
  }

  // Tufts: near only, hiding nothing.
  for (let z = z0; z < z1; z += TUFT_SPACING) {
    for (let x = x0; x < x1; x += TUFT_SPACING) {
      const px = x + (r() - 0.5) * TUFT_SPACING;
      const pz = z + (r() - 0.5) * TUFT_SPACING;
      const layer = layerAt(px, pz);
      const tuft = layer ? GROWTH[layer]?.tufts : null;
      if (!tuft || r() >= TUFT_CHANCE) continue;
      const y = growsAt(px, pz, 0.3);
      if (y === null) continue;
      const size = 0.8 + r() * 0.7;
      const tint = tuft === 'tuft' ? LEAF[regionAt(px, pz)] : DRY;
      kinds.add(KIND[tuft], px, y - 0.03, pz, r() * Math.PI * 2, size, size, size, shade(tint, 0.8 + r() * 0.3), 0);
    }
  }

  return { plants: { url: 'models/vegetation.glb', atlas: 'textures/foliage.webp', kinds: kinds.done(), modelled }, soft };
}

