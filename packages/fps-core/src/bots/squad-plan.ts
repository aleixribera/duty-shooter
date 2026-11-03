import type { Vec3 } from '../math';
import type { BattleRoyaleState } from '../modes/game-mode';
import type { Circle } from '../modes/ring';
import { noise } from '../random';
import type { PlayerId, SimEvent, TeamId } from '../simulation';
import { NoiseGrid } from './noise-grid';
import { SquadIntel } from './squad-intel';

/**
 * Battle Royale's ground for each bot: where it chooses to be, worked out for
 * it once a second from its own position, its own temper and health, the Ring
 * as a player's HUD shows it, and what its Squad knows together
 * ({@link SquadIntel}). There is no leader and no order: each bot weighs its
 * own reasons, and squadmates end up together because joining where a
 * squadmate said it's going is usually the best choice. Nothing here looks at
 * how the match is going, who is winning, or whether a seat is a person, except
 * that bots in a person's Squad stay with that person. Bots learn of distant
 * fights only by ear ({@link NoiseGrid}), never from where anyone truly is.
 */

/** A seat as the planner sees it. */
export interface PlannedSeat {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly position: Vec3;
  /** A bot makes its own choices here; a person makes theirs at the keyboard. */
  readonly bot: boolean;
  readonly downed: { readonly bleedOut: number; readonly revive: number } | null;
  /** Health now (100 when absent). */
  readonly health?: number;
  /** The bot's own boldness, 0 to 1 (its profile's aggression); 0.5 when absent. */
  readonly bold?: number;
}

export interface SquadSituation {
  /** Simulation time (s), the clock the Ring's state counts in. */
  readonly time: number;
  readonly state: BattleRoyaleState;
  /** Every seat still in it, Downed ones too. */
  readonly seats: readonly PlannedSeat[];
  /**
   * The most Squads this plan may give a first rally, in the order it always
   * goes; the rest get nothing until a later plan. Every one when absent.
   * Each first rally looks for ground several times over, so all of them in
   * one tick took 12 to 17 ms.
   */
  readonly fresh?: number;
}

/** What one bot has made of the ground, each second, and what it can read from its Squad. */
export interface GroundOrder {
  /** Where it has chosen to be: headed for or holding. */
  readonly rally: Vec3;
  /** Near enough to the rally to count as there (m). */
  readonly radius: number;
  /** The wall has it, or is about to: no stopping, no break in the run. */
  readonly hurry: boolean;
  /** It's going after a fight it heard: it moves with less waiting. */
  readonly hunt: boolean;
  /** It is well ahead of its nearest squadmate: it waits for them. */
  readonly wait: boolean;
  /** Its place in the Squad's seats: spreads which way squadmates look. */
  readonly slot: number;
  /** Squadmates on their feet, the bot not counted. */
  readonly mates: number;
  /** The Ring, as the HUD shows it. */
  readonly ring: BattleRoyaleState;
  /** What its Squad knows together. */
  readonly intel: SquadIntel;
  /** The island's gunfire, for the bot to read what's within its earshot. */
  readonly noise: NoiseGrid;
}

/** Where the wall stands at `time`, from what a client is told of the Stage. */
export function wallAt(state: BattleRoyaleState, time: number): Circle {
  const f = Math.max(0, Math.min(1, (time - state.shrinkAt) / (state.shrinkEnd - state.shrinkAt)));
  const { circle: a, next: b } = state;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, radius: a.radius + (b.radius - a.radius) * f };
}

