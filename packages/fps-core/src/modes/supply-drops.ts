import type { Vec3 } from '../math';
import type { HeldWeapon, PlayerId, PlayerOutput, SimEvent } from '../simulation';
import { STATS, type WeaponId } from '../stats';
import type { Loadout } from '../weapon/loadout';
import type { LooseWeaponState, ModeContext, ModeEvent, SupplyDropState } from './game-mode';
import type { PlayGround } from './ground';
import type { RingStage } from './ring';

const D = STATS.royale.supplyDrop;

/** The weapon a Supply Drop holds: the only sniper of a Battle Royale. */
export const DROP_WEAPON: WeaponId = 'sniper';

/** A Battle Royale loadout: the sniper comes only from a Supply Drop, so a pick of it starts with the M4A1. */
export function royaleLoadout(loadout: Loadout): Loadout {
  return loadout.primary === DROP_WEAPON ? { ...loadout, primary: 'm4a1' } : loadout;
}

/** The most weapons that lie on the ground at once; past it the oldest that isn't a sniper goes. */
const MOST_LOOSE = 16;
/** Tries at a spot inside the circle before the ground nearest its middle. */
const TRIES = 16;
/** How far (m) from a crate its opener's old primary lands. */
const BESIDE = 1.1;

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

interface Loose {
  readonly id: number;
  readonly weapon: HeldWeapon;
  readonly position: Vec3;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** The sniper as a crate gives it: a full magazine and the spare magazines. */
export function dropSniper(): HeldWeapon {
  const magazine = STATS.weapons[DROP_WEAPON].handling.magazineSize.value;
  return { id: DROP_WEAPON, ammo: magazine, reserve: magazine * D.magazines.value };
}

/**
 * When and where each crate of a match falls: one at the start of each Stage
 * from the stats file's first to its last, landing on open ground well inside
 * that Stage's next circle, its warning after it's announced.
 */
export function planDrops(ring: readonly RingStage[], ground: PlayGround, random: () => number): { readonly stage: number; readonly position: Vec3; readonly announce: number; readonly lands: number }[] {
  const out: { stage: number; position: Vec3; announce: number; lands: number }[] = [];
  for (let stage = D.firstStage.value; stage <= Math.min(D.lastStage.value, ring.length); stage++) {
    const s = ring[stage - 1]!;
    const c = s.to;
    let position: Vec3 | null = null;
    for (let t = 0; t < TRIES && !position; t++) {
      const [turn, out] = [random() * Math.PI * 2, Math.sqrt(random()) * c.radius * D.ring.value];
      const [x, z] = [c.x + Math.cos(turn) * out, c.z + Math.sin(turn) * out];
      const found = ground.near(x, z, 12)[0];
      if (found === undefined) continue;
      const spot = ground.spot(found);
      if (Math.hypot(spot[0] - c.x, spot[2] - c.z) <= c.radius * D.ring.value) position = [spot[0], spot[1], spot[2]];
    }
    if (!position) {
      let reach = Math.max(8, c.radius);
      let found = ground.near(c.x, c.z, reach)[0];
      while (found === undefined && reach < 4000) found = ground.near(c.x, c.z, (reach *= 2))[0];
      if (found === undefined) continue;
      const spot = ground.spot(found);
      position = [spot[0], spot[1], spot[2]];
    }
    out.push({ stage, position, announce: s.start, lands: s.start + D.warning.value });
  }
  return out;
}

/**
 * A Battle Royale's Supply Drops and the weapons lying on the ground. Each
 * crate is announced at its Stage's start and lands its warning later; any
 * seat on its feet holding use at a landed crate opens it in its open time,
 * and takes the sniper in place of its primary, which falls beside the crate.
 * A weapon on the ground goes to whoever presses use over it, who leaves their
 * own primary in its place; a seat that goes out with the sniper leaves it
 * where it fell. Bots and people use the same rules.
 */
export class SupplyDrops {
  #drops: Drop[] = [];
  #loose: Loose[] = [];
  #nextLoose = 1;
  /** Who held use on the last tick, so a press is a new one. */
  #held = new Set<PlayerId>();
  /** Simulation time at match time 0. */
  #clock = 0;

