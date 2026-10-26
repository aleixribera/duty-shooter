import type { Vec3 } from '../math';
import type { PlayerId, PlayerInfo, PlayerOutput, SimEvent, TeamId } from '../simulation';

/** A place players can spawn. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly yaw: number;
}

/** What a game mode can see of the match. */
export interface ModeContext {
  readonly tick: number;
  /** Simulation time in seconds. */
  readonly time: number;
  /** Real players (not dummies), alive or dead. */
  readonly players: readonly PlayerOutput[];
  readonly spawns: readonly SpawnPoint[];
}

/** One row of the scoreboard. */
export interface Score {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly name: string;
  readonly kills: number;
  readonly deaths: number;
  readonly score: number;
}

/** Something the game mode wants clients to know about. */
export type ModeEvent =
  | { readonly type: 'killFeed'; readonly killer: PlayerId | null; readonly killerName: string | null; readonly victim: PlayerId; readonly victimName: string; readonly cause: 'bullet' | 'melee' | 'fall'; readonly headshot: boolean }
  | { readonly type: 'matchEnd'; readonly winner: PlayerId | TeamId | null; readonly winnerName: string | null }
  | { readonly type: 'matchStart' };

/**
 * Game rules: scoring, team assignment, friendly fire, spawn selection,
 * round flow and win conditions. The server owns one; the simulation knows
 * nothing about it beyond the damage rule.
 */
export interface GameMode {
  readonly name: string;
  /** A joining player's team. */
  join(id: PlayerId, name: string, ctx: ModeContext): TeamId;
  leave(id: PlayerId): void;
  /** Friendly-fire rule. Dummies are always fair game. */
  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean;
  /** Where `id` should (re)spawn. */
  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint;
  /** Seconds a dead player waits before respawning (0 = instant). */
  readonly respawnDelay: number;
  /** Reacts to a tick's simulation events (kills, ...) and returns what clients should hear about. */
  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[];
  /** Round flow, once per tick. `restart` asks the server to respawn everyone (a new round). */
  update(ctx: ModeContext): { events: ModeEvent[]; restart: boolean };
  scores(): Score[];
  /** The winner once a win condition is met, otherwise null. */
  winner(): PlayerId | TeamId | null;
}
