import type { Vec3 } from '../math';
import type { KillWeapon, PlayerId, PlayerInfo, PlayerOutput, SimEvent, TeamId } from '../simulation';
import type { World } from '../world';

/** A place players can spawn. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly yaw: number;
}

/** The game modes a lobby can run. */
export type ModeId = 'tdm' | 'ffa' | 'outposts';
export const MODE_IDS: readonly ModeId[] = ['tdm', 'ffa', 'outposts'];

/** Whether a mode plays two teams (everything but free-for-all). */
export function teamMode(id: ModeId): boolean {
  return id !== 'ffa';
}

/** An Outposts zone: a vertical cylinder from the map definition, captured by standing in it. */
export interface Zone {
  /** A short letter-like label shown on the HUD (A, B, C). */
  readonly id: string;
  readonly name: string;
  /** The centre of its floor. */
  readonly center: Vec3;
  readonly radius: number;
  /** How far above the floor (m) a player's feet still count as inside. */
  readonly height: number;
}

/** Whether a player standing at `position` is inside `zone`. */
export function inZone(zone: Zone, position: Vec3): boolean {
  const dy = position[1] - zone.center[1];
  return dy > -0.5 && dy < zone.height && Math.hypot(position[0] - zone.center[0], position[2] - zone.center[2]) <= zone.radius;
}

/** A zone as the match has it: who holds it, who is taking it and how far, and whether both teams stand in it. */
export interface ZoneState {
  readonly id: string;
  /** The team holding it; 0 while neutral. */
  readonly owner: TeamId;
  /** The team whose capture is under way; 0 for none. */
  readonly capturing: TeamId;
  /** How far that capture has got, 0 to 1. */
  readonly progress: number;
  readonly contested: boolean;
}

/** The mode's own state, sent with every snapshot; null for a mode without objectives. */
export type ObjectiveState = { readonly kind: 'outposts'; readonly zones: readonly ZoneState[] };

/** What a game mode can see of the match. */
export interface ModeContext {
  readonly tick: number;
  /** Simulation time in seconds. */
  readonly time: number;
  /** Seconds since the current match started. */
  readonly matchTime: number;
  /** Real players (not dummies), alive or dead. */
  readonly players: readonly PlayerOutput[];
  /** Free-for-all spawn points, spread over the map. */
  readonly spawns: readonly SpawnPoint[];
  /** One spawn set per team (team 1, then team 2), or null on a map without them. */
  readonly teamSpawns: readonly (readonly SpawnPoint[])[] | null;
  /** For line-of-sight checks when choosing spawns. */
  readonly world: World;
  /** The map's Outposts zones (none on a map without them). */
  readonly zones: readonly Zone[];
}

/** One row of the scoreboard. */
export interface Score {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly name: string;
  readonly kills: number;
  readonly deaths: number;
  readonly score: number;
  /** Set for a bot, so it is shown with a BOT tag. */
  readonly bot?: boolean;
}

/** A team's total in a team mode. */
export interface TeamScore {
  readonly team: TeamId;
  readonly score: number;
}

/** How a match ended. `winner` is a player id in free-for-all and a team id in team modes; null on a draw. */
export interface MatchResult {
  readonly winner: PlayerId | TeamId | null;
  readonly winnerName: string | null;
  readonly draw: boolean;
  readonly reason: 'killLimit' | 'scoreLimit' | 'timeLimit' | 'roundLimit' | 'forfeit';
}

/** Something the game mode or the match flow wants clients to know about. */
export type ModeEvent =
  | {
      readonly type: 'killFeed';
      readonly killer: PlayerId | null;
      readonly killerName: string | null;
      readonly victim: PlayerId;
      readonly victimName: string;
      readonly cause: 'bullet' | 'melee' | 'fall' | 'grenade';
      /** The weapon that did it, `frag` for a grenade (null for a fall). */
      readonly weapon: KillWeapon | null;
      readonly headshot: boolean;
    }
  /** A team took a zone from `previous` (0: it was neutral). */
  | { readonly type: 'capture'; readonly zone: string; readonly team: TeamId; readonly previous: TeamId }
  | ({ readonly type: 'matchEnd' } & MatchResult)
  | { readonly type: 'matchStart'; readonly mode: ModeId };

/** A player as a mode sees them at the start of a match: their team in the previous match, if any. */
export interface MatchEntrant {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId | null;
}

/** Seconds a dead player waits before respawning, online and in bot matches. */
export const RESPAWN_DELAY = 3;

/**
 * Game rules: scoring, team assignment, friendly fire, spawn selection and
 * win conditions. The server owns one of each kind and switches between them
 * at match start; the simulation knows nothing about them beyond the damage
 * rule. The intermission and voting between matches belong to the server.
 */
export interface GameMode {
  readonly id: ModeId;
  readonly name: string;
  /** Kills that win the match (a player's in free-for-all, a team's in team modes); null for none. */
  readonly killLimit: number | null;
  /** Team points that win the match in an objective mode; null for none. */
  readonly scoreLimit: number | null;
  /** Seconds a match lasts before the leader wins; null for no limit. */
  readonly timeLimit: number | null;
  /** Seconds a dead player waits before respawning (0 = instant). */
  readonly respawnDelay: number;
  /** A joining player's team. */
  join(id: PlayerId, name: string, ctx: ModeContext): TeamId;
  leave(id: PlayerId): void;
  /** A player back from a drop in the same match: their row, team and kills as they left them, already spawned. */
  rejoin(score: Score): void;
  /** Friendly-fire rule. Dummies are always fair game. */
  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean;
  /** Whether a dead player may respawn now (after the delay); a round-based mode says no until the next round. */
  canRespawn(id: PlayerId): boolean;
  /** Where `id` should (re)spawn. */
  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint;
  /**
   * A new match: scores back to zero, and every player gets a team, moving as
   * few players as possible from the team they had. Returns everyone's team.
   */
  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId>;
  /** Runs a tick of the match: reacts to its simulation events (kills, ...) and the objectives, and returns what clients should hear about. */
  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[];
  /** How the match ended, once a kill or time limit is reached; null while it is on. */
  result(ctx: ModeContext): MatchResult | null;
  scores(): Score[];
  /** Team totals in a team mode, null otherwise. */
  teamScores(): readonly TeamScore[] | null;
  /** The objectives' state for the snapshot, or null. */
  objective(): ObjectiveState | null;
}
