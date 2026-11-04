import { Bot, type BotObjective, type BotView, type ThinkBudget } from '../bots/bot';
import { planCharge, planOutposts } from '../bots/planner';
import { SquadPlanner, type GroundOrder } from '../bots/squad-plan';
import { nearestNode, type NavGraph } from '../bots/nav';
import { botName, botProfile, royaleProfile, type BotProfile } from '../bots/profile';
import { BattleRoyale, type BattleRoyaleOptions, type SquadSize } from '../modes/battle-royale';
import { Charge, type ChargeOptions } from '../modes/charge';
import { FreeForAll, type FreeForAllOptions } from '../modes/ffa';
import { GunGame, type GunGameOptions } from '../modes/gungame';
import { LOBBY_MODES, teamMode, type BattleRoyaleState, type ChargeSite, type GameMode, type MatchResult, type ModeActions, type ModeContext, type ModeEvent, type ModeId, type Score, type SpawnPoint, type Zone } from '../modes/game-mode';
import { Outposts, type OutpostsOptions } from '../modes/outposts';
import { playGround } from '../modes/ground';
import { royaleLoadout } from '../modes/supply-drops';
import { MATCH_SCALES, WIDE_SCALE, type MatchScale } from '../modes/scale';
import { TeamDeathmatch, type TeamDeathmatchOptions } from '../modes/tdm';
import { TEAMS } from '../modes/teams';
import { hashString } from '../random';
import { SeatIndex } from '../seats';
import { STATS } from '../stats';
import { Simulation, TICK_SECONDS, type PlayerId, type PlayerOutput, type PlayerSpawn, type PlayerState, type SimEvent, type TeamId, type TickOutput } from '../simulation';
import { Button, type UserCmd } from '../usercmd';
import type { Loadout } from '../weapon/loadout';
import type { Vec3 } from '../math';
import type { World } from '../world';
import { STICKY_FIELDS, joinSnapshot, packEvent, packGrenades, packPlayer, packValue, type StickyField } from './codec';
import {
  EVENT_RESEND_TICKS,
  INTERMISSION,
  MATCH_COUNTDOWN,
  PREPARATION,
  PROTOCOL_VERSION,
  decodeClient,
  encode,
  type LobbyState,
  type MatchStatus,
  type Phase,
  type PreparationState,
  type RejectReason,
  type ServerMessage,
  type WireSnapshot,
} from './protocol';
import { NET_PROFILES, eventReach, reaches, seatTier, within, type EventReach, type NetProfile, type Relevance } from './relevance';
import { noFacts, type TickFacts, type TickProbe } from './tick-profile';
import type { Connection, ServerTransport, WireData } from './transport';

/** A map the server can run a match on: its collision, spawns, objectives and the bots' nav graph. */
export interface ServerMap {
  readonly id: string;
  readonly world: World;
  readonly spawns: readonly SpawnPoint[];
  readonly teamSpawns?: readonly (readonly SpawnPoint[])[];
  readonly zones?: readonly Zone[];
  readonly sites?: readonly ChargeSite[];
  /** No bots play on a map without one. */
  readonly nav?: NavGraph;
  /** Bots a side the lobby fills to on this map, by mode; the server's default where a mode has none. */
  readonly teamSize?: TeamSizes;
}

/** A map's team size (people and bots a side) for each mode; free-for-all holds twice it. */
export type TeamSizes = Readonly<Partial<Record<ModeId, number>>>;

export interface GameServerOptions {
  /** The first map: its collision, with the spawns, zones, sites and bots' nav graph below. */
  readonly world: World;
  /** The map's id, reported to clients and the lobby status. */
  readonly map?: string;
  /** More maps the lobby's host may pick for the next match (switched to at its start). */
  readonly maps?: readonly ServerMap[];
  /** The mode the server starts in. Defaults to team deathmatch. */
  readonly mode?: ModeId;
  /** Limits for each mode; by default TDM is 75 kills, FFA 30, Outposts 200 points, gun game 20 kills up its ladder, all 600 s, and Charge first to 4 rounds. */
  readonly modes?: { readonly tdm?: TeamDeathmatchOptions; readonly ffa?: FreeForAllOptions; readonly outposts?: OutpostsOptions; readonly charge?: ChargeOptions; readonly gungame?: GunGameOptions; readonly battleRoyale?: BattleRoyaleOptions };
  /** Intermission phase lengths (s). Defaults: 6 s of nuke, then 14 s of scoreboard and vote. */
  readonly intermission?: { readonly nuke?: number; readonly vote?: number };
  /** Free-for-all spawn points, spread over the map. */
  readonly spawns: readonly SpawnPoint[];
  /** One spawn set per team (team 1, then team 2); without them team modes use the free-for-all points. */
  readonly teamSpawns?: readonly (readonly SpawnPoint[])[];
  /** The map's Outposts zones; none without. */
  readonly zones?: readonly Zone[];
  /** The map's Charge sites; none without. */
  readonly sites?: readonly ChargeSite[];
  /** The first map's team size by mode, which bots fill to; `bots.perTeam` where a mode has none. */
  readonly teamSize?: TeamSizes;
  /** Range dummies, simulated by the server for everyone. */
  readonly dummies?: readonly PlayerSpawn[];
  /** The shared passphrase every join must carry; empty runs a public lobby anyone can join. */
  readonly passphrase: string;
  readonly maxPlayers?: number;
  /** Largest accepted message, in characters. */
  readonly maxMessageSize?: number;
  /** Messages a connection may send per second before it is dropped. */
  readonly maxMessagesPerSecond?: number;
  /** Seconds of silence before a joined client is let go; IDLE_TIMEOUT by default. */
  readonly idleTimeout?: number;
  /** Bots that fill the match while people are playing; none without. */
  readonly bots?: BotOptions;
  /** Seconds a fresh spawn can't be hurt (it ends early once the player fires); SPAWN_PROTECTION by default. */
  readonly spawnProtection?: number;
  /** Seconds each match opens with, everyone held; MATCH_COUNTDOWN by default, 0 for none. */
  readonly countdown?: number;
  /** Seconds a dropped player's seat is held for them to come back to; RECONNECT_GRACE by default, 0 lets it go at once. */
  readonly reconnectGrace?: number;
  /** Hears every join, leave, match start and match end, for the lobby's event log. */
  readonly onLog?: (event: LobbyEvent) => void;
  /** Told what each tick did and when, to name what a slow one was doing. */
  readonly probe?: TickProbe;
  /**
   * Run a lobby between matches: the first person in is the host, who picks
   * the mode and bots and starts each match; after a match's nuke and
   * scoreboard everyone goes back to the lobby. Without it, matches follow
   * one another with a mode vote in between (bot matches in the page).
   */
  readonly lobby?: boolean;
  /**
   * Humans vs bots, until a first joiner or the host picks otherwise: in team
   * modes every person plays on the first team against a bot team sized to
   * them (see {@link hvbBots}); free-for-all ignores it.
   */
  readonly hvb?: boolean;
  /** Replaces every mode's own network profile (see {@link NET_PROFILES}): for load tests. */
  readonly net?: NetProfile;
  /** Replaces every mode's own seat and bot limits (see {@link MATCH_SCALES}): for load tests. */
  readonly scale?: MatchScale;
}

/** The bot team humans vs bots puts up against `people`: two more than them, at least four, within the cap a side and the seats left. */
export function hvbBots(people: number, maxPerTeam: number, maxPlayers: number): number {
  return Math.max(0, Math.min(Math.max(4, people + 2), maxPerTeam, maxPlayers - people));
}

/** Something the lobby's event log records. Script players are the smoke and load tests'. */
export type LobbyEvent =
  | { readonly event: 'join' | 'leave'; readonly id: PlayerId; readonly name: string; readonly bot: boolean; readonly script: boolean }
  | { readonly event: 'matchStart'; readonly map: string; readonly mode: ModeId; readonly hvb: boolean }
  | {
      readonly event: 'matchEnd';
      readonly map: string;
      readonly mode: ModeId;
      readonly hvb: boolean;
      /** Seconds the match lasted. */
      readonly duration: number;
      readonly result: MatchResult;
    };

/**
 * Bot fill: while anyone is playing, bots top the match up to `perTeam` a
 * side in team modes (twice that in all in free-for-all), giving up a seat
 * to each person who joins and leaving with the last one.
 */
export interface BotOptions {
  /** The first map's nav graph, for the bots to find their way (other maps bring their own). */
  readonly nav: NavGraph;
  /** Bots a side on a map without its own team size; 0 also starts the lobby with bots off. */
  readonly perTeam: number;
  /** The most a side the first joiner may ask for, within the mode's own limit; that limit by default. */
  readonly maxPerTeam?: number;
  /** Keep bots playing with nobody connected (tests and benchmarks). */
  readonly alwaysOn?: boolean;
  /** How a named bot plays, given how it would (a soak's stand-in for a good player). */
  readonly profile?: (name: string, base: BotProfile) => BotProfile;
}

/** Seconds between the bot teams' plans. */
const PLAN_EVERY = 1;
/** Battle Royale: Squads a plan in the countdown may give a first rally, so they're spread over its seconds instead of all in one tick; play gives the rest. */
const FIRST_RALLIES = 8;
/** A tick's mode events when it had none, shared: the profiler copies what it keeps. */
const NO_EVENTS: string[] = [];
/** The most bots a side a lobby offers in a team mode. */
export const MAX_BOTS_PER_TEAM = MATCH_SCALES.tdm.botsPerTeam;
/** Seconds a fresh spawn can't be hurt, unless it fires first. */
export const SPAWN_PROTECTION = 1.5;

/** People and bots a match holds: 6v6. */
export const DEFAULT_MAX_PLAYERS = 12;
/**
 * Seconds a joined client may stay silent before its slot is let go. A playing
 * client sends every frame, pause menu included; only a dead link or a stopped
 * frame loop (a background tab, a minimised window) goes quiet. Its player
 * would otherwise stand frozen in the match, an easy kill, and keep the lobby
 * from ever emptying. Their seat is held as for any drop.
 */
export const IDLE_TIMEOUT = 20;
const BATTLE_ROYALE: ModeId = 'battle-royale';
/** Seconds a connection may stay open without joining. */
const JOIN_TIMEOUT = 10;
/**
 * Seconds a dropped player's seat is held. The match keeps running meanwhile,
 * bots and all, even with everyone gone; a player back in time picks up where
 * they left off, in the same spot with the same health, ammo and score.
 */
