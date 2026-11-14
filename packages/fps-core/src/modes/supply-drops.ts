import type { Vec3 } from '../math';
import type { PlayerId, PlayerOutput } from '../simulation';
import { STATS } from '../stats';
import type { World } from '../world';
import type { ModeContext, ModeEvent, SupplyDropState } from './game-mode';
import type { PlayGround } from './ground';
import type { RingStage } from './ring';

const D = STATS.royale.supplyDrop;

/** Tries at a spot inside the circle before the ground nearest its middle. */
const TRIES = 16;
/** Room (m) a crate needs between it and any solid around it, so one landing on a body can put it beside the crate rather than in a wall. */
const ROOM = 2;
/** Height (m) above the ground a solid counts as in the way: lower is a kerb or a step, part of the ground. */
const STEP = 0.4;

interface Drop {
  readonly stage: number;
  readonly position: Vec3;
  /** Match times. */
  readonly announce: number;
  readonly lands: number;
  announced: boolean;
  landed: boolean;
  opening: { by: PlayerId; since: number } | null;
  opened: PlayerId | null;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Whether a crate at `at` has {@link ROOM} clear around it: no solid that stands above the ground there within it. */
export function roomForDrop(world: World, at: Vec3): boolean {
  // Half the crate's longest side, and the room.
  const size = 0.6 + ROOM;
  for (const i of world.movement.inRect(at[0] - size, at[2] - size, at[0] + size, at[2] + size)) {
    const s = world.solids[i]!;
    if (s.max[1] <= at[1] + STEP || s.min[1] >= at[1] + 2.5) continue;
    if (s.max[0] < at[0] - size || s.min[0] > at[0] + size || s.max[2] < at[2] - size || s.min[2] > at[2] + size) continue;
    return false;
  }
  return true;
}

/**
 * When and where each crate of a match falls: one at the start of each Stage
 * from the stats file's first to its last, landing on open ground well inside
 * that Stage's next circle (in a town there, if one is) with room around it (when `world` is given), its
 * warning after it's announced.
 */
export function planDrops(ring: readonly RingStage[], ground: PlayGround, random: () => number, world?: World): { readonly stage: number; readonly position: Vec3; readonly announce: number; readonly lands: number }[] {
  const out: { stage: number; position: Vec3; announce: number; lands: number }[] = [];
  for (let stage = D.firstStage.value; stage <= Math.min(D.lastStage.value, ring.length); stage++) {
    const s = ring[stage - 1]!;
    const c = s.to;
    let position: Vec3 | null = null;
    // A town well inside the circle takes the crate: a fight over it is a fight among buildings.
    const town = ground.towns.filter((w) => Math.hypot(w.x - c.x, w.z - c.z) <= c.radius * D.ring.value).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    for (let t = 0; town && t < TRIES && !position; t++) {
      const found = ground.inTown(town, random);
      if (found === null) break;
      const spot: Vec3 = [...ground.spot(found)];
      if (Math.hypot(spot[0] - c.x, spot[2] - c.z) <= c.radius * D.ring.value && (!world || roomForDrop(world, spot))) position = spot;
    }
    for (let t = 0; t < TRIES && !position; t++) {
      const [turn, out] = [random() * Math.PI * 2, Math.sqrt(random()) * c.radius * D.ring.value];
      const [x, z] = [c.x + Math.cos(turn) * out, c.z + Math.sin(turn) * out];
      const found = ground.near(x, z, 12)[0];
      if (found === undefined) continue;
      const spot: Vec3 = [...ground.spot(found)];
      if (Math.hypot(spot[0] - c.x, spot[2] - c.z) <= c.radius * D.ring.value && (!world || roomForDrop(world, spot))) position = spot;
    }
    if (!position) {
      // The ground nearest the circle's middle, the nearest with room if there is any.
      let reach = Math.max(8, c.radius);
      let near = ground.near(c.x, c.z, reach);
      while (near.length === 0 && reach < 4000) near = ground.near(c.x, c.z, (reach *= 2));
      if (near.length === 0) continue;
      const roomy = world ? near.find((i) => roomForDrop(world, [...ground.spot(i)])) : undefined;
      position = [...ground.spot(roomy ?? near[0]!)];
    }
    out.push({ stage, position, announce: s.start, lands: s.start + D.warning.value });
  }
  return out;
}

/**
 * A Battle Royale's Supply Drops. Each crate is announced at its Stage's start
 * and lands its warning later; any seat on its feet holding use at a landed
 * crate opens it in its open time, and is resupplied: frags, tacticals and
 * full health. Everyone drops with their own loadout, so a crate never holds a
 * weapon and nothing lies on the ground. Bots and people use the same rules.
 */
export class SupplyDrops {
  #drops: Drop[] = [];
  /** Simulation time at match time 0. */
  #clock = 0;

