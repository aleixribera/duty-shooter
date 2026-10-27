import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type Score, type SpawnPoint, type TeamScore } from './game-mode';
import { RecentSpawns, distinctSpawns, overrun, scoredSpawn } from './spawns';

export interface TeamDeathmatchOptions {
  /** Team kills that win the match; null for none. Defaults to 75. */
  readonly killLimit?: number | null;
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
}

/** The two teams: blue, then orange. */
export const TEAMS: readonly [TeamId, TeamId] = [1, 2];
const TEAM_NAMES: Readonly<Record<TeamId, string>> = { 1: 'Blue', 2: 'Orange' };

interface Entry {
  id: PlayerId;
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
  /** Join order, so ties are settled the same way every time. */
  order: number;
}

/**
 * Team deathmatch: two teams, no friendly fire. Joiners go to the smaller
 * team (on a tie, the one behind on score); teams are rebalanced at match
 * start with as few moves as possible. A player's first spawn of a match is
 * at their team's spawn set, unless enemies stand in it; later spawns are out of enemy sight, near
 * teammates and away from enemies. The first team to the kill limit wins; at
 * the time limit the leading team wins, and a tie is a draw.
 */
export class TeamDeathmatch implements GameMode {
  readonly id = 'tdm';
  readonly name = 'Team deathmatch';
  readonly respawnDelay = RESPAWN_DELAY;
  readonly killLimit: number | null;
  readonly timeLimit: number | null;
  readonly #entries = new Map<PlayerId, Entry>();
  #order = 0;
  #result: MatchResult | null = null;
  /** Players who have spawned since the match started. */
  readonly #spawned = new Set<PlayerId>();
  /** Rotates through each team's first spawns. */
  readonly #nextFirst = new Map<TeamId, number>();
  readonly #recent = new RecentSpawns();

  constructor(options: TeamDeathmatchOptions = {}) {
    this.killLimit = options.killLimit === undefined ? 75 : options.killLimit;
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
  }

  join(id: PlayerId, name: string): TeamId {
    const [a, b] = TEAMS;
    const size = (t: TeamId) => this.#members(t).length;
    const score = (t: TeamId) => this.#teamScore(t);
    const team = size(a) !== size(b) ? (size(a) < size(b) ? a : b) : score(a) <= score(b) ? a : b;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0, order: this.#order++ });
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
    this.#spawned.delete(id);
    this.#recent.forget(id);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id && attacker.team !== victim.team;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
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
    const spawn = scoredSpawn(candidates, mates, enemies, ctx, this.#recent.of(id));
    if (!spawn) throw new Error('No spawn points');
    return this.#recent.add(id, spawn);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#entries.clear();
    this.#spawned.clear();
    this.#nextFirst.clear();
    this.#recent.clear();
    this.#result = null;
    const [a, b] = TEAMS;
    // Players keep their team where they had one; the rest fill the smaller team.
    const unplaced: MatchEntrant[] = [];
    for (const e of entrants) {
      if (e.team === a || e.team === b) this.#entries.set(e.id, { id: e.id, name: e.name, team: e.team, kills: 0, deaths: 0, order: this.#order++ });
      else unplaced.push(e);
    }
    for (const e of unplaced) {
      const team = this.#members(a).length <= this.#members(b).length ? a : b;
      this.#entries.set(e.id, { id: e.id, name: e.name, team, kills: 0, deaths: 0, order: this.#order++ });
    }
    // Then the fewest moves that even the teams out: the latest joiners of the bigger team cross over.
    for (;;) {
      const big = this.#members(a).length > this.#members(b).length + 1 ? a : this.#members(b).length > this.#members(a).length + 1 ? b : null;
      if (big === null) break;
      const mover = this.#members(big).sort((x, y) => y.order - x.order)[0] as Entry;
      mover.team = big === a ? b : a;
    }
    return new Map([...this.#entries.values()].map((e) => [e.id, e.team]));
  }

  onEvents(events: readonly SimEvent[]): ModeEvent[] {
    const out: ModeEvent[] = [];
    const headshots = new Set<PlayerId>();
    for (const e of events) if (e.type === 'hit' && e.killed && e.zone === 'head') headshots.add(e.victim);
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const victim = this.#entries.get(e.victim);
      if (!victim) continue; // a dummy
      const scoring = this.#result === null;
      if (scoring) victim.deaths += 1;
      const killer = e.killer === null || e.killer === e.victim ? undefined : this.#entries.get(e.killer);
      if (killer && scoring && killer.team !== victim.team) killer.kills += 1;
      out.push({
        type: 'killFeed',
        killer: killer?.id ?? null,
        killerName: killer?.name ?? null,
        victim: victim.id,
        victimName: victim.name,
        cause: e.cause,
        headshot: headshots.has(e.victim),
      });
      if (killer && scoring && this.killLimit !== null && this.#teamScore(killer.team) >= this.killLimit) {
        this.#result = { winner: killer.team, winnerName: TEAM_NAMES[killer.team] ?? null, draw: false, reason: 'killLimit' };
      }
    }
    return out;
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      const [a, b] = TEAMS;
      const sa = this.#teamScore(a);
      const sb = this.#teamScore(b);
      const winner = sa === sb ? null : sa > sb ? a : b;
      this.#result = { winner, winnerName: winner === null ? null : (TEAM_NAMES[winner] ?? null), draw: winner === null, reason: 'timeLimit' };
    }
    return this.#result;
  }

  scores(): Score[] {
    return [...this.#entries.values()]
      .map((e) => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, score: e.kills }))
      .sort((x, y) => x.team - y.team || y.score - x.score || x.deaths - y.deaths);
  }

  teamScores(): readonly TeamScore[] {
    return TEAMS.map((team) => ({ team, score: this.#teamScore(team) }));
  }

  #members(team: TeamId): Entry[] {
    return [...this.#entries.values()].filter((e) => e.team === team);
  }

  #teamScore(team: TeamId): number {
    return this.#members(team).reduce((sum, e) => sum + e.kills, 0);
  }
}