export const RECONNECT_GRACE = 300;
const DEFAULT_MAX_MESSAGE = 8 * 1024;
const DEFAULT_RATE = 180;
/**
 * Seconds of the message rate a connection may spend at once: a stalled link
 * hands over everything it held in one go, and that is no flood.
 */
const RATE_BURST = 10;
/** The reason a client gives when its player leaves on purpose: the seat isn't held for them. */
const LEFT = 'client left';
/** Usercmds queued beyond this are dropped (oldest first), bounding the input delay. */
const MAX_QUEUED_CMDS = 12;
/** Ticks of events kept for a client that was sent no snapshot for a while. */
const EVENT_LOG_TICKS = 300;
/** Ticks between the pings' updates: they fill a scoreboard column, and each one would resend it. */
const PING_TICKS = 60;
/** Ticks between looks at how a client's link is coping. */
const PACE_TICKS = 30;
/** Ticks of snapshots on their way, past the link's own delay, that mean its queue is filling. */
const QUEUE_FULL = 9;
/** And that mean it has room. */
const QUEUE_CLEAR = 2;
/** The fewest snapshots a client gets: one every this many ticks. */
const SLOWEST_PACE = 6;
/** Looks in a row with room before trying a faster pace; doubled each time that fails, so a link at its limit stays steady. */
const PATIENCE = 4;
const MOST_PATIENCE = 64;
/** Ticks after speeding up within which falling behind again counts as that having failed. */
const FAILED_TICKS = 300;
/** Ticks the link's delay is remembered: it can only be seen when nothing queues. */
const FLOOR_TICKS = 1200;
/** Ticks a spare usercmd must go unused before it is run off: every one queued is a tick of input delay. */
const SPARE_TICKS = 60;
const MAX_NAME = 16;
/** Ticks over which a match that seats its own wakes its bots. */
const WAKE_TICKS = 30;
/** Events repeated in later snapshots; the rest (shots, impacts, reloads) are cosmetic and sent once. */
const IMPORTANT = new Set(['hit', 'kill', 'down', 'revive', 'killFeed', 'matchEnd', 'matchStart', 'explosion', 'capture', 'roundStart', 'roundEnd', 'charge', 'stage', 'drop', 'loose']);

interface Client {
  readonly connection: Connection;
  id: PlayerId | null;
  name: string;
  /** Highest sequence number processed. */
  ack: number;
  readonly queue: Map<number, UserCmd>;
  /** The fewest usercmds found waiting at a tick, over the last {@link SPARE_TICKS}: those are spares it never needed. */
  spare: number;
  spareTicks: number;
  /** What each sticky field last went out as: left out until it differs. */
  sticky: Partial<Record<StickyField, Uint8Array>>;
  /** The tick of the last snapshot sent. */
  sentTick: number;
  /** The tick each seat in its view last went out: a seat not in here isn't in its view. */
  readonly seats: Map<PlayerId, number>;
  /** Ticks between its snapshots: more when its link can't take them all. */
  pace: number;
  /** Ticks between the newest snapshot it reports and now, at the last report. */
  behind: number;
  /** The least `behind` seen lately, and in the window before: the link's own delay. */
  floor: number;
  floorBefore: number;
  floorSince: number;
  /** Looks in a row its queue had room, and how many it takes to speed up. */
  clear: number;
  patience: number;
  /** When it was last sped up. */
  spedUp: number;
  /** The round trip (ms) the client last reported. */
  ping: number;
  /** Messages it may send now, refilled at the message rate. */
  allowance: number;
  refilled: number;
  /** Simulation time of the client's last message. */
  heard: number;
  /** The seat's secret, sent in the welcome; joining again with it takes the seat back after a drop. */
  token: string;
  /** Joined by the smoke or load-test script. */
  script: boolean;
  /** What the player carries from their next spawn; null for the default. */
  loadout: Loadout | null;
  /** The seat it watches while out of the fight (ticket 32): its view is measured from there. */
  watch: PlayerId | null;
}

/** A seat held for a player who dropped, until they come back or the grace period runs out. */
interface AwaySeat {
  readonly id: PlayerId;
  readonly name: string;
  readonly token: string;
  /** Their full simulation state and scoreboard row when they dropped. */
  readonly state: PlayerState;
  readonly score: Score;
  /** The match they left; back in a later one, they join it fresh. */
  readonly match: number;
  /** Simulation time the seat is let go. */
  readonly until: number;
  /** They left on purpose in the Preparation: held only until the dive begins. */
  readonly left?: boolean;
}

/** What the lobby status endpoint reports. */
export interface LobbyStatus {
  readonly map: string;
  readonly mode: ModeId;
  /** People playing (bots aside). */
  readonly players: number;
  /** Seats held for people who dropped and may come back; the match runs on for them. */
  readonly away: number;
  readonly capacity: number;
  readonly phase: Phase;
  /** Bots playing now. */
  readonly bots: number;
  /** Bots a side the lobby fills to now (the first joiner's choice, or the default). */
  readonly botsPerTeam: number;
  /** The most bots a side a first joiner may ask for; 0 when the server has no bots. */
  readonly maxBotsPerTeam: number;
  /** Whether the host picks and starts each match in a lobby (the join form then asks only for a name). */
  readonly lobby: boolean;
  /** Whether the match is humans vs bots. */
  readonly hvb: boolean;
  /** The mode the lobby is set for next: a Battle Royale screen tells its own lobby from the team modes' by it. */
  readonly lobbyMode: ModeId;
  /** Seats a Squad in the next Battle Royale. */
  readonly squadSize: SquadSize;
  /** Whether the server holds a map that plays Battle Royale. */
  readonly royale: boolean;
}

/** An event ready for the wire. */
interface LoggedEvent {
  readonly tick: number;
  readonly type: (SimEvent | ModeEvent)['type'];
  readonly bytes: Uint8Array;
  /** Who it's for; null where every seat goes to everyone. */
  readonly reach: EventReach | null;
}

interface BotSeat {
  readonly bot: Bot;
  readonly name: string;
}

/**
 * The authoritative server: owns the real simulation, accepts joins
 * (passphrase, player cap), runs each client's usercmds in order, applies the
 * game mode and sends every client a snapshot each tick.
 *
 * Between matches it runs the intermission: `matchEnd`, the nuke, the
 * scoreboard and mode vote, then `matchStart`. Usercmds are ignored and no
 * damage is done for the whole of it. The mode only changes at match start.
 */
export class GameServer {
  readonly simulation: Simulation;
  readonly #options: GameServerOptions;
  readonly #modes: Readonly<Record<ModeId, GameMode>>;
  #mode: GameMode;
  #phase: Phase;
  /** The host's pick for the next match, on a server with a lobby. */
  #lobbyMode: ModeId;
  /** The host pressed start; the match starts on the next tick. */
  #startRequested = false;
  /** Simulation time the current match started, and the time it ended (null while it is on). */
  #matchStart = 0;
  #endedAt: number | null = null;
  #result: MatchResult | null = null;
  readonly #votes = new Map<PlayerId, ModeId>();
  #modeEvents: readonly ModeEvent[] = [];
  readonly #clients = new Set<Client>();
  readonly #names = new Map<PlayerId, string>();
  #nextId = 1;
  /** The events still repeated for lossy connections. */
  #recentEvents: LoggedEvent[] = [];
  /** Events for a while back, for reliable connections, which get exactly those they haven't had. */
  #eventLog: LoggedEvent[] = [];
  /** Each sticky field as it last changed, one array per version: a client's copy is the same array until then. */
  readonly #sticky: Partial<Record<StickyField, Uint8Array>> = {};
  /** The sticky fields that may have changed since they were last packed. */
  readonly #stale = new Set<StickyField>(STICKY_FIELDS);
  /** Nothing in the match status moved last tick: a tick of plain play leaves it as it was. */
  #settled = false;
  #pings: Readonly<Record<string, number>> = {};
  /** The tick each seat last fired: gunfire brings a seat into view for those who hear it. */
  readonly #firedAt = new Map<PlayerId, number>();
  #last: TickOutput;
  /** The players of `#last`, indexed. */
  #seatIndex: SeatIndex;
  /** Props shot this match; cleared when a match starts. */
  readonly #popped = new Set<string>();
  readonly #bots = new Map<PlayerId, BotSeat>();
  /** Bots on: they fill each match to its map's team size, or to the host's own size while one is set. */
  #fill: boolean;
  #customBots: number | null = null;
  /** Humans vs bots as picked (on only in team modes: see #hvbOn). */
  #hvb: boolean;
  /** The maps the server holds, the one played now and the one the host picked for the next match. */
  readonly #maps: readonly ServerMap[];
  #map: ServerMap;
  #lobbyMap: ServerMap;
  /** The latest tick's simulation events, for the bots to hear. */
  #lastEvents: readonly SimEvent[] = [];
  /** What this tick has done so far, for the probe. */
  readonly #facts = noFacts();
  /** When each player last spawned, while their spawn protection lasts. */
  readonly #protectedSince = new Map<PlayerId, number>();
  /** Held seats by token. */
  readonly #away = new Map<string, AwaySeat>();
  /** Seats whose player has gone, in a mode that seats its own: a bot plays each until they're back or the match is over. */
  readonly #standIns = new Set<PlayerId>();
  /** Counts matches started, so a held seat knows whether its match is still on. */
  #matchNumber = 0;
  /** Each bot's objective from its team's planner, and when the plan is next made. */
  #orders = new Map<PlayerId, BotObjective>();
  /** Battle Royale: this match's Squad brain, and what it last told each bot. */
  #squads: SquadPlanner | null = null;
  #grounds: ReadonlyMap<PlayerId, GroundOrder> = new Map();
  #planAt = 0;
  /** Players holding the use button, as of their latest usercmd. */
  readonly #using = new Set<PlayerId>();
  /** Battle Royale: the Squad each person picked or was given in the lobby (see #lobbySquads). */
  #squadPicks = new Map<PlayerId, number>();
  /**
   * Battle Royale's Preparation: when it began (null outside one), the people
   * ready to drop and the pages that have loaded (both kept through the match,
   * since a page that loads late takes its seat back from its bot).
   */
  #prepStart: number | null = null;
  readonly #ready = new Set<PlayerId>();
  readonly #loaded = new Set<PlayerId>();