const away = (p: Vec3, c: { readonly x: number; readonly z: number }) => Math.hypot(p[0] - c.x, p[2] - c.z);
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** A sprint, a little under the real one for the bends in a route (m/s). */
export const RUN = 5.2;
/** A seat this near the wall, or this many seconds of its closing (m, s), runs for it. */
const WALL_MARGIN = 6;
const WALL_WARNING = 5;
/** A rally stands this share of the way in from the next circle's edge at most; an old rally this far inside still does. */
const DEEP = 0.82;
/** A bot starts its run this long before it would otherwise have to (s): the boldest the least, the most careful about twice as long. */
const SPARE: readonly [number, number] = [14, 30];
/** Near enough to a rally (m): more for a bigger Squad, less once the circle is small. */
const RALLY_RADIUS = 7;
const RALLY_PER_SEAT = 3;
/** A bot farther than this (m) from its nearest squadmate, and ahead of them, waits for them. */
const STRAGGLER = 38;
/** A new spot to hold, as a bot shifts about inside the circle: every so often (s, the boldest the most often), about this far (m). */
const SHIFT_EVERY: readonly [number, number] = [35, 70];
const SHIFT_REACH: readonly [number, number] = [35, 70];
/** How often (s) a bot thinks again about going after a fight it hears. */
const DECIDE_EVERY: readonly [number, number] = [15, 30];
/** The chance it goes, at its boldest and in full health. */
const HUNT = 0.4;
/** A fight is one it hears from afar beyond this (m), and loud enough (a few shots lately) to be worth the walk. */
const HUNT_NEAR = 60;
const HUNT_LOUD = 3;
/** A hunt lands about this far (m) from the noise's cell and lasts this long at most (s). */
const HUNT_BLUR = 12;
const HUNT_FOR = 45;
/** Tries at a random spot inside a circle. */
const TRIES = 6;

/** One bot's choice of ground. */
interface Mind {
  point: Vec3;
  /** When it last chose or joined (s). */
  since: number;
  /** When it next shifts, and next thinks about a hunt. */
  shiftAt: number;
  decideAt: number;
  hunt: boolean;
  huntUntil: number;
}

/** Works out the ground of every bot of one Battle Royale. `spot` gives the nearest place to stand to a point on the plane. */
export class SquadPlanner {
  readonly #spot: (x: number, z: number) => Vec3;
  readonly #seed: number;
  readonly #minds = new Map<PlayerId, Mind>();
  readonly #intel = new Map<TeamId, SquadIntel>();
  /** The island's gunfire, as everyone in earshot hears it. */
  readonly noise = new NoiseGrid();
  #draws = 0;

  constructor(spot: (x: number, z: number) => Vec3, seed: number) {
    this.#spot = spot;
    this.#seed = seed;
  }

  #random(): number {
    this.#draws += 1;
    return noise(this.#seed, this.#draws, 11);
  }

  /** What Squad `team` knows together. */
  intel(team: TeamId): SquadIntel {
    let intel = this.#intel.get(team);
    if (!intel) {
      intel = new SquadIntel();
      this.#intel.set(team, intel);
    }
    return intel;
  }

  /**
   * A tick's events, as the island hears them: gunfire and deaths go on the
   * grid, a seat hit or Downed puts its Squad on its guard, and the kill feed
   * takes the dead out of every Squad's callouts.
   */
  hear(events: readonly SimEvent[], where: (id: PlayerId) => { readonly team: TeamId; readonly position: Vec3 } | undefined, time: number): void {
    for (const e of events) {
      if (e.type === 'shot') this.noise.add(e.origin, time);
      else if (e.type === 'hit' || e.type === 'down') {
        const victim = where(e.victim);
        if (victim) this.intel(victim.team).contact = time;
      } else if (e.type === 'kill') {
        const victim = where(e.victim);
        if (victim) this.noise.add(victim.position, time, 3);
        for (const intel of this.#intel.values()) {
          intel.forget(e.victim);
          intel.settled(e.victim);
        }
      } else if (e.type === 'revive') {
        const target = where(e.target);
        if (target) this.intel(target.team).settled(e.target);
      }
    }
  }

  /** A place in `c`, on the ground, nearest to the one wanted. */
  #inCircle(c: Circle, want: readonly [number, number]): Vec3 {
    for (let t = 0; t < TRIES; t++) {
      const [turn, out] = [this.#random() * Math.PI * 2, Math.sqrt(this.#random()) * Math.min(c.radius, 30 + t * 15)];
      const p = this.#spot(want[0] + Math.cos(turn) * out, want[1] + Math.sin(turn) * out);
      if (away(p, c) <= c.radius * DEEP) return p;
    }
    for (let t = 0; t < TRIES; t++) {
      const [turn, out] = [this.#random() * Math.PI * 2, Math.sqrt(this.#random()) * c.radius * DEEP];
      const p = this.#spot(c.x + Math.cos(turn) * out, c.z + Math.sin(turn) * out);
      if (away(p, c) <= c.radius) return p;
    }
    return this.#spot(c.x, c.z);
  }

  /** The point on the line to `c`'s middle that is just well inside it. */
  #inward(at: Vec3, c: Circle): readonly [number, number] {
    const d = away(at, c);
    if (d <= c.radius * DEEP * 0.8) return [at[0], at[2]];
    const k = (c.radius * DEEP * 0.8) / d;
    return [c.x + (at[0] - c.x) * k, c.z + (at[2] - c.z) * k];
  }

