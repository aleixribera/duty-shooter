import {
  GameClient,
  Simulation,
  TICK_SECONDS,
  createWorld,
  type Solid,
  type MatchStatus,
  type ModeEvent,
  type ModeId,
  type PlayerId,
  type PlayerOutput,
  type PlayerSpawn,
  type Score,
  type SimEvent,
  type SpawnPoint,
  type UserCmd,
  type Vec3,
} from '@duty-shooter/fps-core';
import { connectWebSocket } from './net/websocket';

export type PresentedEvent = SimEvent | ModeEvent;

/** What one tick of play produced for the presentation layer. */
export interface DriverTick {
  readonly self: PlayerOutput | null;
  /** Everything to present this tick: your predicted shots and impacts, everyone's hits, kills, the kill feed. */
  readonly events: readonly PresentedEvent[];
}

/**
 * The game as the client sees it, offline or online: steps the local player
 * once per tick and reports the other players and dummies to draw.
 */
export interface GameDriver {
  readonly online: boolean;
  readonly selfId: PlayerId | null;
  /** The facing of a spawn or respawn since the last call, once: the next usercmd should look that way. */
  takeSpawn(): { yaw: number; pitch: number } | null;
  tick(cmd: UserCmd): DriverTick;
  /** Other players and dummies to draw, `alpha` of a tick past the latest one. */
  others(alpha: number): readonly PlayerOutput[];
  /** Prediction-correction offset still being smoothed out. */
  readonly correction: Vec3;
  /** Round-trip time in seconds, or null offline. */
  readonly ping: number | null;
  readonly scores: readonly Score[];
  /** Each player's round trip (ms), for the scoreboard; empty offline. */
  readonly pings: Readonly<Record<string, number>>;
  /** Props the server says were shot this match, or null offline (the page's own events are the truth there). */
  readonly popped: readonly string[] | null;
  /** Mode, phase, clock, team scores and vote; null offline. */
  readonly match: MatchStatus | null;
  /** The server's simulation time (s) now, to count down to `match.phaseEnds`. */
  readonly serverTime: number;
  /** Votes for the next match's mode (online only). */
  vote(mode: ModeId): void;
  nameOf(id: PlayerId): string;
  /** 'playing', 'connecting', or why the connection ended. */
  readonly status: string;
  dispose(): void;
}

export interface OfflineOptions {
  readonly solids: readonly Solid[];
  readonly spawn: SpawnPoint;
  readonly dummies?: readonly PlayerSpawn[];
  /** Seconds after death before the local player respawns. */
  readonly respawnDelay?: number;
}

/** Solo play: the whole simulation runs in the page. */
export class OfflineDriver implements GameDriver {
  readonly online = false;
  readonly selfId = 'you';
  readonly correction: Vec3 = [0, 0, 0];
  readonly ping = null;
  readonly scores: readonly Score[] = [];
  readonly pings = {};
  readonly popped = null;
  readonly match = null;
  readonly status = 'playing';
  readonly #sim: Simulation;
  readonly #spawn: SpawnPoint;
  readonly #respawnDelay: number;
  #deadFor = 0;
  #prev: readonly PlayerOutput[] = [];
  #cur: readonly PlayerOutput[] = [];
  #spawnFacing: { yaw: number; pitch: number } | null;

  constructor(options: OfflineOptions) {
    this.#sim = new Simulation(createWorld(options.solids));
    this.#spawn = options.spawn;
    this.#respawnDelay = options.respawnDelay ?? 1.5;
    this.#sim.addPlayer({ id: this.selfId, team: 1, position: options.spawn.position, yaw: options.spawn.yaw });
    for (const d of options.dummies ?? []) this.#sim.addPlayer(d);
    this.#cur = this.#sim.output().players.filter((p) => p.id !== this.selfId);
    this.#prev = this.#cur;
    this.#spawnFacing = { yaw: options.spawn.yaw, pitch: 0 };
  }

  get serverTime(): number {
    return this.#sim.time;
  }

  vote(): void {}

  takeSpawn(): { yaw: number; pitch: number } | null {
    const facing = this.#spawnFacing;
    this.#spawnFacing = null;
    return facing;
  }

