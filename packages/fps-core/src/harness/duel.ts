import { Bot } from '../bots/bot';
import { buildNavGraph, type NavGraph } from '../bots/nav';
import { BOT_NAMES, botProfile } from '../bots/profile';
import { noise } from '../random';
import { Simulation, TICK_SECONDS, type PlayerOutput, type SimEvent, type TickOutput } from '../simulation';
import type { WeaponId } from '../stats';
import { sightBlocked } from '../combat/projectiles';
import type { Vec3 } from '../math';
import { box, createWorld, type World } from '../world';

/** Seconds both players hold still at the start, until their weapons are drawn. */
const DRAWN = 1;

/** A yard duels are fought in: concrete with crates and walls to break up the sightlines, and its nav graph. */
export interface DuelField {
  readonly world: World;
  readonly nav: NavGraph;
}

/** The yards are this long (z) and wide (x), in metres. */
const YARD_LENGTH = 150;
const YARD_WIDTH = 60;
/** How many yards the duels rotate through, and how many pieces of cover each holds. */
const YARDS = 4;
const COVER = 180;

const yards = new Map<number, DuelField>();

/**
 * Yard `k`, built once: crates and wall sections of seeded sizes scattered
 * over it, about as dense as a town's streets, so a rusher can close in
 * behind something and a long gun still finds lanes.
 */
export function duelField(k = 0): DuelField {
  let yard = yards.get(k);
  if (!yard) {
    const hx = YARD_WIDTH / 2;
    const hz = YARD_LENGTH / 2;
    const solids = [box({ min: [-hx - 5, -1, -hz - 5], max: [hx + 5, 0, hz + 5], material: 'concrete' })];
    for (let i = 0; i < COVER; i++) {
      const n = (j: number) => noise(1000 + k, i * 8 + j);
      const wall = n(0) < 0.4;
      const along = n(1) < 0.5;
      const [w, d] = wall ? [3 + 3 * n(2), 0.4] : [1.2 + 1.2 * n(2), 1.2 + 1.2 * n(3)];
      const [sx, sz] = along ? [d, w] : [w, d];
      const x = (n(4) - 0.5) * (YARD_WIDTH - 6);
      const z = (n(5) - 0.5) * (YARD_LENGTH - 6);
      const h = wall ? 2.4 : n(6) < 0.5 ? 1.1 : 2;
      solids.push(box({ min: [x - sx / 2, 0, z - sz / 2], max: [x + sx / 2, h, z + sz / 2], material: wall ? 'concrete' : 'wood' }));
    }
    const world = createWorld(solids);
    const nav = buildNavGraph(world, { area: [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]], spacing: 3 });
    yard = { world, nav };
    yards.set(k, yard);
  }
  return yard;
}

/** Where a duel starts on `yard`: two clear spots `distance` apart that see each other, picked by `seed`. */
function duelSpots(yard: DuelField, distance: number, seed: number): [Vec3, Vec3] {
  const margin = 4;
  const inside = (p: Vec3) => Math.abs(p[0]) < YARD_WIDTH / 2 - margin && Math.abs(p[2]) < YARD_LENGTH / 2 - margin;
  const standing = (p: Vec3) => !yard.world.solids.some((s) => s.max[1] > 0.2 && p[0] > s.min[0] - 0.8 && p[0] < s.max[0] + 0.8 && p[2] > s.min[2] - 0.8 && p[2] < s.max[2] + 0.8);
  const eye = (p: Vec3): Vec3 => [p[0], 1.5, p[2]];
  for (let k = 0; k < 3000; k++) {
    const n = (j: number) => noise(seed, k * 4 + j);
    const a: Vec3 = [(n(0) - 0.5) * YARD_WIDTH, 0, (n(1) - 0.5) * YARD_LENGTH];
    // Mostly down the yard's length, where the long lanes are.
    const heading = (n(2) - 0.5) * 1.2 + (n(3) < 0.5 ? 0 : Math.PI);
    const b: Vec3 = [a[0] + Math.sin(heading) * distance, 0, a[2] + Math.cos(heading) * distance];
    if (inside(a) && inside(b) && standing(a) && standing(b) && !sightBlocked(yard.world, eye(a), eye(b))) return [a, b];
  }
  throw new Error(`no duel spots ${distance} m apart for seed ${seed}`);
}

/** The yaw that faces from `a` toward `b`. */
const facing = (a: Vec3, b: Vec3) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));

export interface DuelSide {
  readonly weapon: WeaponId;
  /** The bot's name, which picks its personality. */
  readonly name: string;
}

export interface DuelResult {
  /** 'a' or 'b' for whoever got the kill, null when time ran out first. */
  readonly winner: 'a' | 'b' | null;
  /** Seconds the duel lasted. */
  readonly time: number;
}

