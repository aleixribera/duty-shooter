import type { NavGraph } from '../bots/nav';
import { navAreas } from '../bots/nav-areas';
import { STATS } from '../stats';
import type { World } from '../world';
import type { SpawnPoint } from './game-mode';

/** Metres a side of the cells that find the spots near a point. */
const CELL = 16;
/** How far (m) a spot may lie from the lattice point that asked for it. */
const SNAP = 4;
/** Feet this close (m) to the terrain stand on it, not on a bridge or a roof. */
const ON_THE_GROUND = 0.5;
/** A lattice with too few places for every Squad closes up by this much and tries again. */
const CLOSER = 0.96;
/** Turns and shifts of the lattice tried at a spacing before it closes up. */
const TRIES = 6;

/** A built-up place a map names (Zero Island's Cores): a Battle Royale's Ring, starts, crates and bots lean to them, so its fights are among buildings. */
export interface Town {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Where a large match can put people: every spot a bot's nav stands on open
 * land, so a spawn is walkable and has a way to everywhere else. Bridges, roofs,
 * interiors, water and the ways out of it are left out. Found once per map, in cells.
 */
export class PlayGround {
  /** x, y, z per spot. */
  readonly #spots: Float32Array;
  /** Each spot's nav area (see navAreas), or null on ground with no nav. */
  readonly #areas: Int32Array | null;
  readonly #cells = new Map<number, number[]>();
  /** The middle of the land, and how far from there its farthest spot lies. */
  readonly centre: readonly [x: number, z: number];
  readonly radius: number;
  /** The map's towns: none on most maps. */
  readonly towns: readonly Town[];

  constructor(spots: Float32Array, areas: Int32Array | null = null, towns: readonly Town[] = []) {
    if (spots.length === 0) throw new Error('No ground to play on');
    this.#spots = spots;
    this.#areas = areas;
    this.towns = towns;
    let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < this.count; i++) {
      const [x, z] = [spots[i * 3]!, spots[i * 3 + 2]!];
      [minX, maxX, minZ, maxZ] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minZ, z), Math.max(maxZ, z)];
      const cell = this.#cell(Math.floor(x / CELL), Math.floor(z / CELL));
      const list = this.#cells.get(cell);
      if (list) list.push(i);
      else this.#cells.set(cell, [i]);
    }
    this.centre = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    let far = 0;
    for (let i = 0; i < this.count; i++) far = Math.max(far, Math.hypot(spots[i * 3]! - this.centre[0], spots[i * 3 + 2]! - this.centre[1]));
    this.radius = far;
  }

  /** The same ground with other towns. */
  withTowns(towns: readonly Town[]): PlayGround {
    return new PlayGround(this.#spots, this.#areas, towns);
  }

  get count(): number {
    return this.#spots.length / 3;
  }

  #cell(column: number, row: number): number {
    return (column + 32768) * 65536 + row + 32768;
  }

  /** The part of the nav a spot lies in: two spots of one area each have a route to the other. Null on ground with no nav. */
  area(i: number): number | null {
    return this.#areas ? this.#areas[i]! : null;
  }

  /** One spot's feet. */
  spot(i: number): readonly [x: number, y: number, z: number] {
    return [this.#spots[i * 3]!, this.#spots[i * 3 + 1]!, this.#spots[i * 3 + 2]!];
  }

  /** The spots within `reach` (m) of (x, z) on the ground plane, nearest first. */
  near(x: number, z: number, reach: number): number[] {
    const found: { i: number; d: number }[] = [];
    const [left, right] = [Math.floor((x - reach) / CELL), Math.floor((x + reach) / CELL)];
    const [top, bottom] = [Math.floor((z - reach) / CELL), Math.floor((z + reach) / CELL)];
    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) {
        for (const i of this.#cells.get(this.#cell(column, row)) ?? []) {
          const d = Math.hypot(this.#spots[i * 3]! - x, this.#spots[i * 3 + 2]! - z);
          if (d <= reach) found.push({ i, d });
        }
      }
    }
    return found.sort((p, q) => p.d - q.d || p.i - q.i).map((p) => p.i);
  }

  /** The town (x, z) stands in, `edge` (m) past its rim counted in, or null. */
  townAt(x: number, z: number, edge = 0): Town | null {
    return this.towns.find((t) => Math.hypot(x - t.x, z - t.z) <= t.radius + edge) ?? null;
  }

  /** A random spot of open ground in `town`, within `share` of its radius of its middle, or null where it has none. */
  inTown(town: Town, random: () => number, share = TOWN_HEART): number | null {
    const spots = this.near(town.x, town.z, town.radius * share);
    return spots.length === 0 ? null : spots[Math.floor(random() * spots.length)]!;
  }
}

