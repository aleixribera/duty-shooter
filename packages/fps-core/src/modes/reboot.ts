import type { Vec3 } from '../math';
import type { PlayerId, PlayerOutput, SimEvent, TeamId } from '../simulation';
import { STATS } from '../stats';
import type { BeaconState, ModeContext, ModeEvent, RebootCardState } from './game-mode';
import type { PlayGround } from './ground';

const R = STATS.royale.reboot;
/** Seats brought back at one Beacon stand this far (m) from its middle, round it. */
const AROUND = 1.6;
/** A Card lies or a Beacon is reached across this much height (m), no more: not through a floor. */
const TALL = 2;

interface Card {
  readonly owner: PlayerId;
  readonly team: TeamId;
  position: Vec3 | null;
  until: number;
  carrier: PlayerId | null;
}

interface Beacon {
  readonly position: Vec3;
  channel: { by: PlayerId; since: number } | null;
  ready: number;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Where an island's Reboot Beacons stand: `count` spots of its open land spread
 * as evenly as they go (each the farthest from those already chosen), the
 * same every match, so the map knows them.
 */
export function planBeacons(ground: PlayGround, count = R.beacons.value): Vec3[] {
  const [cx, cz] = ground.centre;
  const first = ground.near(cx, cz, ground.radius)[0];
  if (first === undefined) return [];
  const chosen: Vec3[] = [[...ground.spot(first)] as Vec3];
  // A coarse sample of the land is plenty for the spread.
  const step = Math.max(1, Math.floor(ground.count / 4000));
  const far = new Float64Array(Math.ceil(ground.count / step)).fill(Infinity);
  while (chosen.length < count) {
    const last = chosen[chosen.length - 1]!;
    let best = -1;
    for (let k = 0, i = 0; i < ground.count; i += step, k++) {
      const s = ground.spot(i);
      far[k] = Math.min(far[k]!, Math.hypot(s[0] - last[0], s[2] - last[2]));
      if (best < 0 || far[k]! > far[best]!) best = k;
    }
    if (best < 0 || far[best]! <= 0) break;
    chosen.push([...ground.spot(best * step)] as Vec3);
  }
  return chosen;
}

/**
 * A Battle Royale's Reboot (Duos and Trios): a seat that goes out drops its
 * Reboot Card where it fell, for its time; a squadmate on their feet walking
 * over it carries it; holding use at a ready Beacon for the channel brings back
 * every Card carried, there, with the seat's loadout, half health and a frag,
 * and rests the Beacon. A carrier that goes out drops the Cards it carried.
 * Cards with nobody left on their feet to carry them are void, and so is all of
 * Reboot once the last Stages begin. Bots and people use the same rules.
 */
export class Reboot {
  #cards: Card[] = [];
  #beacons: Beacon[] = [];
  #open = false;
  /** Seats brought back this tick: the tick's look at the seats (taken before) still has them out. */
  #back = new Set<PlayerId>();
  /** The Stage Reboot closes at (1-based), or 0 when it never opens. */
  #closesAt = 0;

  /** A new match: open in Squads of two or three, until the last Stages. */
  start(beacons: readonly Vec3[], squadSize: number, stages: number): void {
    this.#cards = [];
    this.#beacons = beacons.map((position) => ({ position, channel: null, ready: 0 }));
    this.#open = squadSize > 1 && beacons.length > 0;
    this.#closesAt = Math.max(1, stages - R.lastStages.value + 1);
  }

  get open(): boolean {
    return this.#open;
  }

