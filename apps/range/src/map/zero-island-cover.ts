import type { Material, Terrain } from '@duty-shooter/fps-core';
import { BRIDGES, CORES, REGION_IDS, regionAt, type RegionId, type RoutePoint } from './zero-island-terrain';

/**
 * Zero Island's hard cover: a deterministic generator that places simple grey
 * solids over the whole island, in each Region's own character, and then fills
 * any gap so nowhere a player stands is far from something to get behind. The
 * ground's folds do the rest (`foldGround`). Ticket 29 dresses what's placed
 * here, so every piece says what it stands for.
 *
 * Only exact arithmetic reaches a position or a size, so a client and its server
 * place the same solids, and the build's nav matches them.
 */

export type CoverKind = 'rock' | 'trunk' | 'wall' | 'wreck' | 'crate' | 'shed' | 'pylon' | 'barrier' | 'container' | 'wagon' | 'block';

/** One grey solid. */
export interface CoverPiece {
  readonly kind: CoverKind;
  readonly region: RegionId | 'sea';
  readonly x: number;
  readonly z: number;
  /** Along its yaw. */
  readonly width: number;
  readonly depth: number;
  /** How far its top stands above the highest ground under it. */
  readonly height: number;
  readonly yaw: number;
  readonly material: Material;
  /** It stands on this height, a bridge's deck, instead of the ground. */
  readonly deck?: number;
}

/** What the generator has to keep clear of. */
export interface CoverGround {
  readonly terrain: Terrain;
  readonly inside: (x: number, z: number) => boolean;
  /** Lines nothing stands on: each with the half width kept open. */
  readonly routes: readonly { readonly line: readonly RoutePoint[]; readonly half: number }[];
  /** The railway, which gets parked wagons but stays a lane between them. */
  readonly railway: readonly (readonly RoutePoint[])[];
  /** The roads, whose edges get wrecks. */
  readonly roads: readonly (readonly RoutePoint[])[];
  /** Places left free, such as spawns, each with its radius. */
  readonly spots: readonly (readonly [x: number, z: number, radius: number])[];
  /** Footprints already built on, as boxes (x0, z0, x1, z1). */
  readonly built: readonly (readonly [x0: number, z0: number, x1: number, z1: number])[];
  /** The runway's middle line, with its half width: cover stands on it. */
  readonly runway: readonly [from: readonly [number, number], to: readonly [number, number], half: number];
}

type Random = () => number;
/** A piece as a template lays it out: offset from its site, and what it is. */
type Part = readonly [kind: CoverKind, dx: number, dz: number, width: number, depth: number, height: number, yaw: number];
type Template = (r: Random) => Part[];

const pi = 3.141592653589793;
/** Turns come from a short table, so a rock's yaw is the same number everywhere. */
const TURNS = [0, pi / 8, pi / 4, (3 * pi) / 8, pi / 2, (5 * pi) / 8, (3 * pi) / 4, (7 * pi) / 8] as const;
/** The first four turns' cos and sin, as numbers, so an offset along a wall is the same everywhere too. */
const TURN_COS = [1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898] as const;
const TURN_SIN = [0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867] as const;

function seeded(i: number, j: number, salt: number): Random {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(salt, 83492791)) | 0;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: Random, a: number, b: number) => a + (b - a) * r();
const turn = (r: Random) => TURNS[Math.floor(r() * TURNS.length)]!;

/** A heap of rocks, overlapping so nothing slips between them. */
const rocks = (count: number, size: number, tall: number): Template => (r) => {
  const parts: Part[] = [];
  let [x, z] = [0, 0];
  for (let i = 0; i < count; i++) {
    parts.push(['rock', x, z, between(r, 0.7, 1.2) * size, between(r, 0.6, 1) * size, between(r, 0.65, 1.15) * tall, turn(r)]);
    x += between(r, -0.55, 0.55) * size;
    z += between(r, -0.55, 0.55) * size;
  }
  return parts;
};
const grove = (count: number, spread: number, wide: number, tall: number): Template => (r) =>
  Array.from({ length: count }, (): Part => ['trunk', between(r, -spread, spread), between(r, -spread, spread), wide, wide, between(r, 0.8, 1.2) * tall, turn(r)]);
