import { FreeForAll, type FreeForAllOptions } from '../modes/ffa';
import { MODE_IDS, type GameMode, type MatchResult, type ModeContext, type ModeEvent, type ModeId, type SpawnPoint } from '../modes/game-mode';
import { TeamDeathmatch, type TeamDeathmatchOptions } from '../modes/tdm';
import { Simulation, TICK_RATE, type PlayerId, type PlayerOutput, type PlayerSpawn, type TickOutput } from '../simulation';
import type { UserCmd } from '../usercmd';
import type { World } from '../world';
import {
  EVENT_RESEND_TICKS,
  PROTOCOL_VERSION,
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
  /** Limits for each mode; by default TDM is 75 kills, FFA 30, both 600 s. */
  readonly modes?: { readonly tdm?: TeamDeathmatchOptions; readonly ffa?: FreeForAllOptions };
  /** Intermission phase lengths (s). Defaults: 6 s of nuke, then 14 s of scoreboard and vote. */
  readonly intermission?: { readonly nuke?: number; readonly vote?: number };
  /** Free-for-all spawn points, spread over the map. */
  readonly spawns: readonly SpawnPoint[];
  /** One spawn set per team (team 1, then team 2); without them team modes use the free-for-all points. */
  readonly teamSpawns?: readonly (readonly SpawnPoint[])[];
  /** Range dummies, simulated by the server for everyone. */
  readonly dummies?: readonly PlayerSpawn[];
  /** The shared passphrase every join must carry; empty runs a public lobby anyone can join. */
  readonly passphrase: string;
  readonly maxPlayers?: number;
  /** Largest accepted message, in characters. */
  readonly maxMessageSize?: number;
  /** Messages a connection may send per second before it is dropped. */
  readonly maxMessagesPerSecond?: number;
}

export const DEFAULT_MAX_PLAYERS = 8;
const DEFAULT_MAX_MESSAGE = 8 * 1024;
const DEFAULT_RATE = 180;
/** Usercmds queued beyond this are dropped (oldest first), bounding the input delay. */
const MAX_QUEUED_CMDS = 12;
const MAX_NAME = 16;
const NUKE_SECONDS = 6;
const VOTE_SECONDS = 14;
/** Events repeated in later snapshots; the rest (shots, impacts, reloads) are cosmetic and sent once. */
const IMPORTANT = new Set(['hit', 'kill', 'killFeed', 'matchEnd', 'matchStart']);

interface Client {
  readonly connection: Connection;
  id: PlayerId | null;
  name: string;
  /** Highest sequence number processed. */
  ack: number;
  readonly queue: Map<number, UserCmd>;
  /** Messages counted in the current one-second window. */
  messages: number;
  windowStart: number;
}

/** What the lobby status endpoint reports. */
export interface LobbyStatus {
  readonly map: string;
  readonly mode: ModeId;
  readonly players: number;
  readonly capacity: number;
  readonly phase: Phase;
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

