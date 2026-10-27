import type { PlayerId, SimEvent, TeamId } from '../simulation';
import type { MatchEntrant, ModeContext, ModeEvent, Score, SpawnPoint } from './game-mode';
import { RecentSpawns, distinctSpawns, overrun, scoredSpawn } from './spawns';

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
  /** Points the mode gives beyond kills (captures, plants, ...). */
  points: number;
  /** Join order, so ties are settled the same way every time. */
  readonly order: number;
}

/**
 * Who is on which team in a two-team mode, and where they spawn: shared by
 * team deathmatch and the objective modes. Joiners go to the smaller team
 * (on a tie, the one behind on score); teams are rebalanced at match start
 * with as few moves as possible. A player's first spawn of a match is at
 * their team's spawn set, unless enemies stand in it; later spawns are out
 * of enemy sight, near teammates and away from enemies.
 */
export class TeamRoster {
  readonly #entries = new Map<PlayerId, TeamEntry>();
  #order = 0;
  /** Players who have spawned since the match started. */
  readonly #spawned = new Set<PlayerId>();
  /** Rotates through each team's first spawns. */
  readonly #nextFirst = new Map<TeamId, number>();
  readonly #recent = new RecentSpawns();

  get(id: PlayerId): TeamEntry | undefined {
    return this.#entries.get(id);
  }

  entries(): TeamEntry[] {
    return [...this.#entries.values()];
  }

  members(team: TeamId): TeamEntry[] {
    return this.entries().filter((e) => e.team === team);
  }

  /** Adds a joiner to the smaller team, or on a tie the one behind on `standing`. */
  join(id: PlayerId, name: string, standing: (team: TeamId) => number): TeamId {
    const [a, b] = TEAMS;
    const size = (t: TeamId) => this.members(t).length;
    const team = size(a) !== size(b) ? (size(a) < size(b) ? a : b) : standing(a) <= standing(b) ? a : b;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0, points: 0, order: this.#order++ });
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
    this.#spawned.delete(id);
    this.#recent.forget(id);
  }

  /** A player back from a drop: their row as they left it, already spawned. */
  rejoin(score: Score): void {
    this.#entries.set(score.id, { id: score.id, name: score.name, team: score.team, kills: score.kills, deaths: score.deaths, points: score.score - score.kills, order: this.#order++ });
    this.#spawned.add(score.id);
  }

  /** A new match: everyone's row from zero, teams kept where possible and evened out with the fewest moves. */
  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#entries.clear();
    this.#spawned.clear();
    this.#nextFirst.clear();
    this.#recent.clear();
    const [a, b] = TEAMS;
    const add = (e: MatchEntrant, team: TeamId) => this.#entries.set(e.id, { id: e.id, name: e.name, team, kills: 0, deaths: 0, points: 0, order: this.#order++ });
    // Players keep their team where they had one; the rest fill the smaller team.
    const unplaced: MatchEntrant[] = [];
    for (const e of entrants) {
      if (e.team === a || e.team === b) add(e, e.team);
      else unplaced.push(e);
    }
    for (const e of unplaced) add(e, this.members(a).length <= this.members(b).length ? a : b);
    // Then the fewest moves that even the teams out: the latest joiners of the bigger team cross over.
    for (;;) {
      const big = this.members(a).length > this.members(b).length + 1 ? a : this.members(b).length > this.members(a).length + 1 ? b : null;
      if (big === null) break;
      const mover = this.members(big).sort((x, y) => y.order - x.order)[0] as TeamEntry;
      mover.team = big === a ? b : a;
    }
    return new Map(this.entries().map((e) => [e.id, e.team]));
  }

  /** A new round of a round-based mode: everyone's next spawn is a first spawn again, at their side's set. */
  newRound(): void {
    this.#spawned.clear();
    this.#nextFirst.clear();
    this.#recent.clear();
  }

  /**
   * Where `id` spawns: the next free spot of their team's own set on their
   * first spawn of the match, otherwise the safest spawn anywhere (see
   * {@link scoredSpawn}), preferring those `favoured` ones that pass the
   * same safety rules.
   */
  spawn(id: PlayerId, ctx: ModeContext, favoured?: (spawn: SpawnPoint) => boolean): SpawnPoint {
    const team = this.#entries.get(id)?.team ?? TEAMS[0];
    const first = !this.#spawned.has(id);
    // Only players placed this match count: the rest still stand where the last match left them.
    const living = ctx.players.filter((p) => p.id !== id && p.alive && this.#spawned.has(p.id));
    this.#spawned.add(id);
    const mates = living.filter((p) => p.team === team);
    const enemies = living.filter((p) => p.team !== team);
    const own = ctx.teamSpawns?.[TEAMS.indexOf(team)] ?? null;
    if (first && own && own.length > 0) {
      // The next of the team's own spawns with no enemy on it (at match start, all of them); a joiner mid-match whose yard is overrun spawns as on a respawn.
      const i = this.#nextFirst.get(team) ?? 0;
      for (let k = 0; k < own.length; k++) {
        const spawn = own[(i + k) % own.length] as SpawnPoint;
        if (overrun(spawn, enemies)) continue;
        this.#nextFirst.set(team, i + k + 1);
        return this.#recent.add(id, spawn);
      }
    }
    const candidates = distinctSpawns([...(ctx.teamSpawns ?? []).flat(), ...ctx.spawns]);
    const spawn = scoredSpawn(candidates, mates, enemies, ctx, this.#recent.of(id), favoured);
    if (!spawn) throw new Error('No spawn points');
    return this.#recent.add(id, spawn);
  }

  /** Kills and deaths from a tick's kill events (counted only while `scoring`), and the kill feed. */
  recordKills(events: readonly SimEvent[], scoring: boolean): { feed: ModeEvent[]; killers: TeamEntry[] } {
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

  /** The scoreboard: each row's score is its kills plus its points, grouped by team, best first. */
  scores(): Score[] {
    return this.entries()
      .map((e) => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, score: e.kills + e.points }))
      .sort((x, y) => x.team - y.team || y.score - x.score || x.deaths - y.deaths);
  }
}