/**
 * One bot-vs-bot duel in a yard: `a` and `b` (each with its weapon as the
 * primary, the pistol and a frag) start `distance` metres apart in sight of
 * each other, at spots picked by `seed`, facing each other with their weapons
 * drawn, and fight until one dies (or `timeout` seconds pass). `swap` trades
 * their spots.
 */
export function botDuel(options: { a: DuelSide; b: DuelSide; distance: number; seed: number; swap?: boolean; timeout?: number; watch?: (out: TickOutput, bots: { a: Bot; b: Bot }) => void }): DuelResult {
  const yard = duelField(options.seed % YARDS);
  const { world, nav } = yard;
  const sim = new Simulation(world);
  const spots = duelSpots(yard, options.distance, options.seed);
  const [pa, pb] = options.swap ? [spots[1], spots[0]] : spots;
  sim.addPlayer({ id: 'a', team: 1, position: pa, yaw: facing(pa, pb), loadout: { primary: options.a.weapon, secondary: 'pistol', grenade: 'frag' } });
  sim.addPlayer({ id: 'b', team: 2, position: pb, yaw: facing(pb, pa), loadout: { primary: options.b.weapon, secondary: 'pistol', grenade: 'frag' } });
  // Weapons out before the bots open their eyes: a duel isn't decided by draw times at spawn.
  for (let i = 0; i < Math.round(DRAWN / TICK_SECONDS); i++) sim.step({});
  const bots = { a: new Bot('a', botProfile(options.a.name), nav, world), b: new Bot('b', botProfile(options.b.name), nav, world) };
  const enemy = (self: PlayerOutput) => (o: PlayerOutput) => o.team !== self.team;
  let out: TickOutput = sim.output();
  let events: readonly SimEvent[] = [];
  const limit = Math.round((options.timeout ?? 20) / TICK_SECONDS);
  for (let i = 0; i < limit; i++) {
    const think = (id: 'a' | 'b') => {
      const self = out.players.find((p) => p.id === id)!;
      return bots[id].think({ tick: out.tick, time: sim.time, self, players: out.players, events, grenades: out.grenades, isEnemy: enemy(self) });
    };
    out = sim.step({ a: think('a'), b: think('b') });
    events = out.events;
    options.watch?.(out, bots);
    const kill = events.find((e) => e.type === 'kill');
    if (kill?.type === 'kill') return { winner: kill.victim === 'a' ? 'b' : 'a', time: sim.time };
  }
  return { winner: null, time: sim.time };
}

/** The primaries the balance runs pit against each other. */
export const DUEL_WEAPONS: readonly WeaponId[] = ['shotgun', 'smg', 'm4a1', 'sniper'];
/** The distances they duel at (m): each primary owns one band, in the order of {@link DUEL_WEAPONS}. */
export const DUEL_DISTANCES: readonly number[] = [5, 15, 30, 60];

export interface DuelCell {
  readonly a: WeaponId;
  readonly b: WeaponId;
  readonly distance: number;
  /** Duels fought, a's wins, b's wins (draws make up the rest). */
  readonly duels: number;
  readonly winsA: number;
  readonly winsB: number;
}

/** `a`'s share of the cell, a draw counting half to each. */
export function winRate(cell: Pick<DuelCell, 'duels' | 'winsA' | 'winsB'>): number {
  return (cell.winsA + (cell.duels - cell.winsA - cell.winsB) / 2) / cell.duels;
}

/**
 * Every pair of primaries at every distance, `rounds` seeded duels each way
 * round: each seed is fought twice with the bots' personalities and spots
 * traded, so neither weapon gets the better bot or the better spot.
 */
export function balanceRuns(rounds = 12, weapons: readonly WeaponId[] = DUEL_WEAPONS, distances: readonly number[] = DUEL_DISTANCES): DuelCell[] {
  const cells: DuelCell[] = [];
  for (const [i, a] of weapons.entries()) {
    for (const b of weapons.slice(i + 1)) {
      for (const distance of distances) {
        let winsA = 0;
        let winsB = 0;
        for (let r = 0; r < rounds; r++) {
          const seed = r * 7919 + distance * 31 + i;
          const first = BOT_NAMES[(r * 2) % BOT_NAMES.length]!;
          const second = BOT_NAMES[(r * 2 + 1) % BOT_NAMES.length]!;
          for (const [na, nb, swap] of [[first, second, false], [second, first, true]] as const) {
            const { winner } = botDuel({ a: { weapon: a, name: na }, b: { weapon: b, name: nb }, distance, seed, swap });
            if (winner === 'a') winsA++;
            else if (winner === 'b') winsB++;
          }
        }
        cells.push({ a, b, distance, duels: rounds * 2, winsA, winsB });
      }
    }
  }
  return cells;
}
