import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type Score, type SpawnPoint, type TeamScore } from './game-mode';
import { ScoreKeeper } from './score';
import { RecentSpawns, scoredSpawn } from './spawns';

export interface FreeForAllOptions {
  /** Kills that win the match; null for none. Defaults to 30. */
  readonly killLimit?: number | null;
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
  /** Draws where players spawn (0 to 1, like `Math.random`, its default). */
  readonly random?: () => number;
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
  readonly scoreLimit = null;
  readonly timeLimit: number | null;
  readonly #entries = new Map<PlayerId, Entry>();
  #nextTeam = 1;
  #result: MatchResult | null = null;
  readonly #recent = new RecentSpawns();
  /** Players who have spawned since the match started. */
  readonly #spawned = new Set<PlayerId>();
  readonly #random: () => number;
  readonly #score = new ScoreKeeper();

  constructor(options: FreeForAllOptions = {}) {
    this.killLimit = options.killLimit === undefined ? 30 : options.killLimit;
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
    this.#random = options.random ?? Math.random;
  }

  join(id: PlayerId, name: string): TeamId {
    const team = this.#nextTeam++;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0 });
    this.#score.join(id);
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
    this.#recent.forget(id);
    this.#spawned.delete(id);
    this.#score.leave(id);
  }

  rejoin(score: Score): void {
    this.#entries.set(score.id, { id: score.id, name: score.name, team: score.team, kills: score.kills, deaths: score.deaths });
    this.#score.rejoin(score);
    this.#spawned.add(score.id);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id;
  }

  canRespawn(): boolean {
    return true;
  }

  frozen(): boolean {
    return false;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    // Only players placed this match count: the rest still stand where the last match left them.
    const enemies = ctx.players.filter((p) => p.id !== id && p.alive && this.#spawned.has(p.id));
    this.#spawned.add(id);
    // With no living enemy yet, every spawn is as safe: one is drawn at random.
    const best = scoredSpawn(ctx.spawns, [], enemies, ctx, this.#recent.of(id), undefined, this.#random);
    if (!best) throw new Error('No spawn points');
    return this.#recent.add(id, best);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#entries.clear();
    this.#recent.clear();
    this.#spawned.clear();
    this.#result = null;
    this.#score.start();
    const teams = new Map<PlayerId, TeamId>();
    for (const e of entrants) teams.set(e.id, this.join(e.id, e.name));
    return teams;
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    const out: ModeEvent[] = [];
    this.#score.read(events, { time: ctx.time, scoring: this.#result === null, team: (id) => this.#entries.get(id)?.team });
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
        weapon: e.weapon,
        headshot: headshots.has(e.victim),
      });
      if (killer && scoring && this.killLimit !== null && killer.kills >= this.killLimit) {
        this.#result = { winner: killer.id, winnerName: killer.name, draw: false, reason: 'killLimit' };
      }
    }
    out.push(...this.#score.events());
    return out;
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      // Kills win it, whatever the Score says.
      const [first, second] = this.scores().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const draw = !first || (second !== undefined && second.kills === first.kills);
      this.#result = { winner: draw ? null : first.id, winnerName: draw ? null : first.name, draw, reason: 'timeLimit' };
    }
    return this.#result;
  }

  scores(): Score[] {
    return [...this.#entries.values()]
      .map((e): Score => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, ...this.#score.of(e.id) }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
  }

  teamScores(): readonly TeamScore[] | null {
    return null;
  }

  objective(): null {
    return null;
  }
}
