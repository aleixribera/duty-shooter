import type { Vec3 } from '../math';
import type { HeldWeapon, KillWeapon, PlayerId, PlayerInfo, PlayerOutput, RespawnOptions, SimEvent, TeamId } from '../simulation';
import type { WeaponId } from '../stats';
import type { Loadout } from '../weapon/loadout';
import type { World } from '../world';
import type { PlayGround } from './ground';
import type { PingEvent } from '../pings';
import type { TrapEvent } from '../sound-traps';
import type { Medal, ScoreLine } from './score';

/** A place players can spawn. */
export interface SpawnPoint {
  readonly position: Vec3;
  readonly yaw: number;
}

/** The game modes a lobby can run. */
export type ModeId = 'tdm' | 'ffa' | 'outposts' | 'charge' | 'gungame' | 'battle-royale';
export const MODE_IDS: readonly ModeId[] = ['tdm', 'ffa', 'outposts', 'charge', 'gungame', 'battle-royale'];

/** The modes a lobby's mode picker offers: Battle Royale has its own way in. */
export const LOBBY_MODES: readonly ModeId[] = MODE_IDS.filter((m) => m !== 'battle-royale');

/** Whether a mode plays two teams (everything but free-for-all, gun game and Battle Royale). */
export function teamMode(id: ModeId): boolean {
  return id !== 'ffa' && id !== 'gungame' && id !== 'battle-royale';
}

/**
 * Whether a respawn hands you the loadout you picked. Gun game arms everyone
 * with the ladder's gun in both slots, so a loadout screen, the keys that
 * switch loadouts and a swap to "your other weapon" mean nothing there
 * (review 2026-11-14a); a Battle Royale has no respawn to pick one for.
 */
export function pickedLoadouts(id: ModeId): boolean {
  return id !== 'gungame' && id !== 'battle-royale';
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

/** The state of a Battle Royale, as the snapshot carries it: it changes with a kill or a Stage, so a client works out the wall from the times. */
export interface BattleRoyaleState {
  readonly kind: 'battle-royale';
  /** Seats a Squad. */
  readonly squadSize: number;
  /** The Stage being played, from 1. */
  readonly stage: number;
  /** The circle this Stage holds at, and the one it shrinks to: the next circle, known throughout. */
  readonly circle: { readonly x: number; readonly z: number; readonly radius: number };
  readonly next: { readonly x: number; readonly z: number; readonly radius: number };
  /** Simulation times the wall starts moving and reaches `next`. */
  readonly shrinkAt: number;
  readonly shrinkEnd: number;
  /** HP a second outside it. */
  readonly damage: number;
  /** Seats and Squads still alive. */
  readonly alive: number;
  readonly squads: number;
  /** The Supply Drops announced so far, opened ones too; absent while none is. */
  readonly drops?: readonly SupplyDropState[];
  /** What the crates hold: absent, the sniper (the loot rules); `resupply`, the match is played on loadouts. */
  readonly holds?: 'resupply';
  /** Weapons lying on the ground for anyone to take; absent while none does. */
  readonly loose?: readonly LooseWeaponState[];
  /** Reboot is open (Duos and Trios, before the last Stages); absent when it isn't. */
  readonly reboot?: true;
  /** The island's Reboot Beacons, sent while Reboot is open. */
  readonly beacons?: readonly BeaconState[];
  /** Reboot Cards lying or carried; absent while none is. */
  readonly cards?: readonly RebootCardState[];
  /** The Kill Leader: most eliminations, from 3 on; absent until someone has them. */
  readonly leader?: { readonly id: PlayerId; readonly name: string; readonly kills: number };
  /** The Squad introduced at the dive as champions; absent when nobody from the last match's winners (or its Kill Leader) is back. */
  readonly champion?: RoyaleChampion;
}

/** The champion Squad: who won the last match (`won`), or else whose Squad holds its Kill Leader (`leader`, with their eliminations). */
export interface RoyaleChampion {
  readonly team: TeamId;
  readonly names: readonly string[];
  readonly why: 'won' | 'leader';
  readonly kills?: number;
}

/** A Reboot Card: the seat it brings back, and where it lies or who carries it. Times are simulation times. */
export interface RebootCardState {
  readonly owner: PlayerId;
  readonly team: TeamId;
  /** Where it lies, and until when; absent while carried. */
  readonly position?: Vec3;
  readonly until?: number;
  /** The squadmate carrying it. */
  readonly carrier?: PlayerId;
}

/** A Reboot Beacon: where it stands, who is rebooting at it and since when, or until when it rests. */
export interface BeaconState {
  readonly position: Vec3;
  readonly channel?: { readonly by: PlayerId; readonly since: number };
  readonly ready?: number;
}

/** A Supply Drop as everyone is told of it: where it lands and when, and who is opening or has opened it. Times are simulation times. */
export interface SupplyDropState {
  /** The Stage it came with. */
  readonly stage: number;
  /** Where it lands: its foot on the ground. */
  readonly position: Vec3;
  readonly lands: number;
  /** Who is holding use at it, and since when. */
  readonly opening?: { readonly by: PlayerId; readonly since: number };
  /** Who opened it and took the sniper. */
  readonly opened?: PlayerId;
}

/** A weapon on the ground: a primary dropped for a Supply Drop's sniper, or the sniper of a seat that went out. */
export interface LooseWeaponState {
  /** Numbers it in the match, so a client can tell one from the next. */
  readonly id: number;
  readonly weapon: WeaponId;
  readonly position: Vec3;
}

/** What a mode may do to a seat's weapons (the server's simulation does it). */
export interface ModeActions {
  /** Puts `weapon` in a seat's primary slot and hands; returns the primary it replaced. */
  give(id: PlayerId, weapon: HeldWeapon): HeldWeapon | null;
  /** A seat's primary as it is now. */
  primary(id: PlayerId): HeldWeapon | null;
  /** Fills a seat's frags and tacticals back to what the match gives, and its health (a Supply Drop's resupply). */
  resupply?(id: PlayerId): void;
  /** Brings a seat that is out back at `position` with its loadout (a Reboot). */
  respawn?(id: PlayerId, position: Vec3, yaw: number, options: RespawnOptions): void;
}

/** The mode's own state, sent with every snapshot; null for a mode without any. */
export type ObjectiveState =
  | { readonly kind: 'outposts'; readonly zones: readonly ZoneState[] }
  | ChargeState
  /** Gun game: this match's ladder, first gun first. */
  | { readonly kind: 'gungame'; readonly guns: readonly WeaponId[] }
  | BattleRoyaleState;

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
  /** The map's open land, in a mode that seats its own: absent on a map with no nav. */
  readonly ground?: PlayGround;
  /** The seats that belong to people, connected or held for them; script players don't count. Set in a mode that seats its own. */
  readonly people?: ReadonlySet<PlayerId>;
  /** What the mode may do to seats' weapons; nothing when absent. */
  readonly act?: ModeActions;
}

