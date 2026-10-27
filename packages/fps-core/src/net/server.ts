import { Bot, type BotObjective, type BotView } from '../bots/bot';
import { planOutposts } from '../bots/planner';
import type { NavGraph } from '../bots/nav';
import { botName, botProfile } from '../bots/profile';
import { FreeForAll, type FreeForAllOptions } from '../modes/ffa';
import { MODE_IDS, type GameMode, type MatchResult, type ModeContext, type ModeEvent, type ModeId, type Score, type SpawnPoint, type Zone } from '../modes/game-mode';
import { Outposts, type OutpostsOptions } from '../modes/outposts';
import { TeamDeathmatch, type TeamDeathmatchOptions } from '../modes/tdm';
import { hashString } from '../random';
import { Simulation, TICK_RATE, type PlayerId, type PlayerOutput, type PlayerSpawn, type PlayerState, type SimEvent, type TickOutput } from '../simulation';
import type { UserCmd } from '../usercmd';
import type { Loadout } from '../weapon/loadout';
import type { World } from '../world';
import {
  EVENT_RESEND_TICKS,
  INTERMISSION,
  PROTOCOL_VERSION,
  compactGrenade,
  compactOutput,
  decodeClient,
  encode,
  type MatchStatus,
  type Phase,
  type RejectReason,
  type ServerMessage,
  type StampedEvent,
} from './protocol';
import type { Connection, ServerTransport } from './transport';

export interface GameServerOptions {
  readonly world: World;
  /** The map's id, reported to clients and the lobby status. */
  readonly map?: string;
  /** The mode the server starts in. Defaults to team deathmatch. */
  readonly mode?: ModeId;
  /** Limits for each mode; by default TDM is 75 kills, FFA 30, Outposts 200 points, all 600 s. */
  readonly modes?: { readonly tdm?: TeamDeathmatchOptions; readonly ffa?: FreeForAllOptions; readonly outposts?: OutpostsOptions };
  /** Intermission phase lengths (s). Defaults: 6 s of nuke, then 14 s of scoreboard and vote. */
  readonly intermission?: { readonly nuke?: number; readonly vote?: number };
  /** Free-for-all spawn points, spread over the map. */
  readonly spawns: readonly SpawnPoint[];
  /** One spawn set per team (team 1, then team 2); without them team modes use the free-for-all points. */
  readonly teamSpawns?: readonly (readonly SpawnPoint[])[];
  /** The map's Outposts zones; none without. */
  readonly zones?: readonly Zone[];
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
  /** Seconds a dropped player's seat is held for them to come back to; RECONNECT_GRACE by default, 0 lets it go at once. */
  readonly reconnectGrace?: number;
  /** Hears every join, leave, match start and match end, for the lobby's event log. */
  readonly onLog?: (event: LobbyEvent) => void;
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
  /** The map's nav graph, for the bots to find their way. */
  readonly nav: NavGraph;
  /** Bots a side by default (0 = none). */
  readonly perTeam: number;
  /** The most a side the first joiner may ask for; MAX_BOTS_PER_TEAM by default. */
  readonly maxPerTeam?: number;
  /** Keep bots playing with nobody connected (tests and benchmarks). */
  readonly alwaysOn?: boolean;
}

/** Seconds between the bot teams' plans. */
const PLAN_EVERY = 1;

/** The most bots a side a lobby offers. */
export const MAX_BOTS_PER_TEAM = 4;
/** Seconds a fresh spawn can't be hurt, unless it fires first. */
export const SPAWN_PROTECTION = 1.5;

export const DEFAULT_MAX_PLAYERS = 8;
/**
 * Seconds a joined client may stay silent before its slot is let go. A playing
 * client sends every frame, pause menu included; only a stopped frame loop (a
 * background tab, a minimised window) goes quiet. Its player would otherwise
 * stand frozen in the match and keep the lobby from ever emptying.
 */
export const IDLE_TIMEOUT = 60;
/**
 * Seconds a dropped player's seat is held. The match keeps running meanwhile,
 * bots and all, even with everyone gone; a player back in time picks up where
 * they left off, in the same spot with the same health, ammo and score.
 */
