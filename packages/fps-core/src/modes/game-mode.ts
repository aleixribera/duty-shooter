import type { Vec3 } from '../math';
import type { KillWeapon, PlayerId, PlayerInfo, PlayerOutput, SimEvent, TeamId } from '../simulation';
import type { World } from '../world';

/** A place players can spawn. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly yaw: number;
}

/** The game modes a lobby can run. */
export type ModeId = 'tdm' | 'ffa' | 'outposts' | 'charge';
export const MODE_IDS: readonly ModeId[] = ['tdm', 'ffa', 'outposts', 'charge'];

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

/** A Charge site: a box volume from the map definition, where the attackers plant the charge. */
export interface ChargeSite {
  /** A letter shown on the HUD (A, B). */
  readonly id: string;
  readonly name: string;
  /** Opposite corners of the box; a player's feet must be inside it. */
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Whether a player standing at `position` is inside `site`. */
export function inSite(site: ChargeSite, position: Vec3): boolean {
  const [x, y, z] = position;
  return x >= site.min[0] && x <= site.max[0] && z >= site.min[2] && z <= site.max[2] && y > site.min[1] - 0.5 && y < site.max[1];
}

/** The ground point at the middle of a site's box. */
export function siteCentre(site: ChargeSite): Vec3 {
  return [(site.min[0] + site.max[0]) / 2, site.min[1], (site.min[2] + site.max[2]) / 2];
}

/** Where a Charge round is: the opening freeze, play, the fuse running, or the result shown before the next round. */
export type RoundPhase = 'freeze' | 'live' | 'planted' | 'over';

/** How a Charge round was won. */
export type RoundReason = 'detonated' | 'defused' | 'eliminated' | 'time';

/** The state of a Charge match, as the snapshot carries it. */
export interface ChargeState {
  readonly kind: 'charge';
  /** The round being played, from 1. */
  readonly round: number;
  readonly attackers: TeamId;
  readonly phase: RoundPhase;
  /** Seconds left in the phase (the freeze, the round clock, the fuse, the pause before the next round). */
  readonly remaining: number;
  /** Who carries the charge; null while it lies dropped, is planted, or nobody has it. */
  readonly carrier: PlayerId | null;
  /** Where the dropped charge lies, or null. */
  readonly dropped: Vec3 | null;
  readonly planted: { readonly site: string; readonly position: Vec3 } | null;
  /** A plant or defuse under way: who, and how far (0 to 1). */
  readonly action: { readonly player: PlayerId; readonly kind: 'plant' | 'defuse'; readonly progress: number } | null;
  /** The round just won, while the result is shown; null otherwise. */
  readonly outcome: { readonly winner: TeamId; readonly reason: RoundReason } | null;
}

/** The mode's own state, sent with every snapshot; null for a mode without objectives. */
export type ObjectiveState = { readonly kind: 'outposts'; readonly zones: readonly ZoneState[] } | ChargeState;

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
  /** The map's Charge sites (none on a map without them). */
  readonly sites: readonly ChargeSite[];
  /** Players holding the use button (to plant or defuse). */
  readonly using: ReadonlySet<PlayerId>;
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
  /** A Charge round begins (its freeze): everyone is put back at their side's spawns. */
  | { readonly type: 'roundStart'; readonly round: number; readonly attackers: TeamId }
  | { readonly type: 'roundEnd'; readonly round: number; readonly winner: TeamId; readonly reason: RoundReason }
  /** The charge changed hands or state: `player` is who did it (null for a detonation), `site` where it was planted. */
  | {
      readonly type: 'charge';
      readonly action: 'pickup' | 'drop' | 'plant' | 'defuse' | 'detonate';
      readonly player: PlayerId | null;
      readonly team: TeamId;
      readonly site: string | null;
      readonly position: Vec3;
    }
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
  /** Whether players are held where they stand (a round's opening freeze): they can look around and change loadout, nothing more. */
  frozen(): boolean;
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