/** One row of the scoreboard. */
export interface Score {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly name: string;
  readonly kills: number;
  readonly deaths: number;
  /** Their Score for the match, from the points table (`STATS.score`): it ranks the scoreboard and never decides a match. */
  readonly score: number;
  /** Kills by someone else that they dealt real damage towards. */
  readonly assists: number;
  /** The best Medal they have earned this match. */
  readonly medal?: Medal;
  /** Gun game: their kills up the ladder, less what melee kills took. */
  readonly progress?: number;
  /** Set for a bot, so it is shown with a BOT tag. */
  readonly bot?: boolean;
  /** Where their Squad finished, once it has gone out or won; Battle Royale only. */
  readonly place?: number;
}

/** A team's total in a team mode. */
export interface TeamScore {
  readonly team: TeamId;
  readonly score: number;
}

/** How a match ended. `winner` is a player id in free-for-all and a team id in team modes and for a Squad; null on a draw or an early end. */
export interface MatchResult {
  readonly winner: PlayerId | TeamId | null;
  readonly winnerName: string | null;
  /** How many people `winnerName` names, when more than one (a Squad of two or three): the line then reads "Ada and Mate win". */
  readonly winners?: number;
  readonly draw: boolean;
  readonly reason: 'killLimit' | 'scoreLimit' | 'timeLimit' | 'roundLimit' | 'forfeit' | 'lastSquad' | 'noHumans';
}