const single = (kind: CoverKind, width: number, depth: number, tall: number): Template => (r) => [[kind, 0, 0, between(r, 0.85, 1.15) * width, between(r, 0.85, 1.15) * depth, between(r, 0.9, 1.15) * tall, turn(r)]];
/** A wall with a return at one end, to stand in the corner of. */
const corner = (kind: CoverKind, length: number, thick: number, tall: number): Template => (r) => {
  const k = Math.floor(r() * 4);
  const yaw = TURNS[k]!;
  const flip = r() < 0.5 ? 1 : -1;
  const l = between(r, 0.85, 1.2) * length;
  const [c, s] = [TURN_COS[k]!, TURN_SIN[k]!];
  const [ex, ez] = [(c * l) / 2 + (s * flip * l) / 4, (-s * l) / 2 + (c * flip * l) / 4];
  return [
    [kind, 0, 0, l, thick, tall, yaw],
    [kind, ex, ez, l / 2, thick, tall, (yaw + pi / 2)],
  ];
};
/** Containers side by side and stacked, with a lane between rows. */
const stacks: Template = (r) => {
  const yaw = TURNS[Math.floor(r() * 2) * 4]!;
  const across = yaw === 0 ? [0, 1] : [1, 0];
  const out: Part[] = [];
  const rows = 2 + Math.floor(r() * 2);
  for (let i = 0; i < rows; i++) out.push(['container', across[0]! * (i - (rows - 1) / 2) * 5.5, across[1]! * (i - (rows - 1) / 2) * 5.5, 12, 2.5, r() < 0.55 ? 5.2 : 2.6, yaw]);
  return out;
};
const shed: Template = single('shed', 8, 6, 3.4);
const wreck: Template = single('wreck', 4.4, 2, 1.6);
const crates: Template = (r) => {
  const tall = r() < 0.5 ? 1.3 : 2.2;
  return [
    ['crate', 0, 0, 2.2, 2.2, tall, turn(r)],
    ['crate', between(r, 1, 2), between(r, -1.6, 1.6), 1.8, 1.8, 1.25, turn(r)],
  ];
};
const pylon: Template = () => [
  ['pylon', 0, 0, 3.4, 3.4, 1.3, 0],
  ['pylon', 0, 0, 1, 1, 15, 0],
];

interface Mix {
  /** Metres between sites. */
  readonly spacing: number;
  readonly table: readonly (readonly [weight: number, make: Template])[];
}

/** What stands on the plain of each Region. */
const CHARACTER: Readonly<Record<RegionId, Mix>> = {
  // Scrub and pylons: the plain, with rubble once the blast reached it.
  'ground-zero': { spacing: 26, table: [[34, rocks(3, 5, 2.8)], [20, corner('wall', 10, 0.9, 2.4)], [12, pylon], [12, shed], [12, single('rock', 12, 3, 2.4)], [10, wreck]] },
  // Canyons and boulders, the mine's sheds and dry-stone walls, burnt-out pickups on the tracks (ticket 18: dense enough to cross under cover).
  'the-dustlands': { spacing: 24, table: [[42, rocks(3, 5.6, 3.4)], [18, single('rock', 3.4, 3.4, 7)], [14, single('rock', 15, 3, 3.2)], [8, corner('wall', 8, 1, 1.5)], [8, shed], [10, wreck]] },
  // Rock outcrops and pines.
  'frostbite-peaks': { spacing: 26, table: [[42, rocks(3, 5.4, 3.2)], [28, grove(4, 6, 0.9, 10)], [18, corner('rock', 12, 1.4, 3)], [12, shed]] },
  // Forest.
  'mutant-jungle': { spacing: 22, table: [[62, grove(4, 7, 1.8, 13)], [22, rocks(3, 5, 2.8)], [16, corner('wall', 9, 1.2, 3)]] },
  // Walls, cars and low blocks on the approaches, close-set: a car's model sits lower than a box would (ticket 20).
  'neon-city': { spacing: 23, table: [[34, corner('wall', 11, 0.7, 2.6)], [30, single('block', 11, 10, 7)], [16, wreck], [20, crates]] },
  // Container yards, sheds and walls.
  'rogue-harbor': { spacing: 25, table: [[44, stacks], [18, shed], [20, corner('wall', 11, 0.8, 2.6)], [18, crates]] },
};

/** The crater's floor and slopes: blast walls, slabs and bunkers, taller than the plain's, since a bowl looks across itself. */
const CRATER: Mix = { spacing: 20, table: [[40, rocks(3, 6, 4.2)], [30, corner('wall', 12, 1.2, 3.6)], [20, single('block', 9, 6, 4.2)], [10, single('rock', 16, 3, 3.6)]] };
/** How far the crater reaches from its middle. */
const CRATER_REACH = 128;