  constructor(transport: ServerTransport, options: GameServerOptions) {
    this.#options = options;
    this.#modes = {
      tdm: new TeamDeathmatch(options.modes?.tdm),
      ffa: new FreeForAll(options.modes?.ffa),
      outposts: new Outposts(options.modes?.outposts),
      charge: new Charge(options.modes?.charge),
      gungame: new GunGame(options.modes?.gungame),
      'battle-royale': new BattleRoyale(options.modes?.battleRoyale),
    };
    const first: ServerMap = {
      id: options.map ?? 'range',
      world: options.world,
      spawns: options.spawns,
      ...(options.teamSpawns ? { teamSpawns: options.teamSpawns } : {}),
      ...(options.zones ? { zones: options.zones } : {}),
      ...(options.sites ? { sites: options.sites } : {}),
      ...(options.bots ? { nav: options.bots.nav } : {}),
      ...(options.teamSize ? { teamSize: options.teamSize } : {}),
    };
    this.#maps = [first, ...(options.maps ?? []).filter((m) => m.id !== first.id)];
    this.#map = first;
    this.#lobbyMap = first;
    this.#mode = this.#modes[options.mode ?? 'tdm'];
    this.#lobbyMode = this.#mode.id;
    this.#phase = options.lobby ? 'lobby' : 'playing';
    this.simulation = new Simulation(options.world, {
      canDamage: (a, v) => this.#phase === 'playing' && (v.kind === 'dummy' || (this.#mode.canDamage(a, v) && !this.#spawnProtected(v.id))),
      selfDamage: () => this.#phase === 'playing',
      hazard: (position) => this.#hazardAt(position),
      frags: () => this.#mode.frags ?? STATS.grenade.perLife.value,
      downs: () => this.#mode.downs?.() ?? false,
    });
    for (const dummy of options.dummies ?? []) this.simulation.addPlayer(dummy);
    this.#fill = this.#defaultFill();
    this.#hvb = options.hvb === true;
    this.#last = this.simulation.output();
    this.#seatIndex = new SeatIndex(this.#last.players);
    transport.onConnection((connection) => this.#accept(connection));
    if (options.bots?.alwaysOn) this.#startMatch(this.#mode.id);
  }

  #defaultFill(): boolean {
    return (this.#options.bots?.perTeam ?? 0) > 0;
  }

  /** What the mode's hazard takes at `position`: nothing until the match's clock runs. */
  #hazardAt(position: Vec3): number {
    if (!this.#mode.hazardAt || this.#phase !== 'playing' || this.#countingDown) return 0;
    return this.#mode.hazardAt(position, this.simulation.time - this.#matchStart);
  }