/** Something the game mode or the match flow wants clients to know about. */
export type ModeEvent =
  | {
      readonly type: 'killFeed';
      readonly killer: PlayerId | null;
      readonly killerName: string | null;
      readonly victim: PlayerId;
      readonly victimName: string;
      readonly cause: Extract<SimEvent, { type: 'kill' }>['cause'];
      /** The weapon that did it, `frag` for a grenade (null for a fall). */
      readonly weapon: KillWeapon | null;
      readonly headshot: boolean;
      /** The victim went Downed rather than out. */
      readonly down?: boolean;
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
  /** Gun game: `player` moved to `level` (from 0, an index into the guns) and now plays with `weapon`; `demoted` when a melee kill knocked them back (perhaps on the same gun). */
  | { readonly type: 'level'; readonly player: PlayerId; readonly level: number; readonly weapon: WeaponId; readonly demoted: boolean }
  /** Battle Royale: the Ring moved on to `stage` (from 1). */
  | { readonly type: 'stage'; readonly stage: number }
  /** Battle Royale: a Supply Drop was announced, landed, began or stopped being opened, or was opened by `player`. */
  | { readonly type: 'drop'; readonly action: 'announce' | 'land' | 'start' | 'stop' | 'open'; readonly stage: number; readonly player: PlayerId | null; readonly position: Vec3 }
  /** Battle Royale: `player` took `weapon` from the ground, leaving `left` there (null: nothing), or a weapon fell there (`player` null). */
  | { readonly type: 'loose'; readonly player: PlayerId | null; readonly weapon: WeaponId; readonly left: WeaponId | null; readonly position: Vec3 }
  /** Battle Royale: `owner`'s Reboot Card fell, was taken by `player`, ran out, or was voided (the last Stages, or nobody left to carry it). */
  | { readonly type: 'card'; readonly action: 'drop' | 'take' | 'expire' | 'void'; readonly owner: PlayerId; readonly ownerName: string; readonly player: PlayerId | null; readonly playerName: string | null; readonly position: Vec3 }
  /** Battle Royale: nobody of Squad `team` is left standing; `by` put out its last seat (null: the Ring, a fall), and `squadsLeft` remain. */
  | { readonly type: 'squadOut'; readonly team: TeamId; readonly names: readonly string[]; readonly by: string | null; readonly squadsLeft: number }
  /** Battle Royale: `player` is the new Kill Leader, with `kills` eliminations. */
  | { readonly type: 'killLeader'; readonly player: PlayerId; readonly name: string; readonly team: TeamId; readonly kills: number }
  /** Battle Royale: `player` began, broke off or finished a Reboot at Beacon `beacon`, for `seats`. */
  | { readonly type: 'reboot'; readonly action: 'start' | 'stop' | 'done'; readonly player: PlayerId; readonly playerName: string; readonly beacon: number; readonly seats: readonly PlayerId[]; readonly names: readonly string[]; readonly position: Vec3 }
  /** `player` earned Score: each reason and what it paid, in order. Told to that seat's client alone. */
  | { readonly type: 'score'; readonly player: PlayerId; readonly lines: readonly ScoreLine[] }
  /** A ping, for the pinger's Squad or team only. */
  | PingEvent
  /** A sound trap went off (ticket 72): heard by everyone near, people and bots. */
  | TrapEvent
  | ({ readonly type: 'matchEnd' } & MatchResult)
  | { readonly type: 'matchStart'; readonly mode: ModeId };

/** A player as a mode sees them at the start of a match: their team in the previous match, if any. */
export interface MatchEntrant {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId | null;
  /** The team they must play on, whatever the balance (humans vs bots); team modes only. */
  readonly side?: TeamId;
  /** The Squad they picked in the lobby, as a label shared with their squadmates; Battle Royale only. */
  readonly squad?: number;
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
  /** A mode that seats its own: always this many, whatever the server's limits, filled with bots; those who come late spectate, and a bot plays a dropped seat. */
  readonly fixedSeats?: number;
  /** Frags a seat starts with, in place of the usual allowance. */
  readonly frags?: number;
  /** Tacticals a seat starts with, in place of the usual allowance (ticket 20). */
  readonly tacticals?: number;
  /** HP a second the mode's own hazard takes from a seat at `position`, `matchTime` seconds in. */
  hazardAt?(position: Vec3, matchTime: number): number;
  /** Whether seats go Downed at 0 health rather than dying. Never, when absent. */
  downs?(): boolean;
  /** A joining player's team: `side` when given (humans vs bots, team modes only). */
  join(id: PlayerId, name: string, ctx: ModeContext, side?: TeamId): TeamId;
  leave(id: PlayerId): void;
  /** A player back from a drop in the same match: their row, team and kills as they left them, already spawned. */
  rejoin(score: Score): void;
  /** Friendly-fire rule. Dummies are always fair game. */
  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean;
  /** Whether a dead player may respawn now (after the delay); a round-based mode says no until the next round. */
  canRespawn(id: PlayerId): boolean;
  /** The loadout the mode hands `id` whatever they picked (gun game's ladder weapon); absent or null to let them choose. */
  loadoutOf?(id: PlayerId): Loadout | null;
  /** Whether players are held where they stand (a round's opening freeze): they can look around and change loadout, nothing more. */
  frozen(): boolean;
  /** Where `id` should (re)spawn. */
  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint;
  /**
   * A new match: scores back to zero, and every player gets a team, moving as
   * few players as possible from the team they had. Returns everyone's team.
   */
  start(entrants: readonly MatchEntrant[], ctx?: ModeContext): ReadonlyMap<PlayerId, TeamId>;
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
