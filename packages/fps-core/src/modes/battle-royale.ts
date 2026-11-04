import type { Vec3 } from '../math';
import { seededRandom } from '../random';
import type { PlayerId, PlayerInfo, PlayerOutput, SimEvent, TeamId } from '../simulation';
import { STATS } from '../stats';
import type { BattleRoyaleState, GameMode, MatchEntrant, MatchResult, ModeContext, ModeEvent, ObjectiveState, RoyaleChampion, Score, SpawnPoint, TeamScore } from './game-mode';
import { groundFromSpawns, squadSpots } from './ground';
import { planRing, ringDamage, stageAt, type RingStage } from './ring';
import { WIDE_SCALE } from './scale';
import { Reboot, planBeacons } from './reboot';
import { SupplyDrops } from './supply-drops';

/** Seats a Squad: Solos, Duos or Trios. */
export type SquadSize = 1 | 2 | 3;

export interface BattleRoyaleOptions {
  /** Defaults to Solos. */
  readonly squadSize?: SquadSize;
  /** Seconds a match lasts at most; the Ring keeps to it. Defaults to the stats file's match length. */
  readonly timeLimit?: number;
  /** Every match's seed, which fixes its spawns and circles; a fresh one a match when absent. */
  readonly seed?: number;
  /** Draws each match's seed (0 to 1, like `Math.random`, its default). */
  readonly random?: () => number;
}

interface Entry {
  id: PlayerId;
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
}

const seatNumber = (id: PlayerId): number => Number(id.slice(1));

/** Eliminations that make a Kill Leader (owner, ticket 69). */
export const KILL_LEADER = 3;

/** Each island's Reboot Beacons, found once for every match played on it. */
const BEACONS = new WeakMap<object, Vec3[]>();
function beaconsOf(ground: Parameters<typeof planBeacons>[0]): Vec3[] {
  let beacons = BEACONS.get(ground);
  if (!beacons) BEACONS.set(ground, (beacons = planBeacons(ground)));
  return beacons;
}

/**
 * Battle Royale: 60 seats in Squads, one life, 3 frags, and a Ring that closes
 * until one Squad is left. A Squad is a team id, so everything that asks about
 * teams (friendly fire, who a client keeps in view) works on Squads as it is.
 */
export class BattleRoyale implements GameMode {
  readonly id = 'battle-royale';
  readonly name = 'Battle Royale';
  readonly respawnDelay = 0;
  readonly killLimit = null;
  readonly scoreLimit = null;
  readonly timeLimit: number;
  readonly fixedSeats = WIDE_SCALE.seats;
  readonly frags = STATS.royale.frags.value;
  /** Seats a Squad; the lobby's host may change it between matches. */
  squadSize: SquadSize;
  readonly #seed: number | null;
  readonly #random: () => number;
  readonly #entries = new Map<PlayerId, Entry>();
  #result: MatchResult | null = null;
  #ring: readonly RingStage[] = [];
  #stage = 0;
  /** Simulation time the match clock started, for the times a client counts to. */
  #clock = 0;
  /** Spawns not handed out yet, by Squad. */
  readonly #spawns = new Map<TeamId, SpawnPoint[]>();
  /** The Squads the match started with. */
  #squads = 0;
  /** Each Squad out, and the place it finished in. */
  readonly #places = new Map<TeamId, number>();
  /** Who was alive at the last look: the last seats, if one tick takes them all. */
  #living: readonly PlayerId[] = [];
  #squadsAlive = 0;
  /** A person has had a seat in this match. */
  #peopled = false;
  /** The crates that bring the sniper, and the weapons on the ground. */
  readonly #drops = new SupplyDrops();
  /** Reboot Cards and Beacons (Duos and Trios). */
  readonly #reboot = new Reboot();
  /** The seat with the most eliminations, from `KILL_LEADER` on: a tie keeps the one who got there first. */
  #leader: Entry | null = null;
  /** The Squads with anyone standing at the last look, to call each one out as it goes. */
  readonly #standing = new Set<TeamId>();
  /** Who last put a seat of each Squad out (null: the Ring, a fall), for its wipe's line. */
  readonly #lastBy = new Map<TeamId, string | null>();
  /** The Squad this match introduces as champions: the last match's winners, or else its Kill Leader's. */
  #champion: RoyaleChampion | null = null;

