import type { PlayerId, SimEvent, TeamId } from '../simulation';
import type { MatchEntrant, ModeContext, ModeEvent, Score, SpawnPoint, Zone } from './game-mode';
import { ScoreKeeper } from './score';
import { RecentSpawns, distinctSpawns, occupied, overrun, scoredSpawn, shuffledOrder } from './spawns';

/** The two teams: blue, then orange. */
export const TEAMS: readonly [TeamId, TeamId] = [1, 2];
export const TEAM_NAMES: Readonly<Record<TeamId, string>> = { 1: 'Blue', 2: 'Orange' };

/** A player's row in a team mode. */
export interface TeamEntry {
  readonly id: PlayerId;
  readonly name: string;
  team: TeamId;
  kills: number;
  deaths: number;
  /** Join order, so ties are settled the same way every time. */
  readonly order: number;
  /** Placed on a side that balancing never moves them from (humans vs bots). */
  readonly fixed?: boolean;
}

/**
 * Who is on which team in a two-team mode, and where they spawn: shared by
 * team deathmatch and the objective modes. Joiners go to the smaller team
 * (on a tie, the one behind on score); teams are rebalanced at match start
 * with as few moves as possible. A player's first spawn of a match is at
 * their team's spawn set (which set is drawn each match where the mode
 * asks), unless enemies stand in it, taken in an order drawn afresh each
 * match and round; later spawns are out of enemy sight,
 * near teammates and away from enemies, drawn among the safest.
 */
export class TeamRoster {
  readonly #entries = new Map<PlayerId, TeamEntry>();
  #order = 0;
  /** Players who have spawned since the match started. */
  readonly #spawned = new Set<PlayerId>();
  /** Rotates through each team's first spawns. */
  readonly #nextFirst = new Map<TeamId, number>();
  /** This match's (or round's) order of each team's first spawns. */
  readonly #firstOrder = new Map<TeamId, readonly number[]>();
  readonly #recent = new RecentSpawns();
  /** Kills of those who left this match, kept with the team they were scored for: a team's tally never drops when someone goes. */
  readonly #banked = new Map<TeamId, number>();
  readonly #random: () => number;
  /** Whether each match draws which team starts at which spawn set (see the constructor). */
  readonly #drawSides: boolean;
  /** This match's draw: the first team starts at the second set, and the second at the first. */
  #swapped = false;
  /** Everyone's Score: the kills are read in {@link recordKills}, and the mode adds its own awards. */
  readonly score = new ScoreKeeper();

  /**
   * `random` (0 to 1, like `Math.random`, its default) draws where players
   * spawn. With `drawSides`, each match also draws which end of the map each
   * team starts at, as well-loved shooters do, so a team doesn't open every
   * match on the same yard and the same view (a draw under one half keeps the
   * map's order, so a `random` of 0 always does). A mode whose sides mean
   * something (Charge's attackers and defenders) leaves it off.
   */
  constructor(random: () => number = Math.random, drawSides = false) {
    this.#random = random;
    this.#drawSides = drawSides;
  }

  get(id: PlayerId): TeamEntry | undefined {
    return this.#entries.get(id);
  }