/** What a Region's gaps get: small, and quick to find. */
const FILLERS: Readonly<Record<RegionId, Template>> = {
  'ground-zero': rocks(2, 3.2, 2.2),
  'the-dustlands': rocks(2, 3.4, 2.4),
  'frostbite-peaks': rocks(2, 3.2, 2.3),
  'mutant-jungle': grove(2, 2.2, 1.6, 12),
  'neon-city': wreck,
  'rogue-harbor': crates,
};
const REEF: Template = single('rock', 6.5, 5, 4.6);

/** Metres a side of the cells of the plan. */
const PLAN = 2;
/** Clear ground left round everything placed, so a way past is always there. */
const GAP = 3;
/** Where the gaps get filled: farther than this from anything to get behind. */
const FILL_REACH = 12.5;
/** The same out in the shallows, which nobody has to cross. */
const FILL_REACH_SEA = 13.5;
/** Metres between the points checked for a gap. */
const FILL_STEP = 5;
/** Cover has to top this much over the ground it shelters (m). */
const CHEST = 1.1;
/** Ground this high or lower is sea, as bots see it. */
const SHORE = 0.4;

/** The ways looked along for a place near a gap. */
const AROUND: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]];

const CLEAR = 0;
const KEEP = 1;

/** A raster of the island: what's kept open, and what's been built on. */
class Plan {
  readonly #width: number;
  readonly #height: number;
  readonly #x0: number;
  readonly #z0: number;
  readonly #cells: Uint8Array;

  constructor(x0: number, z0: number, x1: number, z1: number) {
    this.#x0 = x0;
    this.#z0 = z0;
    this.#width = Math.ceil((x1 - x0) / PLAN) + 1;
    this.#height = Math.ceil((z1 - z0) / PLAN) + 1;
    this.#cells = new Uint8Array(this.#width * this.#height);
  }

