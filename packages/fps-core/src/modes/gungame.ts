import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import { WEAPON_IDS, type WeaponId } from '../stats';
import type { Loadout } from '../weapon/loadout';
import { FreeForAll } from './ffa';
import { RESPAWN_DELAY, type GameMode, type MatchEntrant, type MatchResult, type ModeContext, type ModeEvent, type ObjectiveState, type Score, type SpawnPoint, type TeamScore } from './game-mode';

/** Guns on a gun game ladder: drawn at random from the whole arsenal, in a random order, for each match. */
export const GUN_GAME_LADDER_LENGTH = 5;

/** Kills that move a player on from each gun: the last gun's last kill wins. Lower it as the arsenal grows, so a match stays about as long. */
export const GUN_GAME_KILLS_PER_GUN = 4;

/** The level (an index into the ladder) that `progress` kills up the ladder stand on. */
export function gunGameLevel(progress: number): number {
  return Math.max(0, Math.min(GUN_GAME_LADDER_LENGTH - 1, Math.floor(progress / GUN_GAME_KILLS_PER_GUN)));
}

/** A match's ladder: {@link GUN_GAME_LADDER_LENGTH} different guns of `pool` in a random order (a shuffle, cut short). */
export function dealLadder(random: () => number = Math.random, pool: readonly WeaponId[] = WEAPON_IDS): WeaponId[] {
  const guns = [...pool];
  for (let i = guns.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [guns[i], guns[j]] = [guns[j]!, guns[i]!];
  }
  return guns.slice(0, GUN_GAME_LADDER_LENGTH);
}

export interface GunGameOptions {
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
  /** Deals each match's ladder (0 to 1, like `Math.random`, its default). */
  readonly random?: () => number;
}

/**
 * Gun game: free-for-all on a weapon ladder, dealt afresh at each match's
 * start (see {@link dealLadder}). Everyone starts on the first gun, with no grenades; every {@link GUN_GAME_KILLS_PER_GUN} kills move the
 * killer up a level and re-arm them on the spot with the next gun. A melee
 * kill also knocks the victim back a level's worth of kills. The first to
 * finish the last gun wins; at the time limit the most kills up the ladder
 * win (then most kills overall, then fewest deaths), and a full tie at the top
 * is a draw.
 * Spawns, teams and the kill feed are free-for-all's.
 */
export class GunGame implements GameMode {
  readonly id = 'gungame';
  readonly name = 'Gun game';
  readonly respawnDelay = RESPAWN_DELAY;
  /** Kills up the ladder that win the match. */
  readonly killLimit = GUN_GAME_LADDER_LENGTH * GUN_GAME_KILLS_PER_GUN;
  readonly scoreLimit = null;
  readonly timeLimit: number | null;
  /** Spawns, teams, kills and deaths, with no limits of its own. */
  readonly #ffa = new FreeForAll({ killLimit: null, timeLimit: null });
  /** Each player's kills up the ladder, less what melee kills took. */
  readonly #progress = new Map<PlayerId, number>();
  #result: MatchResult | null = null;
  readonly #random: () => number;
  /** This match's ladder. */
  #guns: readonly WeaponId[];

  constructor(options: GunGameOptions = {}) {
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
    this.#random = options.random ?? Math.random;
    this.#guns = dealLadder(this.#random);
  }

  /** This match's ladder, first gun first. */
  get guns(): readonly WeaponId[] {
    return this.#guns;
  }

  /** What `id` plays with on their level: its gun in both slots and no grenade. */
  loadoutOf(id: PlayerId): Loadout | null {
    const progress = this.#progress.get(id);
    if (progress === undefined) return null;
    const weapon = this.#guns[gunGameLevel(progress)]!;
    return { primary: weapon, secondary: weapon, grenade: null };
  }

  join(id: PlayerId, name: string): TeamId {
    this.#progress.set(id, 0);
    return this.#ffa.join(id, name);
  }

  leave(id: PlayerId): void {
    this.#progress.delete(id);
    this.#ffa.leave(id);
  }

  rejoin(score: Score): void {
    this.#progress.set(score.id, Math.max(0, Math.min(this.killLimit - 1, score.score)));
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
    this.#progress.clear();
    this.#result = null;
    this.#guns = dealLadder(this.#random);
    const teams = this.#ffa.start(entrants);
    for (const e of entrants) this.#progress.set(e.id, 0);
    return teams;
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    const scoring = this.#result === null;
    const out = this.#ffa.onEvents(events);
    if (!scoring) return out;
    for (const e of events) {
      if (e.type !== 'kill' || e.killer === null || e.killer === e.victim) continue;
      const progress = this.#progress.get(e.killer);
      if (progress === undefined || this.#result !== null) continue;
      this.#progress.set(e.killer, progress + 1);
      if (progress + 1 >= this.killLimit) {
        const name = this.#ffa.scores().find((s) => s.id === e.killer)?.name ?? null;
        this.#result = { winner: e.killer, winnerName: name, draw: false, reason: 'killLimit' };
        continue;
      }
      const level = gunGameLevel(progress + 1);
      if (level !== gunGameLevel(progress)) out.push({ type: 'level', player: e.killer, level, weapon: this.#guns[level]!, demoted: false });
      // A melee kill takes a level's worth of kills from the victim as well.
      const lost = this.#progress.get(e.victim);
      if (e.cause === 'melee' && lost !== undefined && lost > 0) {
        const left = Math.max(0, lost - GUN_GAME_KILLS_PER_GUN);
        this.#progress.set(e.victim, left);
        out.push({ type: 'level', player: e.victim, level: gunGameLevel(left), weapon: this.#guns[gunGameLevel(left)]!, demoted: true });
      }
    }
    this.result(ctx);
    return out;
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      const [first, second] = this.scores();
      const draw = !first || (second !== undefined && second.score === first.score && second.kills === first.kills && second.deaths === first.deaths);
      this.#result = { winner: draw ? null : first.id, winnerName: draw ? null : first.name, draw, reason: 'timeLimit' };
    }
    return this.#result;
  }

  /** Free-for-all's rows with `score` the player's kills up the ladder, furthest first, then most kills. */
  scores(): Score[] {
    return this.#ffa
      .scores()
      .map((s) => ({ ...s, score: this.#progress.get(s.id) ?? 0 }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
  }

  teamScores(): readonly TeamScore[] | null {
    return null;
  }

  objective(): ObjectiveState {
    return { kind: 'gungame', guns: this.#guns };
  }
}
