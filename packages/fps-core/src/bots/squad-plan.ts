import type { Vec3 } from '../math';
import type { BattleRoyaleState } from '../modes/game-mode';
import type { Circle } from '../modes/ring';
import { WIDE_SCALE } from '../modes/scale';
import { noise } from '../random';
import type { PlayerId, TeamId } from '../simulation';
import { STATS } from '../stats';

/**
 * Battle Royale's Squad brain: where each Squad goes, who Revives whom, and how
 * hot the match should run. It reads what a player's HUD shows (the Ring, how
 * many are left) and where the seats stand, and leaves how to get there to the
 * bot. It never asks whether a seat is a person, except to send a bot after the
 * person in its own Squad.
 */

/** A seat as the planner sees it. */
export interface PlannedSeat {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly position: Vec3;
  /** A bot takes orders; a person leads. */
  readonly bot: boolean;
  readonly downed: { readonly bleedOut: number; readonly revive: number } | null;
}

export interface SquadSituation {
  /** Simulation time (s), the clock the Ring's state counts in. */
  readonly time: number;
  /** How far through its time limit the match is, 0 to 1. */
  readonly played: number;
  readonly state: BattleRoyaleState;
  /** Every seat still in it, Downed ones too. */
  readonly seats: readonly PlannedSeat[];
}

/** What one bot is told, each second. */
export interface GroundOrder {
  /** Where its Squad is headed or holding. */
  readonly rally: Vec3;
  /** Near enough to the rally to count as there (m). */
  readonly radius: number;
  /** The wall has it, or is about to: no stopping, no break in the run. */
  readonly hurry: boolean;
  /** Its Squad is out to find the nearest other: it moves with less waiting. */
  readonly hunt: boolean;
  /** Hold still: a squadmate has fallen behind. */
  readonly wait: boolean;
  /** How far (m) it will open a fight with someone who isn't after it yet. */
  readonly engage: number;
  /** The Downed squadmate it should try to Revive, if it judges the ground safe. */
  readonly revive: Vec3 | null;
  /** Its place in the Squad, 0 for the leader: spreads them out and shares out jobs. */
  readonly slot: number;
  /** Squadmates on their feet, the bot not counted. */
  readonly mates: number;
}

interface Row {
  readonly at: { readonly value: number };
  readonly left: { readonly value: number };
}

const CURVE: readonly Row[] = Object.values(STATS.royale.pace);