  constructor(options: BattleRoyaleOptions = {}) {
    this.squadSize = options.squadSize ?? 1;
    this.timeLimit = options.timeLimit ?? STATS.royale.matchLength.value;
    this.#seed = options.seed ?? null;
    this.#random = options.random ?? Math.random;
  }

  /** This match's circles. */
  get ring(): readonly RingStage[] {
    return this.#ring;
  }

  /** Nobody joins a match under way (the server has them spectate): only a seat the server insists on comes here, as a Squad of one. */
  join(id: PlayerId, name: string): TeamId {
    const team = Math.max(0, ...[...this.#entries.values()].map((e) => e.team)) + 1;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0 });
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
  }

  rejoin(score: Score): void {
    this.#entries.set(score.id, { id: score.id, name: score.name, team: score.team, kills: score.kills, deaths: score.deaths });
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id && attacker.team !== victim.team;
  }

  canRespawn(): boolean {
    return false;
  }

  /** Solos have nobody to Revive them. */
  downs(): boolean {
    return this.squadSize > 1;
  }

  frozen(): boolean {
    return false;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    return this.#spawns.get(this.#entries.get(id)?.team ?? 0)?.shift() ?? ctx.spawns[0]!;
  }

  start(entrants: readonly MatchEntrant[], ctx?: ModeContext): ReadonlyMap<PlayerId, TeamId> {
    if (!ctx) throw new Error('A Battle Royale needs its map');
    // The last match, before it is cleared away: who won it, and who led it.
    const won = this.#result?.winner ?? null;
    const winners = won === null ? [] : [...this.#entries.values()].filter((e) => e.team === won).map((e) => e.id);
    const leader = this.#leader ? { id: this.#leader.id, kills: this.#leader.kills } : null;
    this.#entries.clear();
    this.#leader = null;
    this.#standing.clear();
    this.#lastBy.clear();
    this.#spawns.clear();
    this.#places.clear();
    this.#result = null;
    this.#stage = 0;
    this.#peopled = false;
    const teams = squadTeams(entrants, this.squadSize);
    for (const e of entrants) this.#entries.set(e.id, { id: e.id, name: e.name, team: teams.get(e.id)!, kills: 0, deaths: 0 });
    this.#squads = new Set(teams.values()).size;
    this.#champion = this.#crown(winners, leader);
    this.#squadsAlive = this.#squads;
    this.#living = [...teams.keys()];
    const seed = this.#seed ?? Math.floor(this.#random() * 2 ** 32);
    const ground = ctx.ground ?? groundFromSpawns(ctx.spawns);
    this.#ring = planRing(ground, seededRandom(seed), this.timeLimit);
    squadSpots(ground, this.#squads, this.squadSize, seededRandom(seed ^ 0x5bd1e995)).forEach((spawns, i) => this.#spawns.set(i + 1, spawns));
    this.#drops.start(this.#ring, ground, seededRandom(seed ^ 0x2f6b1c3d), ctx.world);
    this.#reboot.start(this.squadSize > 1 ? beaconsOf(ground) : [], this.squadSize, this.#ring.length);
    return teams;
  }

  hazardAt(position: Vec3, matchTime: number): number {
    return ringDamage(this.#ring, position, matchTime);
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    this.#clock = ctx.time - ctx.matchTime;
    const out: ModeEvent[] = [];
    const stage = stageAt(this.#ring, ctx.matchTime);
    if (this.#ring.length > 0 && stage !== this.#stage) {
      this.#stage = stage;
      out.push({ type: 'stage', stage: stage + 1 });
    }
    // A press of use that starts a Revive or a Reboot doesn't also swap guns with one lying there.
    const reach = STATS.royale.reviveReach.value;
    const revives = (p: PlayerOutput) =>
      this.squadSize > 1 && ctx.players.some((o) => o.id !== p.id && o.team === p.team && o.alive && o.downed !== null && Math.hypot(o.position[0] - p.position[0], o.position[2] - p.position[2]) <= reach && Math.abs(o.position[1] - p.position[1]) <= reach);
    out.push(...this.#drops.step(events, ctx, (p) => this.#reboot.claims(p) || revives(p)));
    out.push(...this.#reboot.step(events, ctx, this.#stage + 1, (id) => this.#entries.get(id)?.team, (id) => this.#entries.get(id)?.name ?? id));
    const headshots = new Set<PlayerId>();
    for (const e of events) if (e.type === 'hit' && e.killed && e.zone === 'head') headshots.add(e.victim);
    for (const e of events) {
      if (e.type === 'down') {
        const victim = this.#entries.get(e.victim);
        const by = e.attacker === null || e.attacker === e.victim ? undefined : this.#entries.get(e.attacker);
        if (victim) out.push({ type: 'killFeed', killer: by?.id ?? null, killerName: by?.name ?? null, victim: victim.id, victimName: victim.name, cause: e.cause, weapon: e.weapon, headshot: e.zone === 'head', down: true });
      }
      if (e.type !== 'kill') continue;
      const victim = this.#entries.get(e.victim);
      if (!victim) continue;
      victim.deaths += 1;
      const killer = e.killer === null || e.killer === e.victim ? undefined : this.#entries.get(e.killer);
      if (killer) killer.kills += 1;
      out.push({ type: 'killFeed', killer: killer?.id ?? null, killerName: killer?.name ?? null, victim: victim.id, victimName: victim.name, cause: e.cause, weapon: e.weapon, headshot: headshots.has(e.victim) });
      this.#lastBy.set(victim.team, killer?.name ?? null);
      if (killer && killer.kills >= KILL_LEADER && killer !== this.#leader && killer.kills > (this.#leader?.kills ?? 0)) {
        this.#leader = killer;
        out.push({ type: 'killLeader', player: killer.id, name: killer.name, team: killer.team, kills: killer.kills });
      }
    }
    out.push(...this.#wiped(ctx));
    return out;
  }

  /** Each Squad of Duos or Trios with nobody left standing since the last look, once: who finished it and how many Squads remain. */
  #wiped(ctx: ModeContext): ModeEvent[] {
    const standing = new Set<TeamId>();
    for (const p of ctx.players) {
      const team = p.alive && !p.downed ? this.#entries.get(p.id)?.team : undefined;
      if (team !== undefined) standing.add(team);
    }
    const out: ModeEvent[] = [];
    for (const team of this.#standing) {
      if (standing.has(team)) continue;
      const names = [...this.#entries.values()].filter((e) => e.team === team).map((e) => e.name);
      // In Solos the kill feed says it; a Squad that left the server has nobody to name.
      if (this.squadSize < 2 || names.length === 0) continue;
      out.push({ type: 'squadOut', team, names, by: this.#lastBy.get(team) ?? null, squadsLeft: standing.size });
    }
    this.#standing.clear();
    for (const team of standing) this.#standing.add(team);
    return out;
  }

  /** This match's champions: the Squad holding any of `winners`, else the one holding the last Kill Leader. */
  #crown(winners: readonly PlayerId[], leader: { readonly id: PlayerId; readonly kills: number } | null): RoyaleChampion | null {
    const squad = (team: TeamId) => [...this.#entries.values()].filter((e) => e.team === team).map((e) => e.name);
    const winner = winners.map((id) => this.#entries.get(id)).find((e) => e !== undefined);
    if (winner) return { team: winner.team, names: squad(winner.team), why: 'won' };
    const led = leader ? this.#entries.get(leader.id) : undefined;
    if (led && leader) return { team: led.team, names: squad(led.team), why: 'leader', kills: leader.kills };
    return null;
  }

  /** The best of `seats`: most kills, then the lowest seat. */
  #first(seats: readonly PlayerId[]): Entry | null {
    let best: Entry | null = null;
    for (const id of seats) {
      const e = this.#entries.get(id);
      if (e && (!best || e.kills > best.kills || (e.kills === best.kills && seatNumber(e.id) < seatNumber(best.id)))) best = e;
    }
    return best;
  }

  /** `team` won: its place, and the result that says so. */
  #won(team: TeamId, reason: MatchResult['reason']): MatchResult {
    this.#places.set(team, 1);
    const names = [...this.#entries.values()].filter((e) => e.team === team).map((e) => e.name);
    return { winner: team, winnerName: nameList(names), ...(names.length > 1 ? { winners: names.length } : {}), draw: false, reason };
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result || this.#squads === 0) return this.#result;
    // Being Downed isn't being alive here; a Squad going out takes its Downed seats with it the same tick.
    const seats = ctx.players.filter((p) => p.alive && this.#entries.has(p.id));
    const alive = seats.filter((p) => !p.downed);
    const squads = new Set(alive.map((p) => p.team));
    this.#squadsAlive = squads.size;
    const lastSeats = this.#living;
    this.#living = alive.map((p) => p.id);
    // Those going out this tick share a place: the one behind every Squad left.
    const place = squads.size + 1;
    for (const e of this.#entries.values()) if (!squads.has(e.team) && !this.#places.has(e.team)) this.#places.set(e.team, place);

    const people = ctx.people ?? new Set<PlayerId>();
    if (!this.#peopled) for (const id of people) if (this.#entries.has(id)) this.#peopled = true;
    if (squads.size === 0) {
      // The last seats went on one tick: a result always exists while any seat is left to give it to.
      const best = this.#first(lastSeats);
      this.#result = best ? this.#won(best.team, 'lastSquad') : { winner: null, winnerName: null, draw: false, reason: 'noHumans' };
    } else if (squads.size === 1 && this.#squads > 1) {
      this.#result = this.#won(squads.values().next().value as TeamId, 'lastSquad');
    } else if (this.#peopled && !seats.some((p) => people.has(p.id)) && ![...people].some((id) => this.#reboot.live(id))) {
      // No person in it, and none of their Cards left to bring one back.
      // The Squads still standing share the last of their places: a person out while their Squad's bots stand is placed too.
      for (const team of squads) if (!this.#places.has(team)) this.#places.set(team, squads.size);
      this.#result = { winner: null, winnerName: null, draw: false, reason: 'noHumans' };
    } else if (ctx.matchTime >= this.timeLimit - 1e-9) {
      this.#result = this.#won(this.#first(this.#living)!.team, 'timeLimit');
    }
    return this.#result;
  }

  scores(): Score[] {
    return [...this.#entries.values()]
      .map((e): Score => {
        const place = this.#places.get(e.team);
        return { id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, score: e.kills, ...(place === undefined ? {} : { place }) };
      })
      .sort((a, b) => (a.place ?? 0) - (b.place ?? 0) || b.score - a.score);
  }

  teamScores(): readonly TeamScore[] | null {
    return null;
  }

  objective(): ObjectiveState {
    const s = this.#ring[this.#stage];
    const none = { x: 0, z: 0, radius: 0 };
    const state: BattleRoyaleState = {
      kind: 'battle-royale',
      squadSize: this.squadSize,
      stage: this.#stage + 1,
      circle: s?.from ?? none,
      next: s?.to ?? none,
      shrinkAt: this.#clock + (s?.shrinkAt ?? 0),
      shrinkEnd: this.#clock + (s?.shrinkEnd ?? 0),
      damage: s?.damage ?? 0,
      alive: this.#living.length,
      squads: this.#squadsAlive,
      ...(this.#leader ? { leader: { id: this.#leader.id, name: this.#leader.name, kills: this.#leader.kills } } : {}),
      ...(this.#champion ? { champion: this.#champion } : {}),
    };
    const drops = this.#drops.drops();
    const loose = this.#drops.loose();
    const beacons = this.#reboot.beacons();
    const cards = this.#reboot.cards();
    return {
      ...state,
      ...(drops.length > 0 ? { drops } : {}),
      ...(loose.length > 0 ? { loose } : {}),
      ...(this.#reboot.open ? { reboot: true as const, beacons } : {}),
      ...(cards.length > 0 ? { cards } : {}),
    };
  }
}

/** A Squad's names as a line reads them: "Ada", "Ada and Mate", "Ada, Mate and Joan". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Each entrant's Squad (a team id from 1): those who picked the same Squad
 * together, in the order their picks first appear, then everyone else in
 * order, filling the gaps in Squads already started before opening new ones.
 * So bots fill a part-empty Squad of friends first.
 */
export function squadTeams(entrants: readonly MatchEntrant[], size: SquadSize): Map<PlayerId, TeamId> {
  const teams = new Map<PlayerId, TeamId>();
  const members: number[] = [0];
  const labels = new Map<number, TeamId>();
  const rest: MatchEntrant[] = [];
  for (const e of entrants) {
    const label = e.squad;
    let team = label === undefined ? undefined : labels.get(label);
    if (label !== undefined && team === undefined) {
      team = members.length;
      labels.set(label, team);
      members.push(0);
    }
    if (team === undefined || members[team]! >= size) rest.push(e);
    else {
      teams.set(e.id, team);
      members[team]! += 1;
    }
  }
  let open = 1;
  for (const e of rest) {
    while (open < members.length && members[open]! >= size) open += 1;
    if (open === members.length) members.push(0);
    teams.set(e.id, open);
    members[open]! += 1;
  }
  return teams;
}
