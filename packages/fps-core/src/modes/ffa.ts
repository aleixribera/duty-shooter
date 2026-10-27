import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type Score, type SpawnPoint, type TeamScore } from './game-mode';
import { RecentSpawns, scoredSpawn } from './spawns';

export interface FreeForAllOptions {
  /** Kills that win the match; null for none. Defaults to 30. */
  readonly killLimit?: number | null;
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
}

interface Entry {
  id: PlayerId;
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
}

/**
 * Free-for-all: everyone on their own team, respawning after a few seconds at the safest
 * spawn point (see {@link scoredSpawn}), a kill feed, kills and deaths. The
 * first to the kill limit wins; at the time limit the most kills wins, and a
 * tie at the top is a draw.
 */
export class FreeForAll implements GameMode {
  readonly id = 'ffa';
  readonly name = 'Free-for-all';
  readonly respawnDelay = RESPAWN_DELAY;
  readonly killLimit: number | null;
  readonly timeLimit: number | null;
  readonly #entries = new Map<PlayerId, Entry>();
  #nextTeam = 1;
  #result: MatchResult | null = null;
  /** Rotates spawns when no living enemy separates them. */
  #nextSpawn = 0;
  readonly #recent = new RecentSpawns();

  constructor(options: FreeForAllOptions = {}) {
    this.killLimit = options.killLimit === undefined ? 30 : options.killLimit;
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
  }

  join(id: PlayerId, name: string): TeamId {
    const team = this.#nextTeam++;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0 });
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
    this.#recent.forget(id);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    const enemies = ctx.players.filter((p) => p.id !== id && p.alive);
    if (enemies.length === 0) {
      const spawn = ctx.spawns[this.#nextSpawn++ % ctx.spawns.length];
      if (!spawn) throw new Error('No spawn points');
      return this.#recent.add(id, spawn);
    }
    const best = scoredSpawn(ctx.spawns, [], enemies, ctx, this.#recent.of(id));
    if (!best) throw new Error('No spawn points');
    return this.#recent.add(id, best);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#entries.clear();
    this.#recent.clear();
    this.#result = null;
    const teams = new Map<PlayerId, TeamId>();
    for (const e of entrants) teams.set(e.id, this.join(e.id, e.name));
    return teams;
  }

  onEvents(events: readonly SimEvent[]): ModeEvent[] {
    const out: ModeEvent[] = [];
    const headshots = new Set<PlayerId>();
    for (const e of events) if (e.type === 'hit' && e.killed && e.zone === 'head') headshots.add(e.victim);
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const victim = this.#entries.get(e.victim);
      if (!victim) continue; // a dummy
      // Once the match is decided, nothing more scores.
      const scoring = this.#result === null;
      if (scoring) victim.deaths += 1;
      const killer = e.killer === null || e.killer === e.victim ? undefined : this.#entries.get(e.killer);
      if (killer && scoring) killer.kills += 1;
      out.push({
        type: 'killFeed',
        killer: killer?.id ?? null,
        killerName: killer?.name ?? null,
        victim: victim.id,
        victimName: victim.name,
        cause: e.cause,
        headshot: headshots.has(e.victim),
      });
      if (killer && scoring && this.killLimit !== null && killer.kills >= this.killLimit) {
        this.#result = { winner: killer.id, winnerName: killer.name, draw: false, reason: 'killLimit' };
      }
    }
    return out;
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      const [first, second] = this.scores();
      const draw = !first || (second !== undefined && second.kills === first.kills);
      this.#result = { winner: draw ? null : first.id, winnerName: draw ? null : first.name, draw, reason: 'timeLimit' };
    }
    return this.#result;
  }

  scores(): Score[] {
    return [...this.#entries.values()]
      .map((e) => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, score: e.kills }))
      .sort((a, b) => b.score - a.score || a.deaths - b.deaths);
  }

  teamScores(): readonly TeamScore[] | null {
    return null;
  }
}
