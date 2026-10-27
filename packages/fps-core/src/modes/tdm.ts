import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type Score, type SpawnPoint, type TeamScore } from './game-mode';
import { TEAMS, TEAM_NAMES, TeamRoster } from './teams';

export { TEAMS } from './teams';

export interface TeamDeathmatchOptions {
  /** Team kills that win the match; null for none. Defaults to 75. */
  readonly killLimit?: number | null;
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
}

/**
 * Team deathmatch: two teams, no friendly fire, teams and spawns as
 * {@link TeamRoster} keeps them. The first team to the kill limit wins; at
 * the time limit the leading team wins, and a tie is a draw.
 */
export class TeamDeathmatch implements GameMode {
  readonly id = 'tdm';
  readonly name = 'Team deathmatch';
  readonly respawnDelay = RESPAWN_DELAY;
  readonly killLimit: number | null;
  readonly scoreLimit = null;
  readonly timeLimit: number | null;
  readonly #roster = new TeamRoster();
  #result: MatchResult | null = null;

  constructor(options: TeamDeathmatchOptions = {}) {
    this.killLimit = options.killLimit === undefined ? 75 : options.killLimit;
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
  }

  join(id: PlayerId, name: string): TeamId {
    return this.#roster.join(id, name, (t) => this.#teamScore(t));
  }

  leave(id: PlayerId): void {
    this.#roster.leave(id);
  }

  rejoin(score: Score): void {
    this.#roster.rejoin(score);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id && attacker.team !== victim.team;
  }

  canRespawn(): boolean {
    return true;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    return this.#roster.spawn(id, ctx);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#result = null;
    return this.#roster.start(entrants);
  }

  onEvents(events: readonly SimEvent[]): ModeEvent[] {
    const scoring = this.#result === null;
    const { feed, killers } = this.#roster.recordKills(events, scoring);
    for (const killer of killers) {
      if (this.#result === null && this.killLimit !== null && this.#teamScore(killer.team) >= this.killLimit) {
        this.#result = { winner: killer.team, winnerName: TEAM_NAMES[killer.team] ?? null, draw: false, reason: 'killLimit' };
      }
    }
    return feed;
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
    return this.#roster.scores();
  }

  teamScores(): readonly TeamScore[] {
    return TEAMS.map((team) => ({ team, score: this.#teamScore(team) }));
  }

  objective(): null {
    return null;
  }

  #teamScore(team: TeamId): number {
    return this.#roster.members(team).reduce((sum, e) => sum + e.kills, 0);
  }
}