  /** The seats of the match being played, or in the lobby of the one picked, in a mode that seats its own. */
  get #fixedSeats(): number | undefined {
    return this.#modes[this.#phase === 'lobby' ? this.#lobbyMode : this.#mode.id].fixedSeats;
  }

  /**
   * Whether `map` can play `mode`: a mode that seats its own is played only
   * where the map says so; every other anywhere but on a map that names only
   * modes that seat their own (Zero Island plays Battle Royale and nothing else).
   */
  #plays(mode: ModeId, map: ServerMap): boolean {
    if (this.#modes[mode].fixedSeats !== undefined) return map.teamSize?.[mode] !== undefined;
    const named = Object.keys(map.teamSize ?? {}) as ModeId[];
    return named.length === 0 || named.some((m) => this.#modes[m]?.fixedSeats === undefined);
  }

  /** Where the lobby goes to play `mode`: the map picked if it plays it, else the first that does. */
  #mapFor(mode: ModeId, picked: ServerMap = this.#lobbyMap): ServerMap | null {
    return this.#plays(mode, picked) ? picked : (this.#maps.find((m) => this.#plays(mode, m)) ?? null);
  }

  get #royale(): BattleRoyale {
    return this.#modes[BATTLE_ROYALE] as BattleRoyale;
  }

  /**
   * Each person's Squad for the next Battle Royale, made whole: a Squad picked
   * keeps them while it has room (first come, first kept), and anyone else
   * joins the first Squad with people in it and room, else a Squad of their own.
   */
  #lobbySquads(): Map<PlayerId, number> {
    const size = this.#royale.squadSize;
    const most = Math.floor(WIDE_SCALE.seats / size);
    const count = new Map<number, number>();
    const placed = new Map<PlayerId, number>();
    const rest: PlayerId[] = [];
    for (const c of this.#joined()) {
      const id = c.id as PlayerId;
      const squad = this.#squadPicks.get(id);
      if (squad !== undefined && squad <= most && (count.get(squad) ?? 0) < size) {
        placed.set(id, squad);
        count.set(squad, (count.get(squad) ?? 0) + 1);
      } else rest.push(id);
    }
    for (const id of rest) {
      let squad = size > 1 ? [...count.keys()].sort((a, b) => a - b).find((s) => count.get(s)! < size) : undefined;
      if (squad === undefined) for (squad = 1; count.has(squad); squad++);
      placed.set(id, squad);
      count.set(squad, (count.get(squad) ?? 0) + 1);
    }
    this.#squadPicks = placed;
    return placed;
  }

  /** A person asks for a Squad: theirs if it has room without them. */
  #pickSquad(id: PlayerId, squad: number): void {
    const squads = this.#lobbySquads();
    if (squad > Math.floor(WIDE_SCALE.seats / this.#royale.squadSize)) return;
    const others = [...squads].filter(([who, s]) => who !== id && s === squad).length;
    if (others < this.#royale.squadSize) squads.set(id, squad);
  }

  /** Bots a side a match on `map` in `mode` fills to: none with bots off, else the host's own size or the map's. */
  #botsFor(map: ServerMap, mode: ModeId): number {
    const b = this.#options.bots;
    if (!b || !this.#fill) return 0;
    const size = this.#customBots ?? map.teamSize?.[mode] ?? (b.perTeam || 3);
    return Math.max(0, Math.min(size, this.maxBotsPerTeam));
  }

  /** Whether this match is humans vs bots: picked, in a team mode, with bots to play. */
  get #hvbOn(): boolean {
    return this.#hvb && teamMode(this.#mode.id) && this.#options.bots !== undefined && this.#map.nav !== undefined;
  }

  /** The limits of the match being played, or in the lobby of the one picked. */
  get #scale(): MatchScale {
    return this.#options.scale ?? MATCH_SCALES[this.#phase === 'lobby' ? this.#lobbyMode : this.#mode.id];
  }

  /** The most bots a side a first joiner may ask for (0 without bots). */
  get maxBotsPerTeam(): number {
    const b = this.#options.bots;
    const most = this.#scale.botsPerTeam;
    return b ? Math.min(b.maxPerTeam ?? most, most) : 0;
  }

  /** Bots playing now, by id. */
  get bots(): ReadonlyMap<PlayerId, { readonly name: string; readonly bot: Bot }> {
    return this.#bots;
  }

  /** The mode being played. */
  get mode(): GameMode {
    return this.#mode;
  }

  get phase(): Phase {
    return this.#phase;
  }

  /** What the lobby status endpoint reports. */
  status(): LobbyStatus {
    return {
      map: this.#map.id,
      mode: this.#mode.id,
      players: this.playerCount,
      away: this.#away.size,
      capacity: this.maxPlayers,
      phase: this.#phase,
      bots: this.#bots.size,
      botsPerTeam: this.#botsFor(this.#map, this.#mode.id),
      maxBotsPerTeam: this.maxBotsPerTeam,
      lobby: this.#options.lobby === true,
      hvb: this.#hvbOn,
      lobbyMode: this.#lobbyMode,
      squadSize: this.#royale.squadSize,
      royale: this.#maps.some((m) => this.#plays(BATTLE_ROYALE, m)),
    };
  }

  /** Who picks and starts the next match: the first person still here, a script player only when nobody else is. */
  get host(): PlayerId | null {
    const joined = this.#joined();
    return (joined.find((c) => !c.script) ?? joined[0])?.id ?? null;
  }

  #lobbyState(): LobbyState | null {
    if (!this.#options.lobby) return null;
    return {
      host: this.host,
      players: this.#joined().map((c) => c.id as PlayerId),
      capacity: this.maxPlayers,
      mode: this.#lobbyMode,
      bots: this.#botsFor(this.#lobbyMap, this.#lobbyMode),
      custom: this.#customBots !== null,
      maxBots: this.maxBotsPerTeam,
      hvb: this.#hvb,
      maps: this.#maps.filter((m) => this.#plays(this.#lobbyMode, m)).map((m) => m.id),
      map: this.#lobbyMap.id,
      squadSize: this.#royale.squadSize,
      squads: Object.fromEntries(this.#lobbyMode === BATTLE_ROYALE ? this.#lobbySquads() : []),
    };
  }

  /** The match status sent in every snapshot. */
  matchStatus(): MatchStatus {
    const { nuke, vote } = this.#intermissionLengths();
    const ended = this.#endedAt ?? 0;
    const votes = Object.fromEntries(LOBBY_MODES.map((m) => [m, 0])) as Record<ModeId, number>;
    for (const m of this.#votes.values()) votes[m] += 1;
    const limit = this.#mode.timeLimit;
    const phaseEnds = this.#phase === 'playing' ? (limit === null ? null : this.#matchStart + limit) : this.#phase === 'nuke' ? ended + nuke : this.#phase === 'vote' ? ended + nuke + vote : null;
    return {
      map: this.#map.id,
      mode: this.#mode.id,
      phase: this.#phase,
      phaseEnds,
      countdownEnds: this.#countingDown ? this.#matchStart : null,
      preparation: this.#preparation(),
      killLimit: this.#mode.killLimit,
      scoreLimit: this.#mode.scoreLimit,
      timeLimit: limit,
      respawnDelay: this.#mode.respawnDelay,
      teamScores: this.#mode.teamScores(),
      votes,
      next: this.#nextMode(),
      result: this.#result,
      objective: this.#mode.objective(),
      lobby: this.#lobbyState(),
    };
  }

  get maxPlayers(): number {
    return this.#fixedSeats ?? Math.min(this.#options.maxPlayers ?? DEFAULT_MAX_PLAYERS, this.#scale.seats);
  }

  /** Players currently joined. */
  get playerCount(): number {
    return [...this.#clients].filter((c) => c.id !== null).length;
  }

  /** People playing plus seats held for those who dropped: what bots and the player cap make room for. */
  get #seated(): number {
    return this.playerCount + this.#away.size;
  }

  get latest(): TickOutput {
    return this.#last;
  }

  /** The game-mode and match-flow events of the latest tick (kill feed, match end and start). */
  get modeEvents(): readonly ModeEvent[] {
    return this.#modeEvents;
  }

  /** Display names of joined players by id. */
  get names(): ReadonlyMap<PlayerId, string> {
    return this.#names;
  }

  /** Ids of the props shot this match, in the order they went. */
  get popped(): readonly string[] {
    return [...this.#popped];
  }

  #accept(connection: Connection): void {
    const client: Client = { connection, id: null, name: '', ack: 0, queue: new Map(), spare: Infinity, spareTicks: 0, sticky: {}, sentTick: this.#last.tick, seats: new Map(), pace: 1, behind: 0, floor: Infinity, floorBefore: Infinity, floorSince: this.#last.tick, clear: 0, patience: PATIENCE, spedUp: -Infinity, ping: 0, allowance: this.#rate * RATE_BURST, refilled: this.simulation.time, heard: this.simulation.time, token: '', script: false, loadout: null, watch: null };
    this.#clients.add(client);
    connection.onMessage((data) => this.#receive(client, data));
    connection.onClose((reason) => this.#drop(client, reason !== LEFT));
  }

  get #rate(): number {
    return this.#options.maxMessagesPerSecond ?? DEFAULT_RATE;
  }

  #reject(client: Client, reason: RejectReason): void {
    this.#send(client, { t: 'reject', reason });
    client.connection.close(`rejected: ${reason}`);
    this.#clients.delete(client);
  }

  #receive(client: Client, data: WireData): void {
    // What was already on its way when the connection was closed.
    if (!this.#clients.has(client)) return;
    const now = this.simulation.time;
    client.heard = now;
    client.allowance = Math.min(this.#rate * RATE_BURST, client.allowance + (now - client.refilled) * this.#rate) - 1;
    client.refilled = now;
    if (client.allowance < 0) {
      client.connection.close('rate limit');
      return;
    }
    if (data.length > (this.#options.maxMessageSize ?? DEFAULT_MAX_MESSAGE)) {
      client.connection.close('message too large');
      return;
    }
    // Clients only ever send text.
    const message = typeof data === 'string' ? decodeClient(data) : null;
    if (!message) {
      client.connection.close('malformed message');
      return;
    }
    if (client.id === null) {
      // Nothing but a valid join is accepted before the passphrase check passes.
      if (message.t !== 'join') {
        client.connection.close('join first');
        return;
      }
      client.script = message.script === true;
      client.loadout = message.loadout ?? null;
      this.#join(client, message.name, message.passphrase, message.protocol, message.mode ?? null, message.bots ?? null, message.hvb ?? null, message.resume ?? null);
      return;
    }
    if (message.t === 'join') {
      // The welcome was lost: say it again.
      this.#welcome(client);
      return;
    }
    if (message.t === 'watch') {
      client.watch = message.id as PlayerId | null;
      return;
    }
    if (message.t === 'ready' || message.t === 'loaded') {
      this.#prepared(client, message.t);
      return;
    }
    if (message.t === 'loadout') {
      client.loadout = message.loadout;
      // A Battle Royale's loadout is locked when its Preparation ends: a later pick waits for the next match (ticket 59).
      if (this.#phase === 'playing' && this.#mode.id === BATTLE_ROYALE && !this.#countingDown) return;
      // In a round's freeze the change is made at once, where the player stands.
      if (this.#phase === 'playing' && (this.#countingDown || this.#mode.frozen()) && this.#seatIndex.get(client.id)?.alive) {
        this.simulation.equip(client.id, this.#loadoutOf(client.id).loadout ?? message.loadout);
      }
      return;
    }
    if (message.t === 'vote') {
      if (this.#phase === 'vote' && !this.#options.lobby && LOBBY_MODES.includes(message.mode)) this.#votes.set(client.id, message.mode);
      return;
    }
    if (message.t === 'lobby' || message.t === 'start') {
      // Only the host, and only in the lobby.
      if (this.#phase !== 'lobby' || client.id !== this.host) return;
      if (message.t === 'start') this.#startRequested = true;
      else {
        // The mode and map asked for, else the mode on a map that plays it, else no change.
        const picked = this.#maps.find((m) => m.id === message.map);
        const asked = message.mode ?? this.#lobbyMode;
        const [mode, map] = picked && this.#plays(asked, picked) ? [asked, picked] : this.#mapFor(asked) ? [asked, this.#mapFor(asked)!] : [this.#lobbyMode, this.#lobbyMap];
        // The host's own size lasts until the map or the mode changes: then the new pick's team size applies.
        if (mode !== this.#lobbyMode || map !== this.#lobbyMap) this.#customBots = null;
        this.#lobbyMode = mode;
        this.#lobbyMap = map;
        if (message.fill !== undefined) {
          this.#fill = message.fill;
          this.#customBots = null;
        }
        if (message.bots !== undefined) this.#setCustomBots(message.bots);
        if (message.hvb !== undefined) this.#hvb = message.hvb;
        if (message.squads !== undefined) this.#royale.squadSize = message.squads;
      }
      return;
    }
    if (message.t === 'squad') {
      if (this.#phase === 'lobby' && this.#lobbyMode === BATTLE_ROYALE) this.#pickSquad(client.id, message.squad);
      return;
    }
    if (message.t === 'cmds') {
      if (message.ping !== undefined) client.ping = message.ping;
      if (message.seen !== undefined) this.#heardSeen(client, message.seen);
      for (const { seq, cmd } of message.cmds) {
        if (seq > client.ack && !client.queue.has(seq)) client.queue.set(seq, cmd);
      }
      if (client.queue.size > MAX_QUEUED_CMDS) {
        const keep = [...client.queue.keys()].sort((a, b) => a - b).slice(-MAX_QUEUED_CMDS);
        for (const seq of [...client.queue.keys()]) if (!keep.includes(seq)) client.queue.delete(seq);
      }
    }
  }

  #join(client: Client, rawName: string, passphrase: string, protocol: number, preferred: ModeId | null, bots: number | null, hvb: boolean | null, resume: string | null): void {
    if (protocol !== PROTOCOL_VERSION) return this.#reject(client, 'protocol');
    if (this.#options.passphrase && !samePassphrase(passphrase, this.#options.passphrase)) return this.#reject(client, 'passphrase');
    if (resume !== null) {
      // The seat is still connected (a half-open socket, another tab): that connection drops, holding the seat for this one.
      const holder = [...this.#clients].find((c) => c !== client && c.id !== null && c.token === resume);
      if (holder) {
        this.#drop(holder);
        holder.connection.close('replaced');
      }
      const away = this.#away.get(resume);
      if (away) return this.#resume(client, away);
    }
    if (this.#seated >= this.maxPlayers) return this.#reject(client, 'full');
    const name = cleanName(rawName);
    if (!name) return this.#reject(client, 'name');
    const first = this.#seated === 0;
    const id = `p${this.#nextId++}`;
    client.id = id;
    client.name = name;
    client.token = seatToken();
    this.#renamed();
    this.#names.set(id, name);
    this.#log({ event: 'join', id, name, bot: false, script: client.script });
    if (first && !this.#options.bots?.alwaysOn) {
      // The first player on an empty server starts afresh, in the mode and with the bots they asked for:
      // in the lobby as its host, or straight into a match (a script player always, to load the server).
      if (bots !== null) this.#setCustomBots(bots);
      if (hvb !== null) this.#hvb = hvb;
      this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0], ...this.#loadoutOf(id) });
      // A mode asked for goes to a map that plays it; with none asked, a lobby left on a mode that seats its own goes back to the server's own.
      const own = this.#options.mode ?? 'tdm';
      const want = preferred ?? (this.#modes[this.#lobbyMode].fixedSeats !== undefined ? own : null);
      const map = want === null ? null : this.#mapFor(want);
      const asked = map ? want : null;
      if (map) this.#lobbyMap = map;
      // A match that seats its own only starts when asked, so a script's other players don't all arrive to spectate.
      if (this.#options.lobby && (!client.script || this.#modes[asked ?? this.#mode.id].fixedSeats !== undefined)) {
        this.#lobbyMode = asked ?? this.#lobbyMode;
        this.#openLobby();
      } else this.#startMatch(asked ?? this.#mode.id);
    } else if (this.#phase === 'lobby') {
      // Into the lobby: they play from the next match.
      this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0], ...this.#loadoutOf(id) });
    } else if (this.#fixedSeats === undefined) {
      // A bot gives up its seat first (the newcomer already counts), so the newcomer joins the side it left.
      this.#fillBots();
      this.#add(id, name);
    }
    // Otherwise, too late for a match that seats its own: they spectate it, and take a bot's seat at the next.
    this.#welcome(client);
  }

  /** Bots a side of the host's own (or a first joiner's): 0 turns bots off. */
  #setCustomBots(bots: number): void {
    this.#fill = bots > 0;
    this.#customBots = bots > 0 ? Math.min(bots, this.maxBotsPerTeam) : null;
  }

  #welcome(client: Client): void {
    if (client.id === null) return;
    this.#send(client, { t: 'welcome', id: client.id, tick: this.simulation.tick, mode: this.#mode.id, map: this.#map.id, maxPlayers: this.maxPlayers, token: client.token });
  }

  /** A player back in their held seat: in the match they left, exactly where and as they were; in a later one, joining it fresh. */
  #resume(client: Client, away: AwaySeat): void {
    this.#away.delete(away.token);
    client.id = away.id;
    client.name = away.name;
    client.token = away.token;
    this.#renamed();
    this.#names.set(away.id, away.name);
    this.#log({ event: 'join', id: away.id, name: away.name, bot: false, script: client.script });
    if (this.#standIns.delete(away.id)) {
      // The bot hands the seat back as it stands, wherever it took it and alive or not.
      this.#bots.delete(away.id);
      this.#protectedSince.set(away.id, this.simulation.time);
    } else if (away.match === this.#matchNumber) {
      this.#mode.rejoin(away.score);
      this.simulation.setPlayerState(away.state);
      // A moment's protection while the returning page finds its feet.
      this.#protectedSince.set(away.id, this.simulation.time);
    } else if (this.#phase === 'lobby') this.simulation.addPlayer({ id: away.id, team: 0, position: [0, 0, 0], ...this.#loadoutOf(away.id) });
    else if (this.#fixedSeats === undefined) this.#add(away.id, away.name);
    this.#welcome(client);
  }

  #intermissionLengths(): { nuke: number; vote: number } {
    const vote = this.#options.lobby ? INTERMISSION.scoreboard : INTERMISSION.vote;
    return { nuke: this.#options.intermission?.nuke ?? INTERMISSION.nuke, vote: this.#options.intermission?.vote ?? vote };
  }

  /** Everyone back to the lobby: no match, no bots, the last result kept for the lobby to show. */
  #openLobby(): void {
    this.#phase = 'lobby';
    this.#startRequested = false;
    this.#votes.clear();
    this.#protectedSince.clear();
    this.#endStandIns();
    this.#fillBots();
  }

  /** The vote's plurality; a tie or no votes keeps the current mode. */
  #nextMode(): ModeId {
    const counts = new Map<ModeId, number>();
    for (const m of this.#votes.values()) counts.set(m, (counts.get(m) ?? 0) + 1);
    const [top, second] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!top || (second && second[1] === top[1])) return this.#mode.id;
    return top[0];
  }

  /** A new match in `mode`: scores reset, teams (re)balanced, everyone respawned at fresh spawns, props restored. */
  #startMatch(mode: ModeId): ModeEvent {
    const previous = this.#mode;
    this.#mode = this.#modes[mode];
    this.#matchNumber += 1;
    this.#phase = 'playing';
    this.#startRequested = false;
    this.#matchStart = this.simulation.time;
    this.#endedAt = null;
    this.#result = null;
    this.#votes.clear();
    this.#popped.clear();
    this.#stale.add('popped').add('scores').add('match');
    this.#planAt = 0;
    this.#protectedSince.clear();
    this.#endStandIns();
    this.#squads = null;
    this.#grounds = new Map();
    if (this.#lobbyMap !== this.#map) this.#switchMap(this.#lobbyMap);
    // A Battle Royale's bots play to their own profile, so into one or out of one they're briefed afresh.
    else if ((previous.id === BATTLE_ROYALE) !== (this.#mode.id === BATTLE_ROYALE)) this.#freshBots();
    // This match's bots first: new ones join the simulation here and get their team below.
    this.#rosterBots();
    // Bots kept from the last match start this one knowing nothing of it.
    for (const { bot } of this.#bots.values()) bot.newMatch();
    // Those who spectated the last match have no seat yet.
    for (const seat of this.#joined()) {
      const id = seat.id as PlayerId;
      if (!this.simulation.has(id)) this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0], ...this.#loadoutOf(id) });
    }
    const seats = this.#seats();
    const squads = this.#mode.id === BATTLE_ROYALE ? this.#lobbySquads() : null;
    const entrants = seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      // Teams carry over only between matches of the same mode.
      team: previous.id === this.#mode.id ? (this.simulation.playerStateView(seat.id)?.team ?? null) : null,
      ...this.#sideOf(seat.id),
      ...(squads?.has(seat.id) ? { squad: squads.get(seat.id)! } : {}),
    }));
    const teams = this.#mode.start(entrants, this.#context());
    // The match (and its clock) starts after the opening countdown; a mode that opens with a freeze of its own (Charge) needs none.
    const royale = this.#mode.id === BATTLE_ROYALE;
    if (!this.#mode.frozen()) this.#matchStart = this.simulation.time + (this.#options.countdown ?? (royale ? PREPARATION.seconds : MATCH_COUNTDOWN));
    this.#prepStart = royale && this.#countingDown ? this.simulation.time : null;
    this.#ready.clear();
    this.#loaded.clear();
    for (const [id, team] of teams) this.simulation.setTeam(id, team);
    // A mode that seats its own has every spawn dealt: its spawns needn't look at the seats before them.
    const dealt = this.#mode.fixedSeats === undefined ? null : this.#context();
    for (const seat of seats) this.#spawn(seat.id, this.#mode.chooseSpawn(seat.id, dealt ?? this.#context()));
    this.#log({ event: 'matchStart', map: this.#map.id, mode: this.#mode.id, hvb: this.#hvbOn });
    return { type: 'matchStart', mode: this.#mode.id };
  }

  /** Onto another map at a match's start: its world for the simulation, fresh bot brains that know its ways, and its props all standing. */
  #switchMap(map: ServerMap): void {
    this.#map = map;
    this.simulation.setWorld(map.world);
    this.#orders = new Map();
    this.#freshBots();
  }

  /** New brains for the bots: ones that know the map and play as this mode asks. */
  #freshBots(): void {
    const { nav, world } = this.#map;
    for (const [id, seat] of this.#bots) {
      if (nav) this.#bots.set(id, { ...seat, bot: new Bot(id, this.#profile(seat.name), nav, world) });
      else this.#dismissBot(id);
    }
  }

  /** Joined clients in join order. */
  #joined(): Client[] {
    return [...this.#clients].filter((c) => c.id !== null).sort((a, b) => Number((a.id as string).slice(1)) - Number((b.id as string).slice(1)));
  }

  /** Everyone playing, people and bots, in join order. */
  #seats(): { id: PlayerId; name: string }[] {
    const seats = [...this.#joined().map((c) => ({ id: c.id as PlayerId, name: c.name })), ...[...this.#bots].map(([id, b]) => ({ id, name: b.name }))];
    return seats.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }

  /**
   * A player into the running match: the mode picks the team and spawn. In a
   * round under way, where nobody respawns, they wait dead for the next round.
   */
  #add(id: PlayerId, name: string): void {
    const ctx = this.#context();
    const team = this.#mode.join(id, name, ctx, this.#sideOf(id).side);
    const spawn = this.#mode.chooseSpawn(id, ctx);
    this.simulation.addPlayer({ id, team, position: spawn.position, yaw: spawn.yaw, ...this.#loadoutOf(id) });
    this.#protectedSince.set(id, this.simulation.time);
    if (this.#phase === 'playing' && !this.#mode.canRespawn(id) && !this.#mode.frozen()) {
      const state = this.simulation.playerState(id)!;
      this.simulation.setPlayerState({ ...state, health: 0, diedAt: this.simulation.time });
    }
  }

  /** The side humans vs bots puts a player on (people first, bots second), as entrant fields; none otherwise. */
  #sideOf(id: PlayerId): { side?: TeamId } {
    return this.#hvbOn ? { side: this.#bots.has(id) ? TEAMS[1] : TEAMS[0] } : {};
  }

  /** The loadout a player's next spawn carries (the mode's, else their pick or a bot's from its profile), as spawn options (empty for the default). */
  #loadoutOf(id: PlayerId): { loadout?: Loadout } {
    const loadout = this.#mode.loadoutOf?.(id) ?? [...this.#clients].find((c) => c.id === id)?.loadout ?? this.#bots.get(id)?.bot.profile.loadout ?? null;
    // In a Battle Royale the sniper comes only from a Supply Drop (ticket 71).
    return loadout ? { loadout: this.#mode.id === BATTLE_ROYALE ? royaleLoadout(loadout) : loadout } : {};
  }

  #remove(id: PlayerId): void {
    this.simulation.removePlayer(id);
    this.#mode.leave(id);
    this.#renamed();
    this.#names.delete(id);
    this.#votes.delete(id);
    this.#protectedSince.delete(id);
    this.#using.delete(id);
  }

  /** (Re)spawns a player, protected for a moment. */
  #spawn(id: PlayerId, spawn: SpawnPoint): void {
    this.simulation.respawn(id, spawn.position, spawn.yaw, this.#loadoutOf(id).loadout);
    this.#protectedSince.set(id, this.simulation.time);
  }

  /** The Preparation as the match status tells it, while it runs. */
  #preparation(): PreparationState | null {
    if (this.#prepStart === null || !this.#countingDown) return null;
    const people = this.#preparing();
    return {
      start: this.#prepStart,
      ready: people.filter((c) => this.#ready.has(c.id as PlayerId)).map((c) => c.id as string),
      people: people.length,
      loading: people.filter((c) => !this.#hasLoaded(c)).length,
    };
  }

  /** The people with a seat in this match's Preparation, in join order. */
  #preparing(): Client[] {
    return this.#joined().filter((c) => this.simulation.has(c.id as PlayerId));
  }

  /** A script has nothing to load. */
  #hasLoaded(client: Client): boolean {
    return client.script || this.#loaded.has(client.id as PlayerId);
  }

  /** A person says they're ready, or that their page has loaded (which takes a seat back from the bot that held it). */
  #prepared(client: Client, what: 'ready' | 'loaded'): void {
    const id = client.id as PlayerId;
    if (this.#phase !== 'playing' || this.#mode.id !== BATTLE_ROYALE) return;
    if (what === 'ready') {
      if (this.#prepStart === null || !this.#countingDown || this.#ready.has(id)) return;
      this.#ready.add(id);
    } else {
      if (this.#loaded.has(id)) return;
      this.#loaded.add(id);
      if (this.#standIns.delete(id)) {
        // The bot that held the seat hands it over as it stands.
        this.#bots.delete(id);
        this.#protectedSince.set(id, this.simulation.time);
      }
    }
    this.#stale.add('match');
    this.#prepare();
  }

  /**
   * The Preparation's clock: everyone ready brings the dive forward; the dive
   * waits for pages still loading, up to a limit; and when it is over, a bot
   * holds the seat of any page that hasn't loaded, until it has.
   */
  #prepare(): void {
    if (this.#prepStart === null) return;
    const now = this.simulation.time;
    const people = this.#preparing();
    if (!this.#countingDown) {
      this.#prepStart = null;
      this.#stale.add('match');
      for (const c of people) if (!this.#hasLoaded(c)) this.#standIn(c.id as PlayerId, c.name);
      return;
    }
    const length = this.#options.countdown ?? PREPARATION.seconds;
    const dive = Math.min(PREPARATION.dive, length);
    const loaded = people.every((c) => this.#hasLoaded(c));
    // One who left and may still come back isn't ready: with nobody else in it, the hold doesn't end early.
    const ready = people.every((c) => this.#ready.has(c.id as PlayerId)) && ![...this.#away.values()].some((a) => a.left);
    const diveAt = this.#matchStart - dive;
    let start = this.#matchStart;
    if (!loaded) {
      // Up to the limit past the dive's moment, the dive waits.
      if (now >= diveAt - 1e-9) start = Math.max(start, this.#prepStart + length + PREPARATION.loadLimit);
    } else if (ready || now > this.#prepStart + length - dive) start = Math.min(start, now + dive);
    if (Math.abs(start - this.#matchStart) > 1e-9) {
      this.#matchStart = start;
      this.#stale.add('match');
    }
  }

  /** Whether the match's opening countdown is running: everyone held, the clock not yet started. */
  get #countingDown(): boolean {
    return this.#phase === 'playing' && this.simulation.time < this.#matchStart - 1e-9;
  }

  #spawnProtected(id: PlayerId): boolean {
    const since = this.#protectedSince.get(id);
    return since !== undefined && this.simulation.time - since < (this.#options.spawnProtection ?? SPAWN_PROTECTION) - 1e-9;
  }

  /** How many bots should be playing: a held seat stays empty for its player, and keeps the bots on with nobody connected. */
  #botTarget(): number {
    const people = this.#seated;
    if (!this.#options.bots || !this.#map.nav || (people === 0 && !this.#options.bots.alwaysOn) || this.#phase === 'lobby') return 0;
    const fixed = this.#fixedSeats;
    // A held seat's player joins that seat or none: it doesn't keep a seat from the next match.
    if (fixed !== undefined) return this.#fill ? Math.max(0, fixed - this.playerCount) : 0;
    if (this.#hvbOn) return hvbBots(people, this.maxBotsPerTeam, this.maxPlayers);
    const wanted = this.#botsFor(this.#map, this.#mode.id) * 2 - people;
    return Math.max(0, Math.min(wanted, this.maxPlayers - people));
  }

  /** At match start: bots made or let go to the target, outside the mode (it starts afresh with everyone). */
  #rosterBots(): void {
    const target = this.#botTarget();
    while (this.#bots.size > target) {
      this.#dismissBot([...this.#bots.keys()].at(-1)!);
    }
    while (this.#bots.size < target) {
      const id = this.#newBot();
      this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0] });
    }
  }

  /** Mid-match: bots join or leave so the match stays at the target, a leaving bot taken from the bigger side. */
  #fillBots(): void {
    // A match that seats its own keeps them for its length: only the last person out ends it.
    if (this.#fixedSeats !== undefined && this.#phase !== 'lobby' && this.#seated > 0) return;
    const target = this.#botTarget();
    while (this.#bots.size > target) {
      const sizes = new Map<number, number>();
      for (const p of this.simulation.output().players) if (p.kind === 'player') sizes.set(p.team, (sizes.get(p.team) ?? 0) + 1);
      const team = (id: PlayerId) => this.simulation.playerState(id)?.team ?? 0;
      const ids = [...this.#bots.keys()].reverse();
      this.#dismissBot(ids.reduce((best, id) => ((sizes.get(team(id)) ?? 0) > (sizes.get(team(best)) ?? 0) ? id : best), ids[0]!));
    }
    while (this.#bots.size < target) {
      const id = this.#newBot();
      this.#add(id, this.#names.get(id)!);
    }
  }

  /** A new bot seat with a free name (not yet in the simulation). */
  #newBot(): PlayerId {
    const id = `p${this.#nextId++}`;
    const name = botName(new Set(this.#names.values()), hashString(id));
    this.#renamed();
    this.#names.set(id, name);
    this.#bots.set(id, { name, bot: new Bot(id, this.#profile(name), this.#map.nav!, this.#map.world) });
    this.#log({ event: 'join', id, name, bot: true, script: false });
    return id;
  }

  /** A bot leaves its seat. */
  #dismissBot(id: PlayerId): void {
    this.#log({ event: 'leave', id, name: this.#names.get(id) ?? id, bot: true, script: false });
    this.#bots.delete(id);
    this.#standIns.delete(id);
    this.#remove(id);
  }

  /** A bot takes over a seat whose player has gone, under their name, from where they stood. */
  #standIn(id: PlayerId, name: string): void {
    this.#standIns.add(id);
    if (this.#map.nav) this.#bots.set(id, { name, bot: new Bot(id, this.#profile(name), this.#map.nav, this.#map.world) });
  }

  /** The stand-ins go with the match they played in; their players can only come back to a later one fresh. */
  #endStandIns(): void {
    for (const id of [...this.#standIns]) {
      this.#bots.delete(id);
      this.#standIns.delete(id);
      this.#remove(id);
    }
  }

  /** Someone took or left a seat: the names, the scoreboard and the lobby in the match status all follow. */
  #renamed(): void {
    this.#stale.add('names').add('scores').add('match');
  }

  #log(event: LobbyEvent): void {
    this.#options.onLog?.(event);
  }

  #drop(client: Client, hold = true): void {
    if (!this.#clients.delete(client) || client.id === null) return;
    this.#log({ event: 'leave', id: client.id, name: client.name, bot: false, script: client.script });
    if (hold) this.#hold(client);
    // Leaving the Preparation on purpose isn't final until the dive: back before it, they drop with their Squad.
    else if (this.#beforeDive()) this.#hold(client, true);
    // A match that seats its own has no fewer for it.
    if (this.#phase === 'playing' && this.#mode.fixedSeats !== undefined && this.simulation.has(client.id)) this.#standIn(client.id, client.name);
    else this.#remove(client.id);
    this.#seatsChanged();
  }

  /**
   * Holds a dropped player's seat for the grace period, with their state and
   * score as they left; one who `left` on purpose in the Preparation, only
   * until its dive begins.
   */
  #hold(client: Client, left = false): void {
    const id = client.id as PlayerId;
    // The dive can wait on a page still loading, so a hold for one who left ends with the dive itself (`#releaseAway`), not at a time.
    const grace = left ? Infinity : (this.#options.reconnectGrace ?? RECONNECT_GRACE);
    const state = this.simulation.playerState(id);
    const score = this.#mode.scores().find((s) => s.id === id);
    if (grace <= 0 || !state || !score) return;
    this.#away.set(client.token, { id, name: client.name, token: client.token, state, score, match: this.#matchNumber, until: this.simulation.time + grace, ...(left ? { left } : {}) });
  }

  /** A Battle Royale's Preparation is on and its dive hasn't begun. */
  #beforeDive(): boolean {
    if (this.#prepStart === null || !this.#countingDown) return false;
    const dive = Math.min(PREPARATION.dive, this.#options.countdown ?? PREPARATION.seconds);
    return this.simulation.time < this.#matchStart - dive - 1e-9;
  }

  /** Lets go of held seats whose grace period ran out, and of those left on purpose once the dive begins. */
  #releaseAway(): void {
    const held = this.#away.size;
    const diving = !this.#beforeDive();
    for (const [token, away] of this.#away) if (this.simulation.time >= away.until - 1e-9 || (away.left && diving)) this.#away.delete(token);
    if (this.#away.size < held) this.#seatsChanged();
  }

  /** A seat emptied: bots fill or leave to match. The last seat out takes the bots along, and the next lobby starts from the default. */
  #seatsChanged(): void {
    if (this.#seated === 0 && !this.#options.bots?.alwaysOn) {
      this.#fill = this.#defaultFill();
      this.#customBots = null;
      this.#hvb = this.#options.hvb === true;
      this.#endStandIns();
    }
    this.#fillBots();
  }

  /** What a mode may do to seats' weapons, through the simulation. */
  readonly #act: ModeActions = {
    give: (id, weapon) => this.simulation.giveWeapon(id, weapon),
    primary: (id) => this.simulation.primary(id),
  };

  #context(): ModeContext {
    const sim = this.simulation.output();
    return {
      tick: sim.tick,
      time: this.simulation.time,
      matchTime: this.simulation.time - this.#matchStart,
      players: sim.players.filter((p) => p.kind === 'player'),
      spawns: this.#map.spawns,
      teamSpawns: this.#map.teamSpawns ?? null,
      world: this.simulation.world,
      zones: this.#map.zones ?? [],
      sites: this.#map.sites ?? [],
      using: this.#using,
      act: this.#act,
      ...(this.#mode.fixedSeats === undefined ? {} : this.#seatContext()),
    };
  }

  /** What a mode that seats its own also sees: where it can put people, and which seats are theirs. */
  #seatContext(): Pick<ModeContext, 'ground' | 'people'> {
    const people = new Set<PlayerId>();
    for (const c of this.#clients) if (c.id !== null && !c.script) people.add(c.id);
    for (const away of this.#away.values()) people.add(away.id);
    return { people, ...(this.#map.nav ? { ground: playGround(this.#map.nav, this.#map.world) } : {}) };
  }

  /** Runs one server tick: queued usercmds, the simulation, the game mode and match flow, then snapshots. */
  tick(): TickOutput {
    const probe = this.#options.probe;
    if (probe) {
      probe.start();
      this.#facts.thoughts = this.#facts.plans = this.#facts.arcs = 0;
    }
    this.#releaseAway();
    this.#prepare();
    const frozen = this.#phase !== 'playing';
    const cmds: Record<PlayerId, UserCmd | UserCmd[]> = {};
    for (const client of [...this.#clients]) {
      if (client.id === null) {
        if (this.simulation.time - client.heard > JOIN_TIMEOUT) client.connection.close('join timeout');
        continue;
      }
      if (this.simulation.time - client.heard > (this.#options.idleTimeout ?? IDLE_TIMEOUT)) {
        client.connection.close('idle');
        continue;
      }
      const seqs = [...client.queue.keys()].sort((a, b) => a - b);
      // One usercmd per tick, so a client that ran dry once keeps a spare usercmd
      // queued as a jitter buffer; two per tick when well behind, or to run off
      // a spare it hasn't needed for a while.
      client.spare = Math.min(client.spare, seqs.length);
      const idle = ++client.spareTicks >= SPARE_TICKS && client.spare > 1;
      if (client.spareTicks >= SPARE_TICKS) {
        client.spare = Infinity;
        client.spareTicks = 0;
      }
      const take = seqs.slice(0, seqs.length > 3 || idle ? 2 : 1);
      cmds[client.id] = take.map((seq) => {
        const cmd = client.queue.get(seq) as UserCmd;
        client.queue.delete(seq);
        client.ack = seq;
        return cmd;
      });
      // The intermission ignores input: acknowledged, never applied.
      if (frozen) cmds[client.id] = [];
    }
    // A match's opening countdown and a round's freeze hold everyone where they stand, free to look around.
    const held = !frozen && (this.#countingDown || this.#mode.frozen());
    probe?.phase('input');
    if (this.#bots.size > 0) this.#thinkBots(cmds, frozen || held);
    else probe?.phase('plan');
    probe?.phase('think');
    for (const [id, list] of Object.entries(cmds)) {
      const applied = Array.isArray(list) ? list : [list];
      if (held) cmds[id] = applied.map((cmd) => ({ ...cmd, forward: 0, right: 0, buttons: 0, firePresses: [] }));
      const last = applied.at(-1);
      if (last && last.buttons & Button.Use && !held && !frozen) this.#using.add(id);
      else if (last || frozen || held) this.#using.delete(id);
    }
    const out = this.simulation.step(cmds);
    probe?.phase('sim');
    this.#lastEvents = out.events;
    // Firing ends spawn protection.
    for (const e of out.events) {
      if (e.type !== 'shot') continue;
      this.#protectedSince.delete(e.shooter);
      this.#firedAt.set(e.shooter, out.tick);
    }
    for (const e of out.events) if (e.type === 'prop') this.#popped.add(e.prop);
    const modeEvents = this.#phase === 'playing' ? this.#playing(out) : this.#intermission();
    this.#modeEvents = modeEvents;
    this.#noteChanges(out, modeEvents);
    probe?.phase('mode');

    const tick = out.tick;
    this.#last = this.simulation.output();
    const seats = (this.#seatIndex = new SeatIndex(this.#last.players));
    const relevant = this.#net.relevance !== null;
    const logged = [...out.events, ...modeEvents].map(
      (event, index): LoggedEvent => ({ tick, type: event.type, bytes: packEvent({ tick, index, event }), reach: relevant ? eventReach(event, (id) => seats.get(id)?.position) : null }),
    );
    // Cosmetic events go out once; the ones that matter are repeated for a while in case a snapshot is lost.
    const kept = this.#recentEvents.filter((e) => e.tick > tick - EVENT_RESEND_TICKS && IMPORTANT.has(e.type));
    this.#recentEvents = [...kept, ...logged];
    this.#eventLog.push(...logged);
    while (this.#eventLog.length > 0 && (this.#eventLog[0] as LoggedEvent).tick <= tick - EVENT_LOG_TICKS) this.#eventLog.shift();
    probe?.phase('events');
    this.#broadcast();
    if (probe) {
      probe.phase('send');
      probe.end(this.#factsOf(out, modeEvents));
    }
    return this.#last;
  }

  /** The tick just run, for the probe. */
  #factsOf(out: TickOutput, modeEvents: readonly ModeEvent[]): TickFacts {
    const facts = this.#facts;
    facts.shots = facts.deaths = facts.downs = facts.blasts = 0;
    for (const e of out.events) {
      if (e.type === 'shot') facts.shots += 1;
      else if (e.type === 'kill') facts.deaths += 1;
      else if (e.type === 'down') facts.downs += 1;
      else if (e.type === 'explosion') facts.blasts += 1;
    }
    facts.grenades = out.grenades.length;
    facts.modeEvents = modeEvents.length > 0 ? modeEvents.map((e) => e.type) : NO_EVENTS;
    return facts;
  }

  /** What this tick means for the sticky fields: nothing but a kill or a mode's event moves the scoreboard, and a tick of plain play leaves the match status alone. */
  #noteChanges(out: TickOutput, modeEvents: readonly ModeEvent[]): void {
    let eventful = modeEvents.length > 0;
    for (const e of out.events) {
      if (e.type === 'kill' || e.type === 'revive') eventful = true;
      else if (e.type === 'prop') this.#stale.add('popped');
    }
    // An objective pays out as it's held, with no event to say so. A Battle Royale's moves only with an event.
    const shown = this.#mode.objective();
    const objective = shown !== null && shown.kind !== 'battle-royale';
    if (eventful || objective) this.#stale.add('scores');
    const settled = !eventful && !objective && this.#phase === 'playing' && !this.#countingDown;
    if (!settled || !this.#settled) this.#stale.add('match');
    this.#settled = settled;
  }

  /**
   * The bot teams' planners: in Outposts each team's bots are sent to zones
   * (see {@link planOutposts}), in Charge to the sites, the charge and the
   * carrier (see {@link planCharge}); replanned every second, and at once
   * when the charge changes hands or a round starts.
   */
  #planBots(): void {
    const time = this.simulation.time;
    const changed = this.#modeEvents.some((e) => e.type === 'charge' || e.type === 'roundStart' || e.type === 'roundEnd');
    if (time < this.#planAt && !changed) return;
    this.#planAt = time + PLAN_EVERY;
    this.#orders = new Map();
    const objective = this.#mode.objective();
    const players = this.#last.players.filter((p) => p.kind === 'player' && p.alive);
    const bots = players.filter((p) => this.#bots.has(p.id));
    if (objective?.kind === 'outposts') {
      const zones = this.#map.zones ?? [];
      if (zones.length === 0) return;
      for (const team of new Set(bots.map((p) => p.team))) {
        const plan = planOutposts(team, bots.filter((p) => p.team === team), zones, objective.zones);
        for (const [id, zone] of plan) this.#orders.set(id, { position: zone.center, radius: zone.radius });
      }
    } else if (objective?.kind === 'charge') {
      const sites = this.#map.sites ?? [];
      if (sites.length === 0) return;
      for (const team of new Set(bots.map((p) => p.team))) {
        const plan = planCharge(team, bots.filter((p) => p.team === team), players.filter((p) => p.team === team), sites, objective);
        for (const [id, order] of plan) this.#orders.set(id, order);
      }
    } else if (objective?.kind === 'battle-royale') {
      this.#planSquads(objective, players);
    }
  }

  /** Battle Royale: the ground each bot chooses, from its own position, temper and health and what its Squad knows. */
  #planSquads(state: BattleRoyaleState, seats: readonly PlayerOutput[]): void {
    const { nav, world } = this.#map;
    if (!nav) return;
    const time = this.simulation.time;
    this.#squads ??= new SquadPlanner((x, z) => nav.nodes[nearestNode(nav, world, [x, world.terrain?.heightAt(x, z) ?? 0, z])]!.position, hashString(`${this.#matchStart}`));
    this.#grounds = this.#squads.plan({
      time,
      state,
      seats: seats.map((p) => {
        const bot = this.#bots.get(p.id)?.bot;
        return { id: p.id, team: p.team, position: p.position, bot: bot !== undefined, downed: p.downed, health: p.health, ...(bot ? { bold: bot.profile.aggression } : {}), ...(p.loadout.primary === 'sniper' ? { sniper: true } : {}) };
      }),
      ...(this.#countingDown ? { fresh: FIRST_RALLIES } : {}),
    });
  }

  /** How a named bot plays. */
  #profile(name: string): BotProfile {
    const base = this.#mode.id === BATTLE_ROYALE ? royaleProfile(botProfile(name)) : botProfile(name);
    return this.#options.bots?.profile?.(name, base) ?? base;
  }

  /** Each bot's usercmd for this tick, from what the last tick showed. */
  #thinkBots(cmds: Record<PlayerId, UserCmd | UserCmd[]>, frozen: boolean): void {
    const players = this.#last.players;
    const seats = this.#seatIndex;
    const time = this.simulation.time;
    const tick = this.simulation.tick;
    const probe = this.#options.probe;
    // The island hears last tick's gunfire and deaths, and each Squad what befell its own.
    this.#squads?.hear(this.#lastEvents, (id) => seats.get(id), time);
    this.#planBots();
    probe?.phase('plan');
    const arcs = this.#scale.throwArcs;
    const budget: ThinkBudget = { arcs, plans: 0 };
    const { plansPerTick } = this.#scale;
    const far = this.#scale.farBots;
    // Ticks of a match that seats its own so far: its bots wake a few at a time, as all of them planning their first route on one tick took 30 ms.
    const awake = this.#mode.fixedSeats === undefined ? Infinity : Math.round((time - this.#matchStart) / TICK_SECONDS);
    let waking = 0;
    const people = far ? this.#joined().flatMap((c) => seats.get(c.id as PlayerId) ?? []) : [];
    for (const [id, seat] of this.#bots) {
      const self = seats.get(id);
      if (!self || frozen || awake < waking++ % WAKE_TICKS) {
        cmds[id] = [];
        continue;
      }
      const info = { id, team: self.team, kind: self.kind };
      const ground = this.#grounds.get(id);
      const view: BotView = {
        tick,
        time,
        self,
        players,
        seats,
        ...(far && !people.some((p) => Math.hypot(p.position[0] - self.position[0], p.position[2] - self.position[2]) <= far.range) ? { thinkEvery: far.thinkEvery } : {}),
        events: this.#lastEvents,
        grenades: this.#last.grenades,
        isEnemy: (other) => other.kind === 'player' && this.#mode.canDamage(info, other),
        objective: this.#orders.get(id) ?? null,
        lives: this.#mode.canRespawn(id) ? 'respawn' : 'round',
        budget,
        ...(budget.plans >= plansPerTick ? { rest: true } : {}),
        ...(ground ? { ground } : {}),
      };
      cmds[id] = seat.bot.think(view);
      if (probe) {
        probe.thought(id, seat.bot.activity);
        this.#facts.thoughts += 1;
      }
    }
    this.#facts.plans = budget.plans;
    this.#facts.arcs = arcs - budget.arcs;
  }

  /** A tick of play: scoring, the end of the match, respawns. */
  #playing(out: TickOutput): ModeEvent[] {
    const ctx = this.#context();
    const events = this.#mode.onEvents(out.events, ctx);
    // A new round puts everyone back at their side's spawns, alive and with the loadout they picked.
    if (events.some((e) => e.type === 'roundStart')) for (const seat of this.#seats()) this.#spawn(seat.id, this.#mode.chooseSpawn(seat.id, this.#context()));
    // A new level (gun game) re-arms a living player where they stand with its weapon.
    for (const e of events) {
      if (e.type !== 'level' || !this.simulation.playerState(e.player)?.health) continue;
      const loadout = this.#loadoutOf(e.player).loadout;
      if (loadout) this.simulation.equip(e.player, loadout);
    }
    const result = this.#mode.result(ctx);
    if (result) {
      this.#phase = 'nuke';
      this.#endedAt = ctx.time;
      this.#result = result;
      events.push({ type: 'matchEnd', ...result });
      this.#log({ event: 'matchEnd', map: this.#map.id, mode: this.#mode.id, hvb: this.#hvbOn, duration: ctx.matchTime, result });
      return events;
    }
    // Respawns: after the mode's delay, at the spot it picks.
    for (const p of ctx.players) {
      const diedAt = p.alive ? null : this.simulation.diedAt(p.id);
      if (diedAt !== null && ctx.time - diedAt >= this.#mode.respawnDelay - 1e-9 && this.#mode.canRespawn(p.id)) {
        this.#spawn(p.id, this.#mode.chooseSpawn(p.id, this.#context()));
      }
    }
    return events;
  }

  /** A tick of the intermission: the nuke, then the vote (or the scoreboard), then the next match (or the lobby, until the host starts one). */
  #intermission(): ModeEvent[] {
    if (this.#phase === 'lobby') return this.#startRequested ? [this.#startMatch(this.#lobbyMode)] : [];
    const since = this.simulation.time - (this.#endedAt ?? 0);
    const { nuke, vote } = this.#intermissionLengths();
    if (since >= nuke + vote - 1e-9) {
      if (!this.#options.lobby) return [this.#startMatch(this.#nextMode())];
      this.#openLobby();
      return [];
    }
    if (since >= nuke - 1e-9) this.#phase = 'vote';
    return [];
  }

  /**
   * Sends each client its snapshot. What's the same for everyone is packed
   * once a tick and the bytes joined per client; on a reliable connection, a
   * sticky field goes only when it differs from what that client last got, and
   * events are exactly those since its last snapshot, so a skipped one loses
   * nothing.
   */
  #broadcast(): void {
    const tick = this.#last.tick;
    if (tick % PING_TICKS === 0) {
      const pings: Record<string, number> = {};
      // A client that has not measured its round trip yet is left out (shown as unknown).
      for (const c of this.#clients) if (c.id !== null && c.ping > 0) pings[c.id] = c.ping;
      this.#pings = pings;
      this.#stale.add('pings');
    }
    const due: Client[] = [];
    // Below a snapshot a tick, a share each tick: 60 clients sent together cost one tick in three 5 ms more. The rest go on the next, and stay there.
    const share = Math.ceil(this.#clients.size / this.#net.snapshotEvery);
    for (const client of this.#clients) {
      if (client.id === null) continue;
      if (tick % PACE_TICKS === 0) this.#setPace(client, tick);
      if (due.length < share && tick - client.sentTick >= Math.max(client.pace, this.#net.snapshotEvery) && !client.connection.congested) due.push(client);
    }
    this.#facts.snapshots = due.length;
    this.#facts.bytes = 0;
    if (due.length === 0) return;
    this.#packSticky();
    /** Each seat packed the first time a client needs it this tick: one nobody is near costs nothing. */
    const packed = new Map<PlayerId, Uint8Array>();
    const packedSeat = (id: PlayerId): Uint8Array => {
      let bytes = packed.get(id);
      if (!bytes) packed.set(id, (bytes = packPlayer(this.#seatIndex.get(id) as PlayerOutput)));
      return bytes;
    };
    const grenades = packGrenades(this.#last.grenades);
    for (const client of due) {
      const reliable = client.connection.reliable === true;
      const self = this.simulation.playerStateView(client.id as PlayerId);
      const viewer = this.#net.relevance ? this.#viewerOf(client) : undefined;
      const view = this.#viewOf(client, viewer, tick);
      const frame = joinSnapshot({
        tick,
        ack: client.ack,
        self: self ? packValue(self) : null,
        players: view.sent.map(packedSeat),
        held: view.held,
        events: this.#eventsFor(client, viewer, reliable).map((e) => e.bytes),
        grenades,
        sticky: STICKY_FIELDS.map((field) => {
          const bytes = this.#sticky[field] as Uint8Array;
          if (reliable && client.sticky[field] === bytes) return null;
          client.sticky[field] = bytes;
          return bytes;
        }),
      });
      client.sentTick = tick;
      client.connection.send(frame);
      this.#facts.bytes += frame.length;
    }
  }

  /**
   * Where a client's view is measured from: its own seat while it is in the fight;
   * out of it, the seat it watches (a teammate in a team mode, anyone in a Battle
   * Royale or free-for-all), so a spectator is sent what is around the one it
   * watches, not around where it fell. Undefined (everything) with neither.
   */
  #viewerOf(client: Client): PlayerOutput | undefined {
    const own = this.#seatIndex.get(client.id as PlayerId);
    if (own?.alive || client.watch === null || client.watch === client.id) return own;
    const watched = this.#seatIndex.get(client.watch);
    if (!watched?.alive) return own;
    if (own && watched.team !== own.team) {
      if (teamMode(this.#mode.id)) return own;
      // A Battle Royale: while their Squad still fights, only the Squad (ticket 58).
      if (this.#mode.id === BATTLE_ROYALE && this.#last.players.some((p) => p.alive && p.team === own.team)) return own;
    }
    return watched;
  }

  /** This match's network profile. */
  get #net(): NetProfile {
    return this.#options.net ?? NET_PROFILES[this.#mode.id];
  }

  /** The seats going to a client in this snapshot, and those it keeps from an earlier one. With no `viewer` to measure from, it sees everything. */
  #viewOf(client: Client, viewer: PlayerOutput | undefined, tick: number): { sent: PlayerId[]; held: PlayerId[] } {
    const sent: PlayerId[] = [];
    const held: PlayerId[] = [];
    const relevance = this.#net.relevance;
    for (const seat of this.#last.players) {
      if (seat.id === client.id) continue;
      if (!relevance || !viewer) {
        sent.push(seat.id);
        continue;
      }
      const last = client.seats.get(seat.id);
      const tier = seatTier(viewer.position, seat.position, relevance, last !== undefined, this.#keptInView(viewer, seat, tick, relevance));
      if (tier === 'out') {
        client.seats.delete(seat.id);
      } else if (tier === 'near' || last === undefined || tick - last >= relevance.midEvery) {
        client.seats.set(seat.id, tick);
        sent.push(seat.id);
      } else {
        held.push(seat.id);
      }
    }
    return { sent, held };
  }

  /** A teammate is on the map wherever they are, and a seat firing within earshot has to be somewhere to fire from. */
  #keptInView(viewer: PlayerOutput, seat: PlayerOutput, tick: number, relevance: Relevance): boolean {
    if (seat.kind === 'player' && !this.#mode.canDamage(viewer, seat)) return true;
    const fired = this.#firedAt.get(seat.id);
    return fired !== undefined && tick - fired <= relevance.heardTicks && within(viewer.position, seat.position, relevance.hearing);
  }

  /** Brings the sticky fields that may have changed up to date, keeping the same array while the bytes stay the same. */
  #packSticky(): void {
    for (const field of this.#stale) {
      const bytes = packValue(this.#stickyValue(field));
      const was = this.#sticky[field];
      if (!was || was.length !== bytes.length || was.some((byte, i) => byte !== bytes[i])) this.#sticky[field] = bytes;
    }
    this.#stale.clear();
  }

  #stickyValue(field: StickyField): WireSnapshot[StickyField] {
    switch (field) {
      case 'scores':
        return this.#mode.scores().map((s) => (this.#bots.has(s.id) ? { ...s, bot: true } : s));
      case 'names':
        return Object.fromEntries(this.#names);
      case 'pings':
        return this.#pings;
      case 'popped':
        return [...this.#popped];
      case 'match':
        return this.matchStatus();
    }
  }

  /** The events a client is due: everything since its last snapshot on a reliable link, the ones still repeated otherwise; only what reaches it. */
  #eventsFor(client: Client, viewer: PlayerOutput | undefined, reliable: boolean): readonly LoggedEvent[] {
    const log = reliable ? this.#eventLog : this.#recentEvents;
    let from = reliable ? log.length : 0;
    while (reliable && from > 0 && (log[from - 1] as LoggedEvent).tick > client.sentTick) from -= 1;
    const events = log.slice(from);
    const relevance = this.#net.relevance;
    if (!relevance || !viewer) return events;
    return events.filter((e) => !e.reach || reaches(e.reach, viewer.id, viewer.position, relevance));
  }

  /** How far behind the client says it is. Its smallest lately is the link's own delay; anything above that is queueing. */
  #heardSeen(client: Client, seen: number): void {
    const tick = this.#last.tick;
    client.behind = Math.max(0, tick - seen);
    client.floor = Math.min(client.floor, client.behind);
    if (tick - client.floorSince >= FLOOR_TICKS) {
      client.floorBefore = client.floor;
      client.floor = client.behind;
      client.floorSince = tick;
    }
  }

  /**
   * Fits a client's snapshots to its link. Buffers along the way (the kernel's,
   * Funnel's, the router's) hide a queue from this end, and a game that plays
   * seconds in the past is lost, so the measure is how old the client's newest
   * snapshot is: send fewer the moment that grows, more once it has stayed low.
   */
  #setPace(client: Client, tick: number): void {
    const fastest = this.#net.snapshotEvery;
    client.pace = Math.max(client.pace, fastest);
    const floor = Math.min(client.floor, client.floorBefore);
    if (floor === Infinity) return;
    const queued = client.behind - floor - client.pace;
    if ((queued > QUEUE_FULL || client.connection.congested) && client.pace < Math.max(SLOWEST_PACE, fastest)) {
      client.pace += 1;
      client.clear = 0;
      if (tick - client.spedUp < FAILED_TICKS) client.patience = Math.min(client.patience * 2, MOST_PATIENCE);
    } else if (queued <= QUEUE_CLEAR) {
      client.clear += 1;
      if (client.clear >= client.patience && client.pace > fastest) {
        client.pace -= 1;
        client.clear = 0;
        client.spedUp = tick;
      }
    } else {
      client.clear = 0;
    }
  }

  #send(client: Client, message: Exclude<ServerMessage, WireSnapshot>): void {
    client.connection.send(encode(message));
  }

  /** Closes every connection. */
  close(): void {
    for (const client of [...this.#clients]) client.connection.close('server closing');
  }
}

/** Compares passphrases without stopping at the first differing character. */
function samePassphrase(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}

/** A fresh, unguessable seat token (32 hex digits). */
function seatToken(): string {
  const bytes = new Uint8Array(16);
  // Web Crypto is global in Node and every browser, secure context or not; fps-core's lib settings just don't declare it.
  (globalThis as unknown as { crypto: { getRandomValues(array: Uint8Array): Uint8Array } }).crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Trims a display name to printable characters and a maximum length. */
function cleanName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}