  entries(): TeamEntry[] {
    return [...this.#entries.values()];
  }

  members(team: TeamId): TeamEntry[] {
    return this.entries().filter((e) => e.team === team);
  }

  /** Adds a joiner to `side` when given, otherwise to the smaller team, or on a tie the one behind on `standing`. */
  join(id: PlayerId, name: string, standing: (team: TeamId) => number, side?: TeamId): TeamId {
    const [a, b] = TEAMS;
    const size = (t: TeamId) => this.members(t).length;
    const team = side ?? (size(a) !== size(b) ? (size(a) < size(b) ? a : b) : standing(a) <= standing(b) ? a : b);
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0, order: this.#order++, fixed: side !== undefined });
    this.score.join(id);
    return team;
  }

  /** Kills this match by those of `team` who have left it. */
  banked(team: TeamId): number {
    return this.#banked.get(team) ?? 0;
  }

  leave(id: PlayerId): void {
    const gone = this.#entries.get(id);
    if (gone && gone.kills > 0) this.#banked.set(gone.team, this.banked(gone.team) + gone.kills);
    this.#entries.delete(id);
    this.#spawned.delete(id);
    this.#recent.forget(id);
    this.score.leave(id);
  }

  /** A player back from a drop: their row as they left it, already spawned. */
  rejoin(score: Score): void {
    // Their kills were kept with the team when they left: they come back with them.
    if (score.kills > 0) this.#banked.set(score.team, Math.max(0, this.banked(score.team) - score.kills));
    this.#entries.set(score.id, { id: score.id, name: score.name, team: score.team, kills: score.kills, deaths: score.deaths, order: this.#order++ });
    this.score.rejoin(score);
    this.#spawned.add(score.id);
  }

  /** A new match: everyone's row from zero, teams kept where possible and evened out with the fewest moves. */
  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#entries.clear();
    this.#banked.clear();
    this.#spawned.clear();
    this.#nextFirst.clear();
    this.#firstOrder.clear();
    this.#recent.clear();
    this.#swapped = this.#drawSides && this.#random() >= 0.5;
    const [a, b] = TEAMS;
    const add = (e: MatchEntrant, team: TeamId) => this.#entries.set(e.id, { id: e.id, name: e.name, team, kills: 0, deaths: 0, order: this.#order++, fixed: e.side !== undefined });
    this.score.start(entrants.map((e) => e.id));
    // Players with a side take it; the rest keep their team where they had one, then fill the smaller team.
    const unplaced: MatchEntrant[] = [];
    for (const e of entrants) {
      if (e.side !== undefined) add(e, e.side);
      else if (e.team === a || e.team === b) add(e, e.team);
      else unplaced.push(e);
    }
    for (const e of unplaced) add(e, this.members(a).length <= this.members(b).length ? a : b);
    // Then the fewest moves that even the teams out: the latest joiners of the bigger team cross over (never one with a side).
    for (;;) {
      const big = this.members(a).length > this.members(b).length + 1 ? a : this.members(b).length > this.members(a).length + 1 ? b : null;
      const mover = big === null ? undefined : this.members(big).filter((e) => !e.fixed).sort((x, y) => y.order - x.order)[0];
      if (!mover) break;
      mover.team = big === a ? b : a;
    }
    return new Map(this.entries().map((e) => [e.id, e.team]));
  }

  /** A new round of a round-based mode: everyone's next spawn is a first spawn again, at their side's set. */
  newRound(): void {
    this.#spawned.clear();
    this.#nextFirst.clear();
    this.#firstOrder.clear();
    this.#recent.clear();
  }

  /**
   * Whether a spawn lies on `team`'s own side of the map this match: nearer
   * its own team set (after this match's swap of ends) than the other's. Always
   * true on a map without two team sets.
   */
  onOwnSide(team: TeamId, ctx: ModeContext): (spawn: SpawnPoint) => boolean {
    const sets = ctx.teamSpawns;
    const i = this.#swapped ? 1 - TEAMS.indexOf(team) : TEAMS.indexOf(team);
    const own = sets?.[i];
    const other = sets?.[1 - i];
    if (!own?.length || !other?.length) return () => true;
    const nearest = (set: readonly SpawnPoint[], s: SpawnPoint) => Math.min(...set.map((p) => Math.hypot(p.position[0] - s.position[0], p.position[2] - s.position[2])));
    return (spawn) => nearest(own, spawn) < nearest(other, spawn);
  }