  constructor(transport: ServerTransport, options: GameServerOptions) {
    this.#options = options;
    this.#modes = { tdm: new TeamDeathmatch(options.modes?.tdm), ffa: new FreeForAll(options.modes?.ffa) };
    this.#mode = this.#modes[options.mode ?? 'tdm'];
    this.simulation = new Simulation(options.world, {
      canDamage: (a, v) => this.#phase === 'playing' && (v.kind === 'dummy' || this.#mode.canDamage(a, v)),
    });
    for (const dummy of options.dummies ?? []) this.simulation.addPlayer(dummy);
    this.#last = this.simulation.output();
    transport.onConnection((connection) => this.#accept(connection));
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
    return { map: this.#options.map ?? 'range', mode: this.#mode.id, players: this.playerCount, capacity: this.maxPlayers, phase: this.#phase };
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
      timeLimit: limit,
      teamScores: this.#mode.teamScores(),
      votes,
      next: this.#nextMode(),
      result: this.#result,
    };
  }

  get maxPlayers(): number {
    return this.#options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  }

  /** Players currently joined. */
  get playerCount(): number {
    return [...this.#clients].filter((c) => c.id !== null).length;
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
    const client: Client = { connection, id: null, name: '', ack: 0, queue: new Map(), messages: 0, windowStart: this.simulation.time };
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
      this.#join(client, message.name, message.passphrase, message.protocol, message.mode ?? null);
      return;
    }
    if (message.t === 'join') {
      // The welcome was lost: say it again.
      this.#welcome(client);
      return;
    }
    if (message.t === 'vote') {
      if (this.#phase === 'vote') this.#votes.set(client.id, message.mode);
      return;
    }
    if (message.t === 'cmds') {
      for (const { seq, cmd } of message.cmds) {
        if (seq > client.ack && !client.queue.has(seq)) client.queue.set(seq, cmd);
      }
      if (client.queue.size > MAX_QUEUED_CMDS) {
        const keep = [...client.queue.keys()].sort((a, b) => a - b).slice(-MAX_QUEUED_CMDS);
        for (const seq of [...client.queue.keys()]) if (!keep.includes(seq)) client.queue.delete(seq);
      }
    }
  }

  #join(client: Client, rawName: string, passphrase: string, protocol: number, preferred: ModeId | null): void {
    if (protocol !== PROTOCOL_VERSION) return this.#reject(client, 'protocol');
    if (this.#options.passphrase && !samePassphrase(passphrase, this.#options.passphrase)) return this.#reject(client, 'passphrase');
    if (this.playerCount >= this.maxPlayers) return this.#reject(client, 'full');
    const name = cleanName(rawName);
    if (!name) return this.#reject(client, 'name');
    const first = this.playerCount === 0;
    const id = `p${this.#nextId++}`;
    client.id = id;
    client.name = name;
    this.#names.set(id, name);
    if (first) {
      // The first player on an empty server starts a fresh match, in the mode they asked for.
      this.simulation.addPlayer({ id, team: 0, position: [0, 0, 0] });
      this.#startMatch(preferred ?? this.#mode.id);
    } else {
      const ctx = this.#context();
      const team = this.#mode.join(id, name, ctx);
      const spawn = this.#mode.chooseSpawn(id, ctx);
      this.simulation.addPlayer({ id, team, position: spawn.position, yaw: spawn.yaw });
    }
    this.#welcome(client);
  }

  #welcome(client: Client): void {
    if (client.id === null) return;
    this.#send(client, { t: 'welcome', id: client.id, tick: this.simulation.tick, mode: this.#mode.id, map: this.#options.map ?? 'range', maxPlayers: this.maxPlayers });
  }

  #intermissionLengths(): { nuke: number; vote: number } {
    return { nuke: this.#options.intermission?.nuke ?? NUKE_SECONDS, vote: this.#options.intermission?.vote ?? VOTE_SECONDS };
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
    this.#phase = 'playing';
    this.#matchStart = this.simulation.time;
    this.#endedAt = null;
    this.#result = null;
    this.#votes.clear();
    this.#popped.clear();
    const joined = this.#joined();
    const entrants = joined.map((c) => ({
      id: c.id as PlayerId,
      name: c.name,
      // Teams carry over only between matches of the same mode.
      team: previous.id === this.#mode.id ? (this.simulation.playerState(c.id as PlayerId)?.team ?? null) : null,
    }));
    const teams = this.#mode.start(entrants);
    for (const [id, team] of teams) this.simulation.setTeam(id, team);
    for (const c of joined) {
      const spawn = this.#mode.chooseSpawn(c.id as PlayerId, this.#context());
      this.simulation.respawn(c.id as PlayerId, spawn.position, spawn.yaw);
    }
    return { type: 'matchStart', mode: this.#mode.id };
  }

  /** Joined clients in join order. */
  #joined(): Client[] {
    return [...this.#clients].filter((c) => c.id !== null).sort((a, b) => Number((a.id as string).slice(1)) - Number((b.id as string).slice(1)));
  }

  #drop(client: Client): void {
    this.#clients.delete(client);
    if (client.id !== null) {
      this.simulation.removePlayer(client.id);
      this.#mode.leave(client.id);
      this.#names.delete(client.id);
      this.#votes.delete(client.id);
    }
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
    };
  }

  /** Runs one server tick: queued usercmds, the simulation, the game mode and match flow, then snapshots. */
  tick(): TickOutput {
    const frozen = this.#phase !== 'playing';
    const cmds: Record<PlayerId, UserCmd[]> = {};
    for (const client of this.#clients) {
      if (client.id === null) continue;
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
    const out = this.simulation.step(cmds);
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
      return events;
    }
    // Respawns: after the mode's delay, at the spot it picks.
    for (const p of ctx.players) {
      const diedAt = p.alive ? null : (this.simulation.playerState(p.id)?.diedAt ?? null);
      if (diedAt !== null && ctx.time - diedAt >= this.#mode.respawnDelay - 1e-9) {
        const spawn = this.#mode.chooseSpawn(p.id, this.#context());
        this.simulation.respawn(p.id, spawn.position, spawn.yaw);
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
    const scores = this.#mode.scores();
    const match = this.matchStatus();
    const names = Object.fromEntries(this.#names);
    const popped = [...this.#popped];
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
        popped,
        match,
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

/** Trims a display name to printable characters and a maximum length. */
function cleanName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}

export const SERVER_TICK_RATE = TICK_RATE;
