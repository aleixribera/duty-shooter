import type { GameMode, ModeContext, ModeEvent, SpawnPoint } from '../modes/game-mode';
import { Simulation, TICK_RATE, type PlayerId, type PlayerOutput, type PlayerSpawn, type TickOutput } from '../simulation';
import type { UserCmd } from '../usercmd';
import type { World } from '../world';
import {
  EVENT_RESEND_TICKS,
  PROTOCOL_VERSION,
  compactOutput,
  decodeClient,
  encode,
  type RejectReason,
  type ServerMessage,
  type StampedEvent,
} from './protocol';
import type { Connection, ServerTransport } from './transport';

export interface GameServerOptions {
  readonly world: World;
  readonly mode: GameMode;
  readonly spawns: readonly SpawnPoint[];
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

/**
 * The authoritative server: owns the real simulation, accepts joins
 * (passphrase, player cap), runs each client's usercmds in order, applies the
 * game mode and sends every client a snapshot each tick.
 */
export class GameServer {
  readonly simulation: Simulation;
  readonly mode: GameMode;
  readonly #options: GameServerOptions;
  readonly #clients = new Set<Client>();
  readonly #names = new Map<PlayerId, string>();
  #nextId = 1;
  #recentEvents: StampedEvent[] = [];
  #last: TickOutput;

  constructor(transport: ServerTransport, options: GameServerOptions) {
    this.#options = options;
    this.mode = options.mode;
    this.simulation = new Simulation(options.world, { canDamage: (a, v) => v.kind === 'dummy' || this.mode.canDamage(a, v) });
    for (const dummy of options.dummies ?? []) this.simulation.addPlayer(dummy);
    this.#last = this.simulation.output();
    transport.onConnection((connection) => this.#accept(connection));
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

  /** Display names of joined players by id. */
  get names(): ReadonlyMap<PlayerId, string> {
    return this.#names;
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
      this.#join(client, message.name, message.passphrase, message.protocol);
      return;
    }
    if (message.t === 'join') {
      // The welcome was lost: say it again.
      this.#send(client, { t: 'welcome', id: client.id, tick: this.simulation.tick, mode: this.mode.name, maxPlayers: this.maxPlayers });
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

  #join(client: Client, rawName: string, passphrase: string, protocol: number): void {
    if (protocol !== PROTOCOL_VERSION) return this.#reject(client, 'protocol');
    if (this.#options.passphrase && !samePassphrase(passphrase, this.#options.passphrase)) return this.#reject(client, 'passphrase');
    if (this.playerCount >= this.maxPlayers) return this.#reject(client, 'full');
    const name = cleanName(rawName);
    if (!name) return this.#reject(client, 'name');
    const id = `p${this.#nextId++}`;
    client.id = id;
    client.name = name;
    this.#names.set(id, name);
    const ctx = this.#context();
    const team = this.mode.join(id, name, ctx);
    const spawn = this.mode.chooseSpawn(id, ctx);
    this.simulation.addPlayer({ id, team, position: spawn.position, yaw: spawn.yaw });
    this.#send(client, { t: 'welcome', id, tick: this.simulation.tick, mode: this.mode.name, maxPlayers: this.maxPlayers });
  }

  #drop(client: Client): void {
    this.#clients.delete(client);
    if (client.id !== null) {
      this.simulation.removePlayer(client.id);
      this.mode.leave(client.id);
      this.#names.delete(client.id);
    }
  }

  #context(): ModeContext {
    const sim = this.simulation.output();
    return {
      tick: sim.tick,
      time: this.simulation.time,
      players: sim.players.filter((p) => p.kind === 'player'),
      spawns: this.#options.spawns,
    };
  }

  /** Runs one server tick: queued usercmds, the simulation, the game mode, then snapshots. */
  tick(): TickOutput {
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
    }
    const out = this.simulation.step(cmds);
    const ctx = this.#context();
    const modeEvents: ModeEvent[] = this.mode.onEvents(out.events, ctx);
    const round = this.mode.update(ctx);
    modeEvents.push(...round.events);

    // Respawns: after the mode's delay, at the spot it picks (everyone on a restart).
    for (const p of ctx.players) {
      const diedAt = p.alive ? null : (this.simulation.playerState(p.id)?.diedAt ?? null);
      const due = diedAt !== null && ctx.time - diedAt >= this.mode.respawnDelay - 1e-9;
      if (due || round.restart) {
        const spawn = this.mode.chooseSpawn(p.id, this.#context());
        this.simulation.respawn(p.id, spawn.position, spawn.yaw);
      }
    }

    const tick = out.tick;
    const stamped = [...out.events, ...modeEvents].map((event, index) => ({ tick, index, event }));
    // Cosmetic events go out once; the ones that matter are repeated for a while in case a snapshot is lost.
    const kept = this.#recentEvents.filter((e) => e.tick > tick - EVENT_RESEND_TICKS && IMPORTANT.has(e.event.type));
    this.#recentEvents = [...kept, ...stamped];
    this.#last = this.simulation.output();
    this.#broadcast();
    return this.#last;
  }

  #broadcast(): void {
    const all = this.#last.players;
    const scores = this.mode.scores();
    const names = Object.fromEntries(this.#names);
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