  /** A new match's crates. */
  start(ring: readonly RingStage[], ground: PlayGround, random: () => number, world?: World): void {
    this.#drops = planDrops(ring, ground, random, world).map((d) => ({ ...d, announced: false, landed: false, opening: null, opened: null }));
  }

  /** A tick: crates announced, landing and being opened. */
  step(ctx: ModeContext): ModeEvent[] {
    this.#clock = ctx.time - ctx.matchTime;
    const out: ModeEvent[] = [];
    const seats = new Map<PlayerId, PlayerOutput>();
    for (const p of ctx.players) seats.set(p.id, p);
    const standing = (p: PlayerOutput | undefined): p is PlayerOutput => p !== undefined && p.alive && !p.downed;
    for (const d of this.#drops) {
      if (!d.announced && ctx.matchTime >= d.announce - 1e-9) {
        d.announced = true;
        out.push({ type: 'drop', action: 'announce', stage: d.stage, player: null, position: d.position });
      }
      if (d.announced && !d.landed && ctx.matchTime >= d.lands - 1e-9) {
        d.landed = true;
        out.push({ type: 'drop', action: 'land', stage: d.stage, player: null, position: d.position });
      }
      if (!d.landed || d.opened) continue;
      const near = (p: PlayerOutput) => flat(p.position, d.position) <= D.reach.value && Math.abs(p.position[1] - d.position[1]) <= D.reach.value;
      if (d.opening) {
        const by = seats.get(d.opening.by);
        if (!standing(by) || !ctx.using.has(by.id) || !near(by)) {
          out.push({ type: 'drop', action: 'stop', stage: d.stage, player: d.opening.by, position: d.position });
          d.opening = null;
        } else if (ctx.time - d.opening.since >= D.openTime.value - 1e-9) {
          d.opened = by.id;
          d.opening = null;
          ctx.act?.resupply(by.id);
          out.push({ type: 'drop', action: 'open', stage: d.stage, player: by.id, position: d.position });
          continue;
        }
      }
      if (!d.opening) {
        // The nearest of those holding use at it.
        let best: PlayerOutput | null = null;
        for (const p of ctx.players) {
          if (!standing(p) || !ctx.using.has(p.id) || !near(p)) continue;
          if (!best || flat(p.position, d.position) < flat(best.position, d.position)) best = p;
        }
        if (best) {
          d.opening = { by: best.id, since: ctx.time };
          out.push({ type: 'drop', action: 'start', stage: d.stage, player: best.id, position: d.position });
        }
      }
    }
    return out;
  }

  /** The crates announced so far, for the snapshot. */
  drops(): SupplyDropState[] {
    return this.#drops
      .filter((d) => d.announced)
      .map((d) => ({
        stage: d.stage,
        position: d.position,
        lands: this.#clock + d.lands,
        ...(d.opening ? { opening: { by: d.opening.by, since: d.opening.since } } : {}),
        ...(d.opened ? { opened: d.opened } : {}),
      }));
  }
}