export const RECONNECT_GRACE = 300;
const DEFAULT_MAX_MESSAGE = 8 * 1024;
const DEFAULT_RATE = 180;
/** Usercmds queued beyond this are dropped (oldest first), bounding the input delay. */
const MAX_QUEUED_CMDS = 12;
const MAX_NAME = 16;
/** Events repeated in later snapshots; the rest (shots, impacts, reloads) are cosmetic and sent once. */
const IMPORTANT = new Set(['hit', 'kill', 'killFeed', 'matchEnd', 'matchStart', 'explosion']);

interface Client {
  readonly connection: Connection;
  id: PlayerId | null;
  name: string;
  /** Highest sequence number processed. */
  ack: number;
  readonly queue: Map<number, UserCmd>;
  /** The round trip (ms) the client last reported. */
  ping: number;
  /** Messages counted in the current one-second window. */
  messages: number;
  windowStart: number;
  /** Simulation time of the client's last message. */
  heard: number;
  /** The seat's secret, sent in the welcome; joining again with it takes the seat back after a drop. */
  token: string;
  /** Joined by the smoke or load-test script. */
  script: boolean;
  /** What the player carries from their next spawn; null for the default. */
  loadout: Loadout | null;
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
  #phase: Phase = 'playing';
  /** Simulation time the current match started, and the time it ended (null while it is on). */
  #matchStart = 0;
  #endedAt: number | null = null;
  #result: MatchResult | null = null;
  readonly #votes = new Map<PlayerId, ModeId>();
  #modeEvents: readonly ModeEvent[] = [];
  readonly #clients = new Set<Client>();
  readonly #names = new Map<PlayerId, string>();
  #nextId = 1;
  #recentEvents: StampedEvent[] = [];
  #last: TickOutput;
  /** Props shot this match; cleared when a match starts. */
  readonly #popped = new Set<string>();
  readonly #bots = new Map<PlayerId, BotSeat>();
  #botsPerTeam: number;
  /** The latest tick's simulation events, for the bots to hear. */
  #lastEvents: readonly SimEvent[] = [];
  /** When each player last spawned, while their spawn protection lasts. */
  readonly #protectedSince = new Map<PlayerId, number>();
  /** Held seats by token. */
  readonly #away = new Map<string, AwaySeat>();
  /** Counts matches started, so a held seat knows whether its match is still on. */
  #matchNumber = 0;
  /** Each bot's objective from its team's planner, and when the plan is next made. */
  #orders = new Map<PlayerId, BotObjective>();
  #planAt = 0;

  constructor(transport: ServerTransport, options: GameServerOptions) {
    this.#options = options;
    this.#modes = { tdm: new TeamDeathmatch(options.modes?.tdm), ffa: new FreeForAll(options.modes?.ffa), outposts: new Outposts(options.modes?.outposts) };
    this.#mode = this.#modes[options.mode ?? 'tdm'];
    this.simulation = new Simulation(options.world, {
      canDamage: (a, v) => this.#phase === 'playing' && (v.kind === 'dummy' || (this.#mode.canDamage(a, v) && !this.#spawnProtected(v.id))),
      selfDamage: () => this.#phase === 'playing',
    });
    for (const dummy of options.dummies ?? []) this.simulation.addPlayer(dummy);
    this.#botsPerTeam = this.#defaultBots();
    this.#last = this.simulation.output();
    transport.onConnection((connection) => this.#accept(connection));
    if (options.bots?.alwaysOn) this.#startMatch(this.#mode.id);
  }

  #defaultBots(): number {
    const b = this.#options.bots;
    return b ? Math.max(0, Math.min(b.perTeam, this.maxBotsPerTeam)) : 0;
  }