  #between([lo, hi]: readonly [number, number], k: number): number {
    return lo + (hi - lo) * k;
  }

  /** Says where it's going, so squadmates can join it. */
  #say(seat: PlannedSeat, mind: Mind, intel: SquadIntel, time: number): void {
    mind.since = time;
    intel.head(seat.id, { point: mind.point, time, hunt: mind.hunt });
  }

  /**
   * One bot's own choice of ground. It joins where a squadmate said it's going
   * when that's newer than its own choice (staying together is worth it),
   * leaves for the next circle in its own time (the careful earlier), shifts
   * about now and then, and, as bold and as healthy as it is, now and then
   * goes after the loudest fight in earshot.
   */
  #decide(seat: PlannedSeat, s: SquadSituation, intel: SquadIntel, standing: ReadonlySet<PlayerId>): Mind {
    const { state, time } = s;
    const { next } = state;
    const bold = seat.bold ?? 0.5;
    const inside = (p: Vec3) => away(p, next) <= next.radius * DEEP;
    const shared = intel.newestHeading(seat.id, standing);
    let mind = this.#minds.get(seat.id);
    if (!mind) {
      const join = shared && inside(shared.point);
      const point = join ? shared.point : this.#inCircle(next, inside(seat.position) ? [seat.position[0], seat.position[2]] : this.#inward(seat.position, next));
      mind = { point, since: time, shiftAt: time + this.#between(SHIFT_EVERY, this.#random()) * (1.4 - 0.8 * bold), decideAt: time + this.#between(DECIDE_EVERY, this.#random()), hunt: join ? shared.hunt : false, huntUntil: join && shared.hunt ? time + HUNT_FOR : 0 };
      this.#minds.set(seat.id, mind);
      if (!join) this.#say(seat, mind, intel, time);
      else intel.head(seat.id, { point: mind.point, time: shared.time, hunt: mind.hunt });
      return mind;
    }
    if (shared && shared.time > mind.since && flat(shared.point, mind.point) > 1 && inside(shared.point)) {
      // A squadmate is off somewhere new: it goes with them.
      mind.point = shared.point;
      mind.hunt = shared.hunt;
      mind.huntUntil = shared.hunt ? time + HUNT_FOR : 0;
      mind.since = shared.time;
      intel.head(seat.id, { point: mind.point, time: shared.time, hunt: mind.hunt });
      return mind;
    }
    if (!inside(mind.point)) {
      // Time to go: late enough to have held, early enough to make it, by its own care.
      const run = flat(seat.position, this.#spot(...this.#inward(seat.position, next))) / RUN;
      const spare = this.#between(SPARE, 1 - bold);
      if (time >= Math.min(state.shrinkAt, state.shrinkEnd - run - spare)) {
        mind.point = this.#inCircle(next, this.#inward(seat.position, next));
        mind.hunt = false;
        mind.shiftAt = time + this.#between(SHIFT_EVERY, this.#random()) * (1.4 - 0.8 * bold);
        this.#say(seat, mind, intel, time);
      }
      return mind;
    }
    if (mind.hunt && (time >= mind.huntUntil || flat(seat.position, mind.point) < HUNT_BLUR)) {
      // There, or gave it long enough: it holds where it is now.
      mind.hunt = false;
      mind.shiftAt = time + this.#between(SHIFT_EVERY, this.#random()) * (1.4 - 0.8 * bold);
      return mind;
    }
    if (mind.hunt || seat.downed) return mind;
    if (time >= mind.decideAt) {
      mind.decideAt = time + this.#between(DECIDE_EVERY, this.#random());
      const health = Math.max(0, Math.min(1, (seat.health ?? 100) / 100));
      if (this.#random() < HUNT * bold * health) {
        const fight = this.noise.loudest(seat.position, time, undefined, HUNT_NEAR, (x, z) => Math.hypot(x - next.x, z - next.z) <= next.radius * DEEP);
        if (fight && fight.heat >= HUNT_LOUD) {
          const turn = this.#random() * Math.PI * 2;
          mind.point = this.#spot(fight.x + Math.cos(turn) * HUNT_BLUR, fight.z + Math.sin(turn) * HUNT_BLUR);
          mind.hunt = true;
          mind.huntUntil = time + HUNT_FOR;
          this.#say(seat, mind, intel, time);
          return mind;
        }
      }
    }
    if (time >= mind.shiftAt) {
      // Nothing to run from: a bot doesn't sit in one place all Stage.
      const reach = Math.min(next.radius * DEEP, this.#between(SHIFT_REACH, this.#random()));
      const turn = this.#random() * Math.PI * 2;
      const toward: [number, number] = [seat.position[0] + Math.cos(turn) * reach, seat.position[2] + Math.sin(turn) * reach];
      mind.point = this.#inCircle(next, away([toward[0], 0, toward[1]], next) <= next.radius ? toward : this.#inward(seat.position, next));
      mind.shiftAt = time + this.#between(SHIFT_EVERY, this.#random()) * (1.4 - 0.8 * bold);
      this.#say(seat, mind, intel, time);
    }
    return mind;
  }

  /** Each bot's ground for the next second. */
  plan(s: SquadSituation): Map<PlayerId, GroundOrder> {
    const orders = new Map<PlayerId, GroundOrder>();
    const { state, time, seats } = s;
    const wall = wallAt(state, time);
    const soon = wallAt(state, time + WALL_WARNING);
    const squads = new Map<TeamId, PlannedSeat[]>();
    for (const seat of seats) {
      const list = squads.get(seat.team);
      if (list) list.push(seat);
      else squads.set(seat.team, [seat]);
    }
    let fresh = s.fresh ?? Infinity;
    for (const [team, members] of squads) {
      if (!members.some((m) => this.#minds.has(m.id))) {
        if (fresh <= 0) continue;
        fresh -= 1;
      }
      const intel = this.intel(team);
      const standing = members.filter((m) => !m.downed);
      const ids = new Set(standing.map((m) => m.id));
      // A person in the Squad: its bots stay with them, unless the person stands where the Ring is.
      const person = standing.find((m) => !m.bot);
      const personSafe = person !== undefined && away(person.position, soon) < soon.radius - WALL_MARGIN;
      if (person) intel.head(person.id, { point: person.position, time: intel.heading(person.id)?.time ?? time, hunt: false });
      const radius = Math.min(RALLY_RADIUS + RALLY_PER_SEAT * members.length, Math.max(3, state.next.radius * 0.6));
      for (const [slot, seat] of members.entries()) {
        if (!seat.bot) continue;
        const mind = this.#decide(seat, s, intel, ids);
        const inDanger = away(seat.position, wall) > wall.radius - WALL_MARGIN || away(seat.position, soon) > soon.radius - WALL_MARGIN;
        let nearest: PlannedSeat | null = null;
        for (const m of standing) if (m !== seat && (!nearest || flat(m.position, seat.position) < flat(nearest.position, seat.position))) nearest = m;
        // Well ahead of the nearest squadmate on the way to the same place: worth waiting for.
        const ahead = nearest !== null && flat(nearest.position, seat.position) > STRAGGLER && flat(seat.position, mind.point) < flat(nearest.position, mind.point);
        orders.set(seat.id, {
          rally: person && personSafe && !inDanger ? person.position : mind.point,
          radius,
          hurry: inDanger,
          hunt: mind.hunt,
          wait: ahead && !inDanger && !seat.downed,
          slot,
          mates: Math.max(0, standing.length - (seat.downed ? 0 : 1)),
          ring: state,
          intel,
          noise: this.noise,
        });
      }
    }
    const present = new Set(seats.map((x) => x.id));
    for (const id of this.#minds.keys()) if (!present.has(id)) this.#minds.delete(id);
    for (const team of this.#intel.keys()) if (!squads.has(team)) this.#intel.delete(team);
    return orders;
  }
}