  /** Whether a press of use by `p` is for a Beacon: it carries a Card and stands at one, or is rebooting. */
  claims(p: PlayerOutput): boolean {
    if (this.#beacons.some((b) => b.channel?.by === p.id)) return true;
    if (!this.#cards.some((c) => c.carrier === p.id)) return false;
    return this.#beacons.some((b) => flat(p.position, b.position) <= R.beaconReach.value && Math.abs(p.position[1] - b.position[1]) <= TALL);
  }

  /** `id`'s Card lies or is carried, or it has just come back: they are still in it. */
  live(id: PlayerId): boolean {
    return this.#back.has(id) || this.#cards.some((c) => c.owner === id);
  }

  /** A tick: Cards dropped, carried, run out or void; Reboots begun, broken off or done. `stage` is 1-based; `nameOf` names a seat for the feed. */
  step(events: readonly SimEvent[], ctx: ModeContext, stage: number, teamOf: (id: PlayerId) => TeamId | undefined, nameOf: (id: PlayerId) => string): ModeEvent[] {
    const out: ModeEvent[] = [];
    this.#back = new Set();
    if (!this.#open) return out;
    const seats = new Map<PlayerId, PlayerOutput>();
    for (const p of ctx.players) seats.set(p.id, p);
    const standing = (p: PlayerOutput | undefined): p is PlayerOutput => p !== undefined && p.alive && !p.downed;
    const card = (c: Card, action: 'drop' | 'take' | 'expire' | 'void', player: PlayerId | null, position: Vec3): ModeEvent => ({
      type: 'card',
      action,
      owner: c.owner,
      ownerName: nameOf(c.owner),
      player,
      playerName: player === null ? null : nameOf(player),
      position,
    });
    if (stage >= this.#closesAt) {
      // The end game: no more Reboots.
      for (const b of this.#beacons) {
        if (b.channel) out.push(this.#reboot('stop', b, nameOf));
        b.channel = null;
      }
      for (const c of this.#cards) out.push(card(c, 'void', null, c.position ?? seats.get(c.carrier!)?.position ?? [0, 0, 0]));
      this.#cards = [];
      this.#open = false;
      return out;
    }
    const up = new Set<TeamId>();
    for (const p of ctx.players) if (standing(p)) up.add(p.team);
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const victim = seats.get(e.victim);
      const team = teamOf(e.victim);
      if (!victim || team === undefined) continue;
      const at: Vec3 = [victim.position[0], victim.position[1], victim.position[2]];
      // The Cards it carried fall with it, their time started over.
      for (const c of this.#cards) {
        if (c.carrier !== e.victim) continue;
        c.carrier = null;
        c.position = at;
        c.until = ctx.time + R.cardTime.value;
        out.push(card(c, 'drop', null, at));
      }
      // A Squad going out takes its Cards with it.
      if (!up.has(team) || this.#cards.some((c) => c.owner === e.victim)) continue;
      const c: Card = { owner: e.victim, team, position: at, until: ctx.time + R.cardTime.value, carrier: null };
      this.#cards.push(c);
      out.push(card(c, 'drop', null, at));
    }
    // Run out, or nobody of its Squad left on their feet to carry it.
    this.#cards = this.#cards.filter((c) => {
      const where = c.position ?? seats.get(c.carrier!)?.position ?? [0, 0, 0];
      if (c.position && ctx.time >= c.until - 1e-9) out.push(card(c, 'expire', null, where));
      else if (!up.has(c.team)) out.push(card(c, 'void', null, where));
      else return true;
      return false;
    });
    // A squadmate on their feet walking over a Card carries it.
    for (const c of this.#cards) {
      if (!c.position) continue;
      let best: PlayerOutput | null = null;
      for (const p of ctx.players) {
        if (!standing(p) || p.team !== c.team || p.id === c.owner) continue;
        if (flat(p.position, c.position) > R.cardReach.value || Math.abs(p.position[1] - c.position[1]) > TALL) continue;
        if (!best || flat(p.position, c.position) < flat(best.position, c.position)) best = p;
      }
      if (!best) continue;
      out.push(card(c, 'take', best.id, c.position));
      c.carrier = best.id;
      c.position = null;
    }
    // Reboots: begun by holding use at a ready Beacon with Cards, broken off by letting go, stepping away or going down.
    const carries = (id: PlayerId) => this.#cards.some((c) => c.carrier === id);
    const near = (p: PlayerOutput, b: Beacon) => flat(p.position, b.position) <= R.beaconReach.value && Math.abs(p.position[1] - b.position[1]) <= TALL;
    for (const b of this.#beacons) {
      if (b.channel) {
        const by = seats.get(b.channel.by);
        if (!standing(by) || !ctx.using.has(by.id) || !near(by, b) || !carries(by.id)) {
          out.push(this.#reboot('stop', b, nameOf));
          b.channel = null;
        } else if (ctx.time - b.channel.since >= R.channel.value - 1e-9) {
          const back = this.#cards.filter((c) => c.carrier === by.id);
          this.#cards = this.#cards.filter((c) => c.carrier !== by.id);
          back.forEach((c, i) => {
            const turn = (i / back.length) * Math.PI * 2 + 0.6;
            const at: Vec3 = [b.position[0] + Math.cos(turn) * AROUND, b.position[1] + 0.05, b.position[2] + Math.sin(turn) * AROUND];
            this.#back.add(c.owner);
            ctx.act?.respawn?.(c.owner, at, Math.atan2(at[0] - b.position[0], at[2] - b.position[2]), { health: R.health.value, frags: R.frags.value, tacticals: R.tacticals.value });
          });
          out.push(this.#reboot('done', b, nameOf, back.map((c) => c.owner)));
          b.channel = null;
          b.ready = ctx.time + R.cooldown.value;
        }
        continue;
      }
      if (ctx.time < b.ready) continue;
      for (const p of ctx.players) {
        if (!standing(p) || !ctx.using.has(p.id) || !near(p, b) || !carries(p.id) || this.#beacons.some((o) => o.channel?.by === p.id)) continue;
        b.channel = { by: p.id, since: ctx.time };
        out.push(this.#reboot('start', b, nameOf));
        break;
      }
    }
    return out;
  }

  #reboot(action: 'start' | 'stop' | 'done', b: Beacon, nameOf: (id: PlayerId) => string, seats?: readonly PlayerId[]): ModeEvent {
    const by = b.channel!.by;
    const back = seats ?? this.#cards.filter((c) => c.carrier === by).map((c) => c.owner);
    return { type: 'reboot', action, player: by, playerName: nameOf(by), beacon: this.#beacons.indexOf(b), seats: back, names: back.map(nameOf), position: b.position };
  }

  /** The Beacons as everyone is told of them, while Reboot is open. */
  beacons(): BeaconState[] {
    if (!this.#open) return [];
    return this.#beacons.map((b) => ({
      position: b.position,
      ...(b.channel ? { channel: { by: b.channel.by, since: b.channel.since } } : {}),
      ...(b.ready > 0 ? { ready: b.ready } : {}),
    }));
  }

  /** The Cards lying or carried, for the snapshot. */
  cards(): RebootCardState[] {
    return this.#cards.map((c) => ({ owner: c.owner, team: c.team, ...(c.position ? { position: c.position, until: c.until } : {}), ...(c.carrier ? { carrier: c.carrier } : {}) }));
  }
}