/** The share of Squads a match at `played` (0 to 1) should still have, from the stats file's curve. */
export function expectedShare(played: number): number {
  let before = { at: 0, left: 1 };
  for (const row of CURVE) {
    const here = { at: row.at.value, left: row.left.value };
    if (played <= here.at) return before.left + ((here.left - before.left) * (played - before.at)) / (here.at - before.at);
    before = here;
  }
  return before.left;
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
const RUN = 5.2;
/** A seat this near the wall, or this many seconds of its closing (m, s), runs for it. */
const WALL_MARGIN = 6;
const WALL_WARNING = 5;
/** A rally stands this share of the way in from the next circle's edge at most; a Squad's old rally this far inside still does. */
const DEEP = 0.82;
/** Squads start their run this long before they'd otherwise have to (s). */
const SPARE = 18;
/** Near enough to a rally (m): more for a bigger Squad, less once the circle is small. */
const RALLY_RADIUS = 7;
const RALLY_PER_SEAT = 3;
/** A squadmate farther than this (m) from its leader is sent back to it; farther than `STRAGGLER`, the leader waits. */
const FOLLOW = 22;
const STRAGGLER = 38;
/** A new spot to hold, as a Squad shifts about inside the circle: every so often (s), about this far (m). */
const SHIFT_EVERY: readonly [number, number] = [35, 70];
const SHIFT_REACH: readonly [number, number] = [35, 70];
/** Below this heat a Squad with nothing to run from stays put. */
const STILL_HEAT = 0.35;
/** How fast the heat moves off the pace: this much for a field wholly ahead of or behind the curve. */
const HEAT = 1.6;
/** How far (m) a fight is opened, a cold match to a hot one. */
const ENGAGE: readonly [number, number] = [14, 70];
/** The share of Squads out hunting in the hottest match; how often the jobs change (s); how far (m) they look. */
const HUNTERS = 0.55;
const HUNT_ROUND = 20;
const HUNT_REACH = 260;
/** A hunter's rally lands about this far (m) from who it's after: a rough idea, as footsteps and the feed give. */
const HUNT_BLUR = 12;
/** The bot needs this much spare (s) on the Bleed-out and the wall. */
const REVIVE_SPARE = 1.5;
const REVIVE_WALL = 3;
/** Tries at a random spot inside a circle. */
const TRIES = 6;

interface SquadRally {
  point: Vec3;
  /** When it next shifts. */
  shiftAt: number;
  /** The Stage the rally was chosen for. */
  stage: number;
}

/** Plans the bots of one Battle Royale. `spot` gives the nearest place to stand to a point on the plane. */
export class SquadPlanner {
  readonly #spot: (x: number, z: number) => Vec3;
  readonly #seed: number;
  readonly #rallies = new Map<TeamId, SquadRally>();
  #draws = 0;

  constructor(spot: (x: number, z: number) => Vec3, seed: number) {
    this.#spot = spot;
    this.#seed = seed;
  }

  #random(): number {
    this.#draws += 1;
    return noise(this.#seed, this.#draws, 11);
  }

  /** How far above (1) or below (0) the pace the match is: 0.5 on the curve. */
  #heat({ played, state, seats }: SquadSituation): number {
    const squads = new Set(seats.filter((s) => !s.downed).map((s) => s.team)).size;
    const share = squads / Math.ceil(WIDE_SCALE.seats / state.squadSize);
    return Math.max(0, Math.min(1, 0.5 + (share / expectedShare(played) - 1) * HEAT));
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

  /** Where a Squad centred on `at` should be now: a rally is kept until the next circle would leave it behind and it's time to go. */
  #rally(team: TeamId, at: Vec3, s: SquadSituation, heat: number): SquadRally {
    const { state, time } = s;
    const { next } = state;
    let rally = this.#rallies.get(team);
    if (!rally) {
      const c = away(at, next) <= next.radius * DEEP ? ([at[0], at[2]] as const) : this.#inward(at, next);
      rally = { point: this.#inCircle(next, c), shiftAt: time + this.#shiftIn(), stage: state.stage };
      this.#rallies.set(team, rally);
      return rally;
    }
    const safe = away(rally.point, next) <= next.radius * DEEP;
    if (!safe) {
      // Time to go: late enough to have held, early enough to make it.
      const run = flat(at, this.#spot(...this.#inward(at, next))) / RUN;
      const start = Math.min(state.shrinkAt, state.shrinkEnd - run - SPARE);
      if (time >= start) {
        rally.point = this.#inCircle(next, this.#inward(at, next));
        rally.shiftAt = time + this.#shiftIn();
        rally.stage = state.stage;
      }
    } else if (time >= rally.shiftAt && heat >= STILL_HEAT) {
      // Nothing to run from: a Squad doesn't sit in one place all Stage, unless the field is thinning too fast already.
      const [lo, hi] = SHIFT_REACH;
      const reach = Math.min(next.radius * DEEP, lo + (hi - lo) * this.#random());
      const turn = this.#random() * Math.PI * 2;
      const toward: [number, number] = [at[0] + Math.cos(turn) * reach, at[2] + Math.sin(turn) * reach];
      rally.point = this.#inCircle(next, away([toward[0], 0, toward[1]], next) <= next.radius ? toward : this.#inward(at, next));
      rally.shiftAt = time + this.#shiftIn();
    }
    return rally;
  }

  #shiftIn(): number {
    const [lo, hi] = SHIFT_EVERY;
    return lo + (hi - lo) * this.#random();
  }

  /** The point on the line to `c`'s middle that is just well inside it. */
  #inward(at: Vec3, c: Circle): readonly [number, number] {
    const d = away(at, c);
    if (d <= c.radius * DEEP * 0.8) return [at[0], at[2]];
    const k = (c.radius * DEEP * 0.8) / d;
    return [c.x + (at[0] - c.x) * k, c.z + (at[2] - c.z) * k];
  }

  /** Which Squads hunt this round: a share that rises with the heat, by turns. */
  #hunting(team: TeamId, heat: number, time: number): boolean {
    const share = HUNTERS * Math.max(0, heat - 0.5) * 2;
    return noise(this.#seed, Math.floor(time / HUNT_ROUND), 900 + team) < share;
  }

  #hunted(team: TeamId, at: Vec3, seats: readonly PlannedSeat[]): Vec3 | null {
    let best: PlannedSeat | null = null;
    let bestD = HUNT_REACH;
    for (const s of seats) {
      if (s.team === team || s.downed) continue;
      const d = flat(s.position, at);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? best.position : null;
  }

  /** What each bot does for the next second. */
  plan(s: SquadSituation): Map<PlayerId, GroundOrder> {
    const orders = new Map<PlayerId, GroundOrder>();
    const { state, time, seats } = s;
    const heat = this.#heat(s);
    const engage = ENGAGE[0] + (ENGAGE[1] - ENGAGE[0]) * heat;
    const wall = wallAt(state, time);
    const soon = wallAt(state, time + WALL_WARNING);
    const squads = new Map<TeamId, PlannedSeat[]>();
    for (const seat of seats) {
      const list = squads.get(seat.team);
      if (list) list.push(seat);
      else squads.set(seat.team, [seat]);
    }
    for (const [team, members] of squads) {
      const standing = members.filter((m) => !m.downed);
      // A person leads their Squad; otherwise the lowest seat standing.
      const leader = standing.find((m) => !m.bot) ?? standing[0] ?? members[0]!;
      const person = !leader.bot;
      const home = this.#rally(team, leader.position, s, heat);
      const hunted = !person && standing.length > 0 && this.#hunting(team, heat, time) ? this.#hunted(team, leader.position, seats) : null;
      const huntTurn = noise(this.#seed, Math.floor(time / HUNT_ROUND), 1200 + team) * Math.PI * 2;
      const target: Vec3 = hunted ? this.#spot(hunted[0] + Math.cos(huntTurn) * HUNT_BLUR, hunted[2] + Math.sin(huntTurn) * HUNT_BLUR) : home.point;
      // A hunt doesn't lead out of the wall.
      const hunting = hunted !== null && away(target, soon) < soon.radius - WALL_MARGIN;
      const point = hunting ? target : home.point;
      const radius = Math.min(RALLY_RADIUS + RALLY_PER_SEAT * members.length, Math.max(3, state.next.radius * 0.6));
      const safeLeader = away(leader.position, soon) < soon.radius - WALL_MARGIN;
      const behind = standing.some((m) => m !== leader && flat(m.position, leader.position) > STRAGGLER);
      const revivers = this.#revives(members, standing, wall, state, time);
      for (const [slot, seat] of members.entries()) {
        if (!seat.bot) continue;
        const inDanger = away(seat.position, wall) > wall.radius - WALL_MARGIN || away(seat.position, soon) > soon.radius - WALL_MARGIN;
        // To the leader when strayed or when a person leads, unless the leader is where the Ring is.
        const stray = seat !== leader && flat(seat.position, leader.position) > FOLLOW;
        const toLeader = safeLeader && !inDanger && (stray || person) && seat !== leader;
        orders.set(seat.id, {
          rally: toLeader ? leader.position : point,
          radius,
          hurry: inDanger,
          hunt: hunting,
          wait: seat === leader && behind && !inDanger,
          engage,
          revive: seat.downed ? null : (revivers.get(seat.id) ?? null),
          slot,
          mates: Math.max(0, standing.length - (seat.downed ? 0 : 1)),
        });
      }
    }
    for (const team of this.#rallies.keys()) if (!squads.has(team)) this.#rallies.delete(team);
    return orders;
  }

  /** Each Downed seat worth trying for, and the nearest bot of its Squad on its feet to do it. */
  #revives(members: readonly PlannedSeat[], standing: readonly PlannedSeat[], wall: Circle, state: BattleRoyaleState, time: number): Map<PlayerId, Vec3> {
    const out = new Map<PlayerId, Vec3>();
    const R = STATS.royale;
    for (const seat of members) {
      if (!seat.downed) continue;
      let best: PlannedSeat | null = null;
      for (const m of standing) {
        if (!m.bot || out.has(m.id)) continue;
        if (!best || flat(m.position, seat.position) < flat(best.position, seat.position)) best = m;
      }
      if (!best) continue;
      const need = flat(best.position, seat.position) / RUN + R.reviveTime.value * (1 - seat.downed.revive) + REVIVE_SPARE;
      if (need > seat.downed.bleedOut) continue;
      const later = wallAt(state, time + need);
      const inside = (c: Circle) => away(seat.position, c) < c.radius - REVIVE_WALL;
      if (!inside(wall) || !inside(later)) continue;
      out.set(best.id, seat.position);
    }
    return out;
  }
}