  /** Runs over the cells of a disc, until `visit` says stop. */
  #disc(x: number, z: number, radius: number, visit: (cell: number) => boolean): boolean {
    const i0 = Math.max(0, Math.floor((x - radius - this.#x0) / PLAN));
    const i1 = Math.min(this.#width - 1, Math.ceil((x + radius - this.#x0) / PLAN));
    const j0 = Math.max(0, Math.floor((z - radius - this.#z0) / PLAN));
    const j1 = Math.min(this.#height - 1, Math.ceil((z + radius - this.#z0) / PLAN));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = this.#x0 + i * PLAN - x;
        const dz = this.#z0 + j * PLAN - z;
        if (dx * dx + dz * dz <= radius * radius && visit(j * this.#width + i)) return true;
      }
    }
    return false;
  }

  keep(x: number, z: number, radius: number): void {
    this.#disc(x, z, radius, (c) => {
      this.#cells[c] = KEEP;
      return false;
    });
  }

  free(x: number, z: number, radius: number): boolean {
    return !this.#disc(x, z, radius, (c) => this.#cells[c] !== CLEAR);
  }
}

/** Finds what's near a point among everything placed. */
class Placed {
  static readonly #SIZE = 16;
  readonly #cells = new Map<number, { x: number; z: number; radius: number; low: number; top: number }[]>();

  #key(i: number, j: number): number {
    return (i + 4096) * 8192 + j + 4096;
  }

  add(x: number, z: number, radius: number, low: number, top: number): void {
    const key = this.#key(Math.floor(x / Placed.#SIZE), Math.floor(z / Placed.#SIZE));
    const list = this.#cells.get(key);
    if (list) list.push({ x, z, radius, low, top });
    else this.#cells.set(key, [{ x, z, radius, low, top }]);
  }

  /** True when something standing across the height `at` lies within `reach` of (x, z), measured to its edge. */
  near(x: number, z: number, reach: number, at: number): boolean {
    const span = Math.ceil((reach + 8) / Placed.#SIZE);
    const [ci, cj] = [Math.floor(x / Placed.#SIZE), Math.floor(z / Placed.#SIZE)];
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        for (const p of this.#cells.get(this.#key(i, j)) ?? []) {
          const dx = p.x - x;
          const dz = p.z - z;
          if (p.low <= at && p.top >= at && Math.sqrt(dx * dx + dz * dz) - p.radius <= reach) return true;
        }
      }
    }
    return false;
  }
}

function materialOf(kind: CoverKind): Material {
  return kind === 'wreck' || kind === 'container' || kind === 'wagon' ? 'metal' : 'concrete';
}

/** How far a part reaches from its site. */
function reachOf(parts: readonly Part[]): number {
  let reach = 0;
  for (const [, dx, dz, width, depth] of parts) reach = Math.max(reach, Math.sqrt(dx * dx + dz * dz) + Math.sqrt(width * width + depth * depth) / 2);
  return reach;
}

/** True when ground a player could stand on lies at (x, z), inside the Boundary. */
function dryAt(ground: CoverGround, x: number, z: number): boolean {
  const y = ground.terrain.heightAt(x, z);
  return y > SHORE && !ground.terrain.steepAt(x, z) && ground.inside(x, z);
}

/** Twelve bearings round a point. */
const CLOCK: readonly (readonly [number, number])[] = [[1, 0], [0.866, 0.5], [0.5, 0.866], [0, 1], [-0.5, 0.866], [-0.866, 0.5], [-1, 0], [-0.866, -0.5], [-0.5, -0.866], [0, -1], [0.5, -0.866], [0.866, -0.5]];

/** True when a crest of the ground that would hide a crouched body lies within `reach`, as the sightline test measures it. */
function crestNear(terrain: Terrain, x: number, z: number, reach: number): boolean {
  const y = terrain.heightAt(x, z);
  for (const [c, s] of CLOCK) {
    for (let r = 3; r <= reach; r += 2) {
      const peak = terrain.heightAt(x + c * r, z + s * r);
      if (peak - y < 0.5) continue;
      if (peak - Math.max(terrain.heightAt(x + c * (r - 6), z + s * (r - 6)), terrain.heightAt(x + c * (r + 6), z + s * (r + 6))) >= 1.3) return true;
    }
  }
  return false;
}

/** Lays the island's cover out. Most of the second or so the map takes to build, on client and server alike. */
export function placeCover(ground: CoverGround): CoverPiece[] {
  const { terrain } = ground;
  const [x0, z0, x1, z1] = [-720, -680, 720, 660];
  const plan = new Plan(x0, z0, x1, z1);
  const placed = new Placed();
  const out: CoverPiece[] = [];

  for (const { line, half } of ground.routes) for (const p of line) plan.keep(p.x, p.z, half + 1);
  for (const bridge of BRIDGES) {
    const [ax, az] = bridge.from;
    const [bx, bz] = bridge.to;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let i = 0; i <= n; i++) plan.keep(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, bridge.width / 2 + 3);
  }
  for (const [x, z, radius] of ground.spots) plan.keep(x, z, radius);
  for (const [a, b, c, d] of ground.built) {
    for (let z = b; z <= d + PLAN; z += PLAN) for (let x = a; x <= c + PLAN; x += PLAN) plan.keep(Math.min(x, c), Math.min(z, d), GAP);
  }

  const add = (kind: CoverKind, region: CoverPiece['region'], x: number, z: number, width: number, depth: number, height: number, yaw: number, deck?: number) => {
    out.push({ kind, region, x, z, width, depth, height, yaw, material: materialOf(kind), ...(deck === undefined ? {} : { deck }) });
    const low = deck ?? terrain.heightAt(x, z);
    placed.add(x, z, Math.min(width, depth) / 2, low, low + height);
  };
  /** Puts a template down at (x, z) if it fits, each part tall enough to reach `upTo`: a bank's edge is only sheltered by something rising past it. */
  const site = (region: CoverPiece['region'], template: Template, x: number, z: number, r: Random, gap = GAP, upTo = 0): boolean => {
    const parts = template(r);
    const reach = reachOf(parts);
    if (!plan.free(x, z, reach + gap)) return false;
    plan.keep(x, z, reach);
    for (const [kind, dx, dz, width, depth, height, yaw] of parts) {
      const [px, pz] = [x + dx, z + dz];
      add(kind, region, px, pz, width, depth, Math.max(height, upTo - terrain.heightAt(px, pz)), yaw);
    }
    return true;
  };

  // Parked wagons on the rails, in rakes with long clear stretches: those stretches are the island's narrow lanes.
  ground.railway.forEach((line, n) => {
    for (let at = 40 + 37 * n; at + 40 < line.length; at += 46) {
      for (const k of [0, 4]) {
        const [p, q] = [line[at + k]!, line[at + k + 2]!];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const l = Math.sqrt(dx * dx + dz * dz);
        if (terrain.heightAt(p.x, p.z) < SHORE) continue;
        out.push({ kind: 'wagon', region: regionAt(p.x, p.z), x: p.x, z: p.z, width: 13, depth: 2.9, height: 3.2, yaw: Math.atan2(-dz / l, dx / l), material: 'metal' });
        placed.add(p.x, p.z, 1.45, p.y, p.y + 3.2);
      }
    }
  });

  // Wrecks on the road's edge, either side by turns, so a road is a way through and not a lane.
  ground.roads.forEach((line, n) => {
    let side = 1;
    for (let at = 6 + n; at + 3 < line.length; at += 9) {
      const [p, q] = [line[at]!, line[at + 1]!];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l === 0) continue;
      const [nx, nz] = [-dz / l, dx / l];
      side = -side;
      const [x, z] = [p.x + nx * side * 2.6, p.z + nz * side * 2.6];
      if (terrain.heightAt(x, z) < SHORE) continue;
      add('wreck', regionAt(x, z), x, z, 4.3, 1.9, 1.5, Math.atan2(-dz / l, dx / l));
    }
  });

  // Barriers along a bridge's edges, by turns, with the middle clear.
  for (const bridge of BRIDGES) {
    const [ax, az] = bridge.from;
    const [bx, bz] = bridge.to;
    const length = Math.hypot(bx - ax, bz - az);
    const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
    const yaw = Math.atan2(-uz, ux);
    let side = 1;
    for (let along = 8; along < length - 4; along += 11) {
      side = -side;
      const off = side * (bridge.width / 2 - 0.5);
      add('barrier', 'sea', ax + ux * along - uz * off, az + uz * along + ux * off, 3, 0.6, 1.2, yaw, bridge.deck);
    }
  }

  // The runway: revetments down both sides, and wrecks on the strip itself.
  {
    const [[ax, az], [bx, bz], half] = ground.runway;
    const length = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
    const yaw = Math.atan2(-uz, ux);
    const r = seeded(9, 9, 91);
    for (let along = 8, i = 0; along < length; along += 15, i++) {
      for (const side of [-1, 1]) {
        const off = side * (half + 2);
        add('wall', 'rogue-harbor', ax + ux * along - uz * off, az + uz * along + ux * off, 10, 1.2, 2.8, yaw);
      }
      const off = between(r, -0.8, 0.8) * half;
      const [x, z] = [ax + ux * (along + 7) - uz * off, az + uz * (along + 7) + ux * off];
      add(i % 3 === 0 ? 'shed' : i % 3 === 1 ? 'wreck' : 'container', 'rogue-harbor', x, z, i % 3 === 1 ? 6 : 9, 3, 2.6, turn(r));
    }
  }

  // Each Region's own sites, on a jittered lattice: every other row shifted, so streets of them don't line up.
  const inCrater = (x: number, z: number) => Math.hypot(x - CORES['ground-zero'].x, z - CORES['ground-zero'].z) < CRATER_REACH;
  const lots: readonly (readonly [RegionId, Mix, (x: number, z: number) => boolean])[] = [
    ['ground-zero', CRATER, inCrater],
    ...REGION_IDS.map((id) => [id, CHARACTER[id], (x: number, z: number) => !inCrater(x, z) && regionAt(x, z) === id] as const),
  ];
  for (const [id, { spacing, table }, here] of lots) {
    const total = table.reduce((sum, [w]) => sum + w, 0);
    for (let j = Math.floor(z0 / spacing); j * spacing < z1; j++) {
      for (let i = Math.floor(x0 / spacing); i * spacing < x1; i++) {
        const r = seeded(i, j, REGION_IDS.indexOf(id) + spacing);
        const x = (i + 0.5 * (j & 1)) * spacing + between(r, -0.42, 0.42) * spacing;
        const z = j * spacing + between(r, -0.42, 0.42) * spacing;
        if (!here(x, z) || !dryAt(ground, x, z)) continue;
        let pick = r() * total;
        let make = table[0]![1];
        for (const [weight, template] of table) {
          pick -= weight;
          if (pick < 0) {
            make = template;
            break;
          }
        }
        // A site that doesn't fit where it fell tries a small one instead.
        site(id, make, x, z, r) || site(id, FILLERS[id], x, z, r);
      }
    }
  }

  // Any standing place still far from everything gets something of its own, near it.
  for (let z = z0; z <= z1; z += FILL_STEP) {
    for (let x = x0; x <= x1; x += FILL_STEP) {
      if (!ground.inside(x, z) || AROUND.every(([u, v]) => terrain.steepAt(x + u * 2.5, z + v * 2.5))) continue;
      const y = terrain.heightAt(x, z);
      const wet = y <= SHORE;
      if (placed.near(x, z, wet ? FILL_REACH_SEA : FILL_REACH, y + CHEST) || crestNear(terrain, x, z, FILL_REACH)) continue;
      const region = wet ? 'sea' : regionAt(x, z);
      const make = wet ? REEF : FILLERS[region as RegionId];
      const r = seeded(x, z, 77);
      search: for (let far = 0; far <= 10; far += 2) {
        for (const [u, v] of AROUND) if (site(region, make, x + u * far, z + v * far, r, 1.5, y + CHEST + 0.3)) break search;
      }
    }
  }
  return out;
}
