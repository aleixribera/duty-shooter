import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import type { WeaponId } from '../stats';
import type { Loadout } from '../weapon/loadout';
import { FreeForAll } from './ffa';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type Score, type SpawnPoint, type TeamScore } from './game-mode';

/**
 * The gun game ladder: the weapon each level plays with, two levels a weapon,
 * from the rifle down to the pistol. A kill on the last level wins.
 */
export const GUN_GAME_LADDER: readonly WeaponId[] = ['m4a1', 'm4a1', 'smg', 'smg', 'shotgun', 'shotgun', 'sniper', 'sniper', 'pistol', 'pistol'];

export interface GunGameOptions {
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
}

/**
 * Gun game: free-for-all on a weapon ladder. Everyone starts on the first
 * level's weapon, with no grenades; every kill moves the killer up a level and
 * re-arms them on the spot with the next weapon. A melee kill also knocks the
 * victim down a level. The first to make a kill on the last level wins; at the
 * time limit the highest level wins (most kills breaks a tie), and a tie at the
 * top is a draw. Spawns, teams and the kill feed are free-for-all's.
 */
export class GunGame implements GameMode {
  readonly id = 'gungame';
  readonly name = 'Gun game';
  readonly respawnDelay = RESPAWN_DELAY;
  /** Kills up the ladder that win the match. */
  readonly killLimit = GUN_GAME_LADDER.length;
  readonly scoreLimit = null;
  readonly timeLimit: number | null;
  /** Spawns, teams, kills and deaths, with no limits of its own. */
  readonly #ffa = new FreeForAll({ killLimit: null, timeLimit: null });
  /** Each player's level: an index into the ladder. */
  readonly #levels = new Map<PlayerId, number>();
  #result: MatchResult | null = null;

  constructor(options: GunGameOptions = {}) {
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
  }

  /** What `id` plays with on their level: the ladder's weapon in both slots and no grenade. */
  loadoutOf(id: PlayerId): Loadout | null {
    const level = this.#levels.get(id);
    if (level === undefined) return null;
    const weapon = GUN_GAME_LADDER[Math.min(level, GUN_GAME_LADDER.length - 1)]!;
    return { primary: weapon, secondary: weapon, grenade: null };
  }

  join(id: PlayerId, name: string): TeamId {
    this.#levels.set(id, 0);
    return this.#ffa.join(id, name);
  }

  leave(id: PlayerId): void {
    this.#levels.delete(id);
    this.#ffa.leave(id);
  }

  rejoin(score: Score): void {
    this.#levels.set(score.id, Math.max(0, Math.min(GUN_GAME_LADDER.length - 1, score.score)));
    this.#ffa.rejoin(score);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return this.#ffa.canDamage(attacker, victim);
  }

  canRespawn(): boolean {
    return true;
  }

  frozen(): boolean {
    return false;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    return this.#ffa.chooseSpawn(id, ctx);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#levels.clear();
    this.#result = null;
    const teams = this.#ffa.start(entrants);
    for (const e of entrants) this.#levels.set(e.id, 0);
    return teams;
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    const scoring = this.#result === null;
    const out = this.#ffa.onEvents(events);
    if (!scoring) return out;
    for (const e of events) {
      if (e.type !== 'kill' || e.killer === null || e.killer === e.victim) continue;
      const level = this.#levels.get(e.killer);
      if (level === undefined || this.#result !== null) continue;
      if (level === GUN_GAME_LADDER.length - 1) {
        const name = this.#ffa.scores().find((s) => s.id === e.killer)?.name ?? null;
        // Off the top of the ladder: the scoreboard shows the winner on the limit.
        this.#levels.set(e.killer, GUN_GAME_LADDER.length);
        this.#result = { winner: e.killer, winnerName: name, draw: false, reason: 'killLimit' };
        continue;
      }
      this.#levels.set(e.killer, level + 1);
      out.push({ type: 'level', player: e.killer, level: level + 1, weapon: GUN_GAME_LADDER[level + 1]!, demoted: false });
      // A melee kill takes a level from the victim as well.
      const lost = this.#levels.get(e.victim);
      if (e.cause === 'melee' && lost !== undefined && lost > 0) {
        this.#levels.set(e.victim, lost - 1);
        out.push({ type: 'level', player: e.victim, level: lost - 1, weapon: GUN_GAME_LADDER[lost - 1]!, demoted: true });
      }
    }
    this.result(ctx);
    return out;
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      const [first, second] = this.scores();
      const draw = !first || (second !== undefined && second.score === first.score && second.kills === first.kills);
      this.#result = { winner: draw ? null : first.id, winnerName: draw ? null : first.name, draw, reason: 'timeLimit' };
    }
    return this.#result;
  }

  /** Free-for-all's rows with `score` the player's level (from 0), highest first, then most kills. */
  scores(): Score[] {
    return this.#ffa
      .scores()
      .map((s) => ({ ...s, score: this.#levels.get(s.id) ?? 0 }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
  }

  teamScores(): readonly TeamScore[] | null {
    return null;
  }

  objective(): null {
    return null;
  }
}