  tick(cmd: UserCmd): DriverTick {
    const out = this.#sim.step({ [this.selfId]: cmd });
    let self = out.players.find((p) => p.id === this.selfId) ?? null;
    if (self && !self.alive) {
      this.#deadFor += TICK_SECONDS;
      if (this.#deadFor >= this.#respawnDelay) {
        this.#deadFor = 0;
        this.#sim.respawn(this.selfId, this.#spawn.position, this.#spawn.yaw);
        this.#spawnFacing = { yaw: this.#spawn.yaw, pitch: 0 };
        self = this.#sim.output().players.find((p) => p.id === this.selfId) ?? null;
      }
    }
    this.#prev = this.#cur;
    this.#cur = out.players.filter((p) => p.id !== this.selfId);
    return { self, events: out.events };
  }

  others(alpha: number): readonly PlayerOutput[] {
    return this.#cur.map((c) => {
      const p = this.#prev.find((x) => x.id === c.id);
      if (!p || Math.hypot(c.position[0] - p.position[0], c.position[2] - p.position[2]) > 2) return c;
      const l = (a: number, b: number) => a + (b - a) * alpha;
      return { ...c, position: [l(p.position[0], c.position[0]), l(p.position[1], c.position[1]), l(p.position[2], c.position[2])] };
    });
  }

  nameOf(id: PlayerId): string {
    return id === this.selfId ? 'You' : id.startsWith('dummy') ? 'Dummy' : id;
  }

  dispose(): void {}
}

export interface OnlineOptions {
  readonly url: string;
  readonly solids: readonly Solid[];
  /** The mode to ask for, honoured only on an empty server. */
  readonly mode?: ModeId;
  readonly name: string;
  readonly passphrase: string;
}

/** Networked play against the authoritative server, with prediction and interpolation. */
export class OnlineDriver implements GameDriver {
  readonly online = true;
  readonly #client: GameClient;

  constructor(options: OnlineOptions) {
    this.#client = new GameClient({
      connection: connectWebSocket(options.url),
      world: createWorld(options.solids),
      name: options.name,
      passphrase: options.passphrase,
      ...(options.mode ? { mode: options.mode } : {}),
    });
  }

  get client(): GameClient {
    return this.#client;
  }

  get selfId(): PlayerId | null {
    return this.#client.id;
  }

  get correction(): Vec3 {
    return this.#client.correction;
  }

  get ping(): number | null {
    return this.#client.status === 'joined' ? this.#client.ping : null;
  }

  get scores(): readonly Score[] {
    return this.#client.scores;
  }

  get pings(): Readonly<Record<string, number>> {
    return this.#client.pings;
  }

  get popped(): readonly string[] {
    return this.#client.popped;
  }

  get match(): MatchStatus | null {
    return this.#client.match;
  }

  get serverTime(): number {
    return this.#client.serverTime;
  }

  vote(mode: ModeId): void {
    this.#client.vote(mode);
  }

  get status(): string {
    const c = this.#client;
    if (c.status === 'joined') return 'playing';
    if (c.status === 'rejected') {
      if (c.rejectReason === 'passphrase') return 'Wrong passphrase.';
      if (c.rejectReason === 'full') return 'The server is full.';
      if (c.rejectReason === 'protocol') return 'The game was updated. Reload the page.';
      return 'Pick another name.';
    }
    if (c.status === 'closed') return `Disconnected: ${c.closeReason ?? 'connection lost'}.`;
    return 'connecting';
  }

  takeSpawn(): { yaw: number; pitch: number } | null {
    return this.#client.takeSpawn();
  }

  tick(cmd: UserCmd): DriverTick {
    const frame = this.#client.tick(cmd);
    return { self: frame.self, events: [...frame.predicted, ...frame.server] };
  }

  others(alpha: number): readonly PlayerOutput[] {
    return this.#client.others(alpha);
  }

  nameOf(id: PlayerId): string {
    if (id === this.#client.id) return 'You';
    return this.#client.names[id] ?? (id.startsWith('dummy') ? 'Dummy' : id);
  }

  dispose(): void {
    this.#client.close();
  }
}