  /** The most bots a side a first joiner may ask for (0 without bots). */
  get maxBotsPerTeam(): number {
    const b = this.#options.bots;
    return b ? (b.maxPerTeam ?? MAX_BOTS_PER_TEAM) : 0;
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
      map: this.#options.map ?? 'range',
      mode: this.#mode.id,
      players: this.playerCount,
      away: this.#away.size,
      capacity: this.maxPlayers,
      phase: this.#phase,
      bots: this.#bots.size,
      botsPerTeam: this.#botsPerTeam,
      maxBotsPerTeam: this.maxBotsPerTeam,
    };
  }

  /** The match status sent in every snapshot. */
  matchStatus(): MatchStatus {
    const { nuke, vote } = this.#intermissionLengths();
    const ended = this.#endedAt ?? 0;
    const votes = Object.fromEntries(MODE_IDS.map((m) => [m, 0])) as Record<ModeId, number>;
    for (const m of this.#votes.values()) votes[m] += 1;
    const limit = this.#mode.timeLimit;
    return {
      mode: this.#mode.id,
      phase: this.#phase,
      phaseEnds: this.#phase === 'playing' ? (limit === null ? null : this.#matchStart + limit) : this.#phase === 'nuke' ? ended + nuke : ended + nuke + vote,
      killLimit: this.#mode.killLimit,
      scoreLimit: this.#mode.scoreLimit,
      timeLimit: limit,
      respawnDelay: this.#mode.respawnDelay,
      teamScores: this.#mode.teamScores(),
      votes,
      next: this.#nextMode(),
      result: this.#result,
      objective: this.#mode.objective(),
    };
  }

  get maxPlayers(): number {
    return this.#options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
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
    const client: Client = { connection, id: null, name: '', ack: 0, queue: new Map(), ping: 0, messages: 0, windowStart: this.simulation.time, heard: this.simulation.time, token: '', script: false, loadout: null };
    this.#clients.add(client);
    connection.onMessage((data) => this.#receive(client, data));
    connection.onClose(() => this.#drop(client));
  }

  #reject(client: Client, reason: RejectReason): void {
    this.#send(client, { t: 'reject', reason });
    client.connection.close(`rejected: ${reason}`);
    this.#clients.delete(client);
  }

  #receive(client: Client, data: string): void {
    const now = this.simulation.time;
    client.heard = now;
    if (now - client.windowStart >= 1) {
      client.windowStart = now;
      client.messages = 0;
    }
    client.messages += 1;
    if (client.messages > (this.#options.maxMessagesPerSecond ?? DEFAULT_RATE)) {
      client.connection.close('rate limit');
      return;
    }
    if (data.length > (this.#options.maxMessageSize ?? DEFAULT_MAX_MESSAGE)) {
      client.connection.close('message too large');
      return;
    }
    const message = decodeClient(data);
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
      this.#join(client, message.name, message.passphrase, message.protocol, message.mode ?? null, message.bots ?? null, message.resume ?? null);
      return;
    }
    if (message.t === 'join') {
      // The welcome was lost: say it again.
      this.#welcome(client);
      return;
    }
    if (message.t === 'loadout') {
      client.loadout = message.loadout;
      return;
    }
    if (message.t === 'vote') {
      if (this.#phase === 'vote') this.#votes.set(client.id, message.mode);
      return;
    }
    if (message.t === 'cmds') {
      if (message.ping !== undefined) client.ping = message.ping;
      for (const { seq, cmd } of message.cmds) {
        if (seq > client.ack && !client.queue.has(seq)) client.queue.set(seq, cmd);
      }
      if (client.queue.size > MAX_QUEUED_CMDS) {
        const keep = [...client.queue.keys()].sort((a, b) => a - b).slice(-MAX_QUEUED_CMDS);
        for (const seq of [...client.queue.keys()]) if (!keep.includes(seq)) client.queue.delete(seq);
      }
    }
  }

  #join(client: Client, rawName: string, passphrase: string, protocol: number, preferred: ModeId | null, bots: number | null, resume: string | null): void {
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
    this.#names.set(id, name);
    this.#log({ event: 'join', id, name, bot: false, script: client.script });
    if (first && !this.#options.bots?.alwaysOn) {
      // The first player on an empty server starts a fresh match, in the mode and with the bots they asked for.
      if (bots !== null) this.#botsPerTeam = Math.min(bots, this.maxBotsPerTeam);
      this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0], ...this.#loadoutOf(id) });
      this.#startMatch(preferred ?? this.#mode.id);
    } else {
      // A bot gives up its seat first (the newcomer already counts), so the newcomer joins the side it left.
      this.#fillBots();
      this.#add(id, name);
    }
    this.#welcome(client);
  }

  #welcome(client: Client): void {
    if (client.id === null) return;
    this.#send(client, { t: 'welcome', id: client.id, tick: this.simulation.tick, mode: this.#mode.id, map: this.#options.map ?? 'range', maxPlayers: this.maxPlayers, token: client.token });
  }

  /** A player back in their held seat: in the match they left, exactly where and as they were; in a later one, joining it fresh. */
  #resume(client: Client, away: AwaySeat): void {
    this.#away.delete(away.token);
    client.id = away.id;
    client.name = away.name;
    client.token = away.token;
    this.#names.set(away.id, away.name);
    this.#log({ event: 'join', id: away.id, name: away.name, bot: false, script: client.script });
    if (away.match === this.#matchNumber) {
      this.#mode.rejoin(away.score);
      this.simulation.setPlayerState(away.state);
      // A moment's protection while the returning page finds its feet.
      this.#protectedSince.set(away.id, this.simulation.time);
    } else this.#add(away.id, away.name);
    this.#welcome(client);
  }

  #intermissionLengths(): { nuke: number; vote: number } {
    return { nuke: this.#options.intermission?.nuke ?? INTERMISSION.nuke, vote: this.#options.intermission?.vote ?? INTERMISSION.vote };
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
    this.#matchStart = this.simulation.time;
    this.#endedAt = null;
    this.#result = null;
    this.#votes.clear();
    this.#popped.clear();
    this.#planAt = 0;
    this.#protectedSince.clear();
    // This match's bots first: new ones join the simulation here and get their team below.
    this.#rosterBots();
    const seats = this.#seats();
    const entrants = seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      // Teams carry over only between matches of the same mode.
      team: previous.id === this.#mode.id ? (this.simulation.playerState(seat.id)?.team ?? null) : null,
    }));
    const teams = this.#mode.start(entrants);
    for (const [id, team] of teams) this.simulation.setTeam(id, team);
    for (const seat of seats) this.#spawn(seat.id, this.#mode.chooseSpawn(seat.id, this.#context()));
    this.#log({ event: 'matchStart', map: this.#mapId, mode: this.#mode.id, hvb: false });
    return { type: 'matchStart', mode: this.#mode.id };
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

  /** A player into the running match: the mode picks the team and spawn. */
  #add(id: PlayerId, name: string): void {
    const ctx = this.#context();
    const team = this.#mode.join(id, name, ctx);
    const spawn = this.#mode.chooseSpawn(id, ctx);
    this.simulation.addPlayer({ id, team, position: spawn.position, yaw: spawn.yaw, ...this.#loadoutOf(id) });
    this.#protectedSince.set(id, this.simulation.time);
  }

  /** The loadout a player's next spawn carries (a bot's from its profile), as spawn options (empty for the default). */
  #loadoutOf(id: PlayerId): { loadout?: Loadout } {
    const loadout = [...this.#clients].find((c) => c.id === id)?.loadout ?? this.#bots.get(id)?.bot.profile.loadout ?? null;
    return loadout ? { loadout } : {};
  }

  #remove(id: PlayerId): void {
    this.simulation.removePlayer(id);
    this.#mode.leave(id);
    this.#names.delete(id);
    this.#votes.delete(id);
    this.#protectedSince.delete(id);
  }

  /** (Re)spawns a player, protected for a moment. */
  #spawn(id: PlayerId, spawn: SpawnPoint): void {
    this.simulation.respawn(id, spawn.position, spawn.yaw, this.#loadoutOf(id).loadout);
    this.#protectedSince.set(id, this.simulation.time);
  }

  #spawnProtected(id: PlayerId): boolean {
    const since = this.#protectedSince.get(id);
    return since !== undefined && this.simulation.time - since < (this.#options.spawnProtection ?? SPAWN_PROTECTION) - 1e-9;
  }

  /** How many bots should be playing: a held seat stays empty for its player, and keeps the bots on with nobody connected. */
  #botTarget(): number {
    const people = this.#seated;
    if (!this.#options.bots || (people === 0 && !this.#options.bots.alwaysOn)) return 0;
    const wanted = this.#botsPerTeam * 2 - people;
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
    this.#names.set(id, name);
    this.#bots.set(id, { name, bot: new Bot(id, botProfile(name), this.#options.bots!.nav, this.simulation.world) });
    this.#log({ event: 'join', id, name, bot: true, script: false });
    return id;
  }

  /** A bot leaves its seat. */
  #dismissBot(id: PlayerId): void {
    this.#log({ event: 'leave', id, name: this.#names.get(id) ?? id, bot: true, script: false });
    this.#bots.delete(id);
    this.#remove(id);
  }

  #log(event: LobbyEvent): void {
    this.#options.onLog?.(event);
  }

  get #mapId(): string {
    return this.#options.map ?? 'range';
  }

  #drop(client: Client): void {
    if (!this.#clients.delete(client) || client.id === null) return;
    this.#log({ event: 'leave', id: client.id, name: client.name, bot: false, script: client.script });
    this.#hold(client);
    this.#remove(client.id);
    this.#seatsChanged();
  }

  /** Holds a dropped player's seat for the grace period, with their state and score as they left. */
  #hold(client: Client): void {
    const id = client.id as PlayerId;
    const grace = this.#options.reconnectGrace ?? RECONNECT_GRACE;
    const state = this.simulation.playerState(id);
    const score = this.#mode.scores().find((s) => s.id === id);
    if (grace <= 0 || !state || !score) return;
    this.#away.set(client.token, { id, name: client.name, token: client.token, state, score, match: this.#matchNumber, until: this.simulation.time + grace });
  }

  /** Lets go of held seats whose grace period ran out. */
  #releaseAway(): void {
    const held = this.#away.size;
    for (const [token, away] of this.#away) if (this.simulation.time >= away.until - 1e-9) this.#away.delete(token);
    if (this.#away.size < held) this.#seatsChanged();
  }

  /** A seat emptied: bots fill or leave to match. The last seat out takes the bots along, and the next lobby starts from the default. */
  #seatsChanged(): void {
    if (this.#seated === 0 && !this.#options.bots?.alwaysOn) this.#botsPerTeam = this.#defaultBots();
    this.#fillBots();
  }

  #context(): ModeContext {
    const sim = this.simulation.output();
    return {
      tick: sim.tick,
      time: this.simulation.time,
      matchTime: this.simulation.time - this.#matchStart,
      players: sim.players.filter((p) => p.kind === 'player'),
      spawns: this.#options.spawns,
      teamSpawns: this.#options.teamSpawns ?? null,
      world: this.simulation.world,
      zones: this.#options.zones ?? [],
    };
  }

  /** Runs one server tick: queued usercmds, the simulation, the game mode and match flow, then snapshots. */
  tick(): TickOutput {
    this.#releaseAway();
    const frozen = this.#phase !== 'playing';
    const cmds: Record<PlayerId, UserCmd | UserCmd[]> = {};
    for (const client of [...this.#clients]) {
      if (client.id === null) continue;
      if (this.simulation.time - client.heard > (this.#options.idleTimeout ?? IDLE_TIMEOUT)) {
        client.connection.close('idle');
        continue;
      }
      const seqs = [...client.queue.keys()].sort((a, b) => a - b);
      // One usercmd per tick, so a client that ran dry once keeps a spare usercmd
      // queued as a jitter buffer; two per tick only when well behind.
      const take = seqs.slice(0, seqs.length > 3 ? 2 : 1);
      cmds[client.id] = take.map((seq) => {
        const cmd = client.queue.get(seq) as UserCmd;
        client.queue.delete(seq);
        client.ack = seq;
        return cmd;
      });
      // The intermission ignores input: acknowledged, never applied.
      if (frozen) cmds[client.id] = [];
    }
    if (this.#bots.size > 0) this.#thinkBots(cmds, frozen);
    const out = this.simulation.step(cmds);
    this.#lastEvents = out.events;
    // Firing ends spawn protection.
    for (const e of out.events) if (e.type === 'shot') this.#protectedSince.delete(e.shooter);
    for (const e of out.events) if (e.type === 'prop') this.#popped.add(e.prop);
    const modeEvents = this.#phase === 'playing' ? this.#playing(out) : this.#intermission();
    this.#modeEvents = modeEvents;

    const tick = out.tick;
    const stamped = [...out.events, ...modeEvents].map((event, index) => ({ tick, index, event }));
    // Cosmetic events go out once; the ones that matter are repeated for a while in case a snapshot is lost.
    const kept = this.#recentEvents.filter((e) => e.tick > tick - EVENT_RESEND_TICKS && IMPORTANT.has(e.event.type));
    this.#recentEvents = [...kept, ...stamped];
    this.#last = this.simulation.output();
    this.#broadcast();
    return this.#last;
  }

  /**
   * The bot teams' planners: in Outposts each team's bots are sent to zones
   * (see {@link planOutposts}), replanned every second.
   */
  #planBots(): void {
    const time = this.simulation.time;
    if (time < this.#planAt) return;
    this.#planAt = time + PLAN_EVERY;
    this.#orders = new Map();
    const objective = this.#mode.objective();
    const zones = this.#options.zones ?? [];
    if (objective?.kind !== 'outposts' || zones.length === 0) return;
    const players = this.#last.players.filter((p) => this.#bots.has(p.id) && p.alive);
    for (const team of new Set(players.map((p) => p.team))) {
      const plan = planOutposts(team, players.filter((p) => p.team === team), zones, objective.zones);
      for (const [id, zone] of plan) this.#orders.set(id, { position: zone.center, radius: zone.radius });
    }
  }

  /** Each bot's usercmd for this tick, from what the last tick showed. */
  #thinkBots(cmds: Record<PlayerId, UserCmd | UserCmd[]>, frozen: boolean): void {
    const players = this.#last.players;
    const time = this.simulation.time;
    const tick = this.simulation.tick;
    this.#planBots();
    for (const [id, seat] of this.#bots) {
      const self = players.find((p) => p.id === id);
      if (!self || frozen) {
        cmds[id] = [];
        continue;
      }
      const info = { id, team: self.team, kind: self.kind };
      const view: BotView = {
        tick,
        time,
        self,
        players,
        events: this.#lastEvents,
        grenades: this.#last.grenades,
        isEnemy: (other) => other.kind === 'player' && this.#mode.canDamage(info, other),
        objective: this.#orders.get(id) ?? null,
      };
      cmds[id] = seat.bot.think(view);
    }
  }

  /** A tick of play: scoring, the end of the match, respawns. */
  #playing(out: TickOutput): ModeEvent[] {
    const ctx = this.#context();
    const events = this.#mode.onEvents(out.events, ctx);
    const result = this.#mode.result(ctx);
    if (result) {
      this.#phase = 'nuke';
      this.#endedAt = ctx.time;
      this.#result = result;
      events.push({ type: 'matchEnd', ...result });
      this.#log({ event: 'matchEnd', map: this.#mapId, mode: this.#mode.id, hvb: false, duration: ctx.matchTime, result });
      return events;
    }
    // Respawns: after the mode's delay, at the spot it picks.
    for (const p of ctx.players) {
      const diedAt = p.alive ? null : (this.simulation.playerState(p.id)?.diedAt ?? null);
      if (diedAt !== null && ctx.time - diedAt >= this.#mode.respawnDelay - 1e-9 && this.#mode.canRespawn(p.id)) {
        this.#spawn(p.id, this.#mode.chooseSpawn(p.id, this.#context()));
      }
    }
    return events;
  }

  /** A tick of the intermission: the nuke, then the vote, then the next match. */
  #intermission(): ModeEvent[] {
    const since = this.simulation.time - (this.#endedAt ?? 0);
    const { nuke, vote } = this.#intermissionLengths();
    if (since >= nuke + vote - 1e-9) return [this.#startMatch(this.#nextMode())];
    if (since >= nuke - 1e-9) this.#phase = 'vote';
    return [];
  }

  #broadcast(): void {
    const all = this.#last.players;
    const scores = this.#mode.scores().map((s) => (this.#bots.has(s.id) ? { ...s, bot: true } : s));
    const match = this.matchStatus();
    const names = Object.fromEntries(this.#names);
    const popped = [...this.#popped];
    const grenades = this.#last.grenades.map(compactGrenade);
    const pings: Record<string, number> = {};
    // A client that has not measured its round trip yet is left out (shown as unknown).
    for (const c of this.#clients) if (c.id !== null && c.ping > 0) pings[c.id] = c.ping;
    for (const client of this.#clients) {
      if (client.id === null) continue;
      const others: PlayerOutput[] = all.filter((p) => p.id !== client.id).map(compactOutput);
      this.#send(client, {
        t: 'snap',
        tick: this.#last.tick,
        ack: client.ack,
        self: this.simulation.playerState(client.id),
        players: others,
        events: this.#recentEvents,
        scores,
        names,
        pings,
        popped,
        match,
        grenades,
      });
    }
  }

  #send(client: Client, message: ServerMessage): void {
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

export const SERVER_TICK_RATE = TICK_RATE;