  /** A new match's crates. */
  start(ring: readonly RingStage[], ground: PlayGround, random: () => number): void {
    this.#drops = planDrops(ring, ground, random).map((d) => ({ ...d, announced: false, landed: false, opening: null, opened: null }));
    this.#loose = [];
    this.#nextLoose = 1;
    this.#held = new Set();
  }

  /** A tick: crates announced, landing and being opened, weapons taken from the ground and dropped by the fallen. */
  step(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    this.#clock = ctx.time - ctx.matchTime;
    const out: ModeEvent[] = [];
    const seats = new Map<PlayerId, PlayerOutput>();
    for (const p of ctx.players) seats.set(p.id, p);
    const standing = (p: PlayerOutput | undefined): p is PlayerOutput => p !== undefined && p.alive && !p.downed;
    const primaryOf = (p: PlayerOutput) => ctx.act?.primary(p.id)?.id ?? p.loadout?.primary;
    // The fallen leave the sniper where they fell.
    for (const e of events) {
      if (e.type !== 'kill' || !ctx.act) continue;
      const victim = seats.get(e.victim);
      const held = ctx.act.primary(e.victim);
      if (!victim || held?.id !== DROP_WEAPON || held.ammo + (held.reserve ?? 0) <= 0) continue;
      this.#lay(held, victim.position);
      out.push({ type: 'loose', player: null, weapon: held.id, left: null, position: victim.position });
    }
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
          const old = ctx.act?.give(by.id, dropSniper()) ?? null;
          out.push({ type: 'drop', action: 'open', stage: d.stage, player: by.id, position: d.position });
          if (old && old.id !== DROP_WEAPON) {
            const turn = (d.stage * 2.4) % (Math.PI * 2);
            const at: Vec3 = [d.position[0] + Math.cos(turn) * BESIDE, d.position[1], d.position[2] + Math.sin(turn) * BESIDE];
            this.#lay(old, at);
            out.push({ type: 'loose', player: null, weapon: old.id, left: null, position: at });
          }
          continue;
        }
      }
      if (!d.opening) {
        // The nearest of those holding use at it, who don't carry the sniper already.
        let best: PlayerOutput | null = null;
        for (const p of ctx.players) {
          if (!standing(p) || !ctx.using.has(p.id) || !near(p) || primaryOf(p) === DROP_WEAPON) continue;
          if (!best || flat(p.position, d.position) < flat(best.position, d.position)) best = p;
        }
        if (best) {
          d.opening = { by: best.id, since: ctx.time };
          out.push({ type: 'drop', action: 'start', stage: d.stage, player: best.id, position: d.position });
        }
      }
    }
    // A press of use over a weapon on the ground swaps it for the primary in hand.
    if (this.#loose.length > 0 && ctx.act) {
      for (const id of ctx.using) {
        if (this.#held.has(id)) continue;
        const p = seats.get(id);
        if (!standing(p) || this.#opening(id)) continue;
        const mine = ctx.act.primary(id);
        let best: Loose | null = null;
        for (const l of this.#loose) {
          if (l.weapon.id === mine?.id || flat(l.position, p.position) > D.pickupReach.value || Math.abs(l.position[1] - p.position[1]) > 2) continue;
          if (!best || flat(l.position, p.position) < flat(best.position, p.position)) best = l;
        }
        if (!best) continue;
        this.#loose = this.#loose.filter((l) => l !== best);
        const old = ctx.act.give(id, best.weapon);
        if (old) this.#lay(old, best.position);
        out.push({ type: 'loose', player: id, weapon: best.weapon.id, left: old?.id ?? null, position: best.position });
      }
    }
    this.#held = new Set(ctx.using);
    return out;
  }

  #opening(id: PlayerId): boolean {
    return this.#drops.some((d) => d.opening?.by === id);
  }

  #lay(weapon: HeldWeapon, position: Vec3): void {
    this.#loose.push({ id: this.#nextLoose++, weapon, position: [position[0], position[1], position[2]] });
    if (this.#loose.length > MOST_LOOSE) {
      const i = this.#loose.findIndex((l) => l.weapon.id !== DROP_WEAPON);
      this.#loose.splice(i < 0 ? 0 : i, 1);
    }
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

  /** The weapons lying on the ground, for the snapshot. */
  loose(): LooseWeaponState[] {
    return this.#loose.map((l) => ({ id: l.id, weapon: l.weapon.id, position: l.position }));
  }
}