/** A town's heart: the share of its radius a spot picked in it lies within, clear of its outskirts. */
export const TOWN_HEART = 0.75;

const grounds = new WeakMap<NavGraph, PlayGround>();
const NO_TOWNS: readonly Town[] = [];

/** The open land of a map with a nav graph, and its towns. Worked out once a graph, so a warm-up pays and a match's opening doesn't. */
export function playGround(nav: NavGraph, world: World, towns: readonly Town[] = NO_TOWNS): PlayGround {
  let ground = grounds.get(nav);
  if (ground && ground.towns !== towns) {
    ground = ground.withTowns(towns);
    grounds.set(nav, ground);
  }
  if (!ground) {
    const spots: number[] = [];
    const areas: number[] = [];
    const of = navAreas(nav);
    const terrain = world.terrain;
    for (const [i, { position, indoor, escape }] of nav.nodes.entries()) {
      const [x, y, z] = position;
      if (indoor || escape) continue;
      if (terrain && (Math.abs(y - terrain.heightAt(x, z)) > ON_THE_GROUND || terrain.waterAbove(x, y, z) > 0)) continue;
      spots.push(x, y, z);
      areas.push(of[i]!);
    }
    ground = new PlayGround(new Float32Array(spots), Int32Array.from(areas), towns);
    grounds.set(nav, ground);
  }
  return ground;
}

/** The map's own spawn points as ground, on a map with no nav: its server has no bots. */
export function groundFromSpawns(spawns: readonly SpawnPoint[]): PlayGround {
  return new PlayGround(new Float32Array(spawns.flatMap((s) => [...s.position])));
}

/** A Squad's start this far (m) past a town's rim is at the town. */
const TOWN_START = 25;

const atTown = (ground: PlayGround, spot: number): boolean => {
  const [x, , z] = ground.spot(spot);
  return ground.townAt(x, z, TOWN_START) !== null;
};

/** A shuffle of the first `count` numbers. */
function shuffled(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** The spots of one Squad at each place a turned, shifted triangular lattice of `spacing` finds room for it. */
function places(ground: PlayGround, spacing: number, size: number, gap: number, random: () => number): number[][] {
  const turn = random() * Math.PI * 2;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const [shiftU, shiftV] = [random() * spacing, random() * spacing];
  const rowGap = (spacing * Math.sqrt(3)) / 2;
  const reach = Math.ceil(ground.radius / rowGap) + 2;
  const out: number[][] = [];
  for (let row = -reach; row <= reach; row++) {
    for (let column = -reach; column <= reach; column++) {
      const u = shiftU + (column + (row & 1) / 2) * spacing;
      const v = shiftV + row * rowGap;
      const anchor = ground.near(ground.centre[0] + u * cos - v * sin, ground.centre[1] + u * sin + v * cos, SNAP)[0];
      if (anchor === undefined) continue;
      if (size === 1) {
        out.push([anchor]);
        continue;
      }
      const [x, , z] = ground.spot(anchor);
      const squad = ground.near(x, z, gap).slice(0, size);
      if (squad.length === size) out.push(squad);
    }
  }
  return out;
}

/**
 * Where each of `squads` Squads of `size` starts, one list of spawns a Squad:
 * random places on land, every seat at least the spawn spacing from every other
 * Squad's and within the squadmate gap of its own first seat, the places at
 * the map's towns taken first. A lattice, as
 * darts thrown at random jam well short of 60 on this much land. It is wide
 * enough that snapping to the nearest spot, and the squadmates round that, can
 * only close the distance down to the spacing.
 */
export function squadSpots(ground: PlayGround, squads: number, size: number, random: () => number): SpawnPoint[][] {
  if (squads === 0) return [];
  const gap = size > 1 ? STATS.royale.squadmateGap.value : 0;
  let spacing = STATS.royale.spawnSpacing.value + 2 * SNAP + 2 * gap;
  let found: number[][] = [];
  // Room for everyone beats the spacing, on ground too small for it: never so on Zero Island, as a test holds.
  for (let tried = 1; found.length < squads && spacing > 1; tried++) {
    found = places(ground, spacing, size, gap, random);
    if (tried % TRIES === 0) spacing *= CLOSER;
  }
  if (found.length === 0) found = [[0]];
  // Places in or by a town go first, as the crowd lands where the buildings are.
  const order = shuffled(found.length, random).sort((a, b) => Number(atTown(ground, found[b]![0]!)) - Number(atTown(ground, found[a]![0]!)));
  return Array.from({ length: squads }, (_, i) => {
    const place = found[order[i % order.length]!]!;
    return Array.from({ length: size }, (_, seat): SpawnPoint => ({ position: [...ground.spot(place[seat % place.length]!)], yaw: random() * Math.PI * 2 }));
  });
}