  /**
   * Where `id` spawns: the next free spot of their team's own set (in this
   * match's drawn order) on their first spawn of the match, otherwise the safest spawn anywhere (see
   * {@link scoredSpawn}), preferring those the mode `favoured` most (a higher
   * tier first) among the ones that pass the same safety rules.
   */
  spawn(id: PlayerId, ctx: ModeContext, favoured?: (spawn: SpawnPoint) => boolean | number): SpawnPoint {
    const team = this.#entries.get(id)?.team ?? TEAMS[0];
    const first = !this.#spawned.has(id);
    // Only players placed this match count: the rest still stand where the last match left them.
    const living = ctx.players.filter((p) => p.id !== id && p.alive && this.#spawned.has(p.id));
    this.#spawned.add(id);
    const mates = living.filter((p) => p.team === team);
    const enemies = living.filter((p) => p.team !== team);
    const own = ctx.teamSpawns?.[this.#swapped ? 1 - TEAMS.indexOf(team) : TEAMS.indexOf(team)] ?? null;
    if (first && own && own.length > 0) {
      // The next of the team's own spawns with no enemy on it (at match start, all of them), and no teammate on it while one is free;
      // a joiner mid-match whose yard is overrun spawns as on a respawn.
      const i = this.#nextFirst.get(team) ?? 0;
      let order = this.#firstOrder.get(team);
      if (order?.length !== own.length) this.#firstOrder.set(team, (order = shuffledOrder(own.length, this.#random)));
      const free = (spawn: SpawnPoint) => !occupied(spawn, mates);
      for (const ok of [free, () => true]) {
        for (let k = 0; k < own.length; k++) {
          const spawn = own[order[(i + k) % own.length]!] as SpawnPoint;
          if (overrun(spawn, enemies) || !ok(spawn)) continue;
          this.#nextFirst.set(team, i + k + 1);
          return this.#recent.add(id, spawn);
        }
      }
    }
    const candidates = distinctSpawns([...(ctx.teamSpawns ?? []).flat(), ...ctx.spawns]);
    const spawn = scoredSpawn(candidates, mates, enemies, ctx, this.#recent.of(id), favoured, this.#random);
    if (!spawn) throw new Error('No spawn points');
    return this.#recent.add(id, spawn);
  }

  /**
   * Kills and deaths from a tick's kill events (counted only while `scoring`), their Score, and the kill feed.
   * With `zones`, a kill made from inside one, or of someone standing in one, pays the zone-kill bonus.
   */
  recordKills(events: readonly SimEvent[], scoring: boolean, ctx: ModeContext, zones?: readonly Zone[]): { feed: ModeEvent[]; killers: TeamEntry[] } {
    this.score.read(events, {
      time: ctx.time,
      scoring,
      team: (id) => this.#entries.get(id)?.team,
      ...(zones ? { zones, position: (id: PlayerId) => ctx.players.find((p) => p.id === id)?.position } : {}),
    });
    const feed: ModeEvent[] = [];
    const killers: TeamEntry[] = [];
    const headshots = new Set<PlayerId>();
    for (const e of events) if (e.type === 'hit' && e.killed && e.zone === 'head') headshots.add(e.victim);
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const victim = this.#entries.get(e.victim);
      if (!victim) continue; // a dummy
      if (scoring) victim.deaths += 1;
      const killer = e.killer === null || e.killer === e.victim ? undefined : this.#entries.get(e.killer);
      if (killer && scoring && killer.team !== victim.team) {
        killer.kills += 1;
        killers.push(killer);
      }
      feed.push({
        type: 'killFeed',
        killer: killer?.id ?? null,
        killerName: killer?.name ?? null,
        victim: victim.id,
        victimName: victim.name,
        cause: e.cause,
        weapon: e.weapon,
        headshot: headshots.has(e.victim),
      });
    }
    return { feed, killers };
  }

  /** The scoreboard, grouped by team, the best Score first. */
  scores(): Score[] {
    return this.entries()
      .map((e): Score => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, ...this.score.of(e.id) }))
      .sort((x, y) => x.team - y.team || y.score - x.score || y.kills - x.kills || x.deaths - y.deaths);
  }
}
