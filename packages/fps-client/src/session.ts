import {
  GameClient,
  GameServer,
  MAX_BOTS_PER_TEAM,
  RESPAWN_DELAY,
  Simulation,
  TICK_SECONDS,
  buildNavGraph,
  createMemoryNetwork,
  createWorld,
  type Connection,
  type GrenadeOutput,
  type Loadout,
  type MemoryNetwork,
  type NavOptions,
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
  type Zone,
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
  /** Live grenades to draw, as of the latest tick. */
  grenades(): readonly GrenadeOutput[];
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
  /** Seconds until you respawn while dead, or null while alive. */
  readonly respawnIn: number | null;
  /** Votes for the next match's mode (online only). */
  vote(mode: ModeId): void;
  /** What to carry from the next spawn (offline: at once while alive). */
  setLoadout(loadout: Loadout): void;
  nameOf(id: PlayerId): string;
  /** 'playing', 'connecting', or why the connection ended. */
  readonly status: string;
  /** True when the whole match runs in the page, so it stops while the game is paused (a bot match). */
  readonly pausesWithGame?: boolean;
  dispose(): void;
}

export interface OfflineOptions {
  readonly solids: readonly Solid[];
  readonly spawn: SpawnPoint;
  readonly dummies?: readonly PlayerSpawn[];
  /** Seconds after death before the local player respawns (default {@link RESPAWN_DELAY}). */
  readonly respawnDelay?: number;
  /** What the player carries; the default loadout when absent. */
  readonly loadout?: Loadout;
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
  #dead = false;
  #prev: readonly PlayerOutput[] = [];
  #cur: readonly PlayerOutput[] = [];
  #grenades: readonly GrenadeOutput[] = [];
  #spawnFacing: { yaw: number; pitch: number } | null;
  /** A loadout chosen while dead, for the respawn. */
  #nextLoadout: Loadout | undefined;

  constructor(options: OfflineOptions) {
    this.#sim = new Simulation(createWorld(options.solids));
    this.#spawn = options.spawn;
    this.#respawnDelay = options.respawnDelay ?? RESPAWN_DELAY;
    this.#sim.addPlayer({ id: this.selfId, team: 1, position: options.spawn.position, yaw: options.spawn.yaw, ...(options.loadout ? { loadout: options.loadout } : {}) });
    for (const d of options.dummies ?? []) this.#sim.addPlayer(d);
    this.#cur = this.#sim.output().players.filter((p) => p.id !== this.selfId);
    this.#prev = this.#cur;
    this.#spawnFacing = { yaw: options.spawn.yaw, pitch: 0 };
  }

  get serverTime(): number {
    return this.#sim.time;
  }

  get respawnIn(): number | null {
    return this.#dead ? Math.max(0, this.#respawnDelay - this.#deadFor) : null;
  }

  vote(): void {}

  /** Solo play has no one to be fair to: a living player re-arms where they stand. */
  setLoadout(loadout: Loadout): void {
    if (this.#sim.output().players.find((p) => p.id === this.selfId)?.alive) this.#sim.equip(this.selfId, loadout);
    else this.#nextLoadout = loadout;
  }

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
        this.#sim.respawn(this.selfId, this.#spawn.position, this.#spawn.yaw, this.#nextLoadout);
        this.#nextLoadout = undefined;
        this.#spawnFacing = { yaw: this.#spawn.yaw, pitch: 0 };
        self = this.#sim.output().players.find((p) => p.id === this.selfId) ?? null;
      }
    }
    this.#dead = !!self && !self.alive;
    this.#prev = this.#cur;
    this.#cur = out.players.filter((p) => p.id !== this.selfId);
    this.#grenades = out.grenades;
    return { self, events: out.events };
  }

  grenades(): readonly GrenadeOutput[] {
    return this.#grenades;
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
  /** The game server: its WebSocket URL, or a connection already open to it. */
  readonly server: string | Connection;
  readonly solids: readonly Solid[];
  /** The mode to ask for, honoured only on an empty server. */
  readonly mode?: ModeId;
  /** Bots a side to ask for, honoured only on an empty server. */
  readonly bots?: number;
  readonly name: string;
  readonly passphrase: string;
  /** What to carry; the default loadout when absent. */
  readonly loadout?: Loadout;
  /** Where the page keeps its seat token (localStorage), so a dropped or reloaded game takes its seat back; none without. */
  readonly seatKey?: string;
}

/** Networked play against the authoritative server, with prediction and interpolation. */
export class OnlineDriver implements GameDriver {
  readonly online = true;
  readonly #client: GameClient;
  readonly #seatKey: string | null;
  #savedToken: string | null;

  constructor(options: OnlineOptions) {
    this.#seatKey = options.seatKey ?? null;
    this.#savedToken = this.#seatKey === null ? null : readStorage(this.#seatKey);
    this.#client = new GameClient({
      connection: typeof options.server === 'string' ? connectWebSocket(options.server) : options.server,
      world: createWorld(options.solids),
      name: options.name,
      passphrase: options.passphrase,
      ...(options.mode ? { mode: options.mode } : {}),
      ...(options.bots === undefined ? {} : { bots: options.bots }),
      ...(this.#savedToken ? { resume: this.#savedToken } : {}),
      ...(options.loadout ? { loadout: options.loadout } : {}),
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

  get respawnIn(): number | null {
    const self = this.#client.snapshot?.self;
    const match = this.#client.match;
    if (!self || self.diedAt === null || !match) return null;
    return Math.max(0, self.diedAt + match.respawnDelay - this.serverTime);
  }

  vote(mode: ModeId): void {
    this.#client.vote(mode);
  }

  setLoadout(loadout: Loadout): void {
    this.#client.setLoadout(loadout);
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
    const token = this.#client.token;
    if (this.#seatKey !== null && token !== null && token !== this.#savedToken) {
      this.#savedToken = token;
      writeStorage(this.#seatKey, token);
    }
    return { self: frame.self, events: [...frame.predicted, ...frame.server] };
  }

  others(alpha: number): readonly PlayerOutput[] {
    return this.#client.others(alpha);
  }

  grenades(): readonly GrenadeOutput[] {
    return this.#client.grenades;
  }

  nameOf(id: PlayerId): string {
    if (id === this.#client.id) return 'You';
    return this.#client.names[id] ?? (id.startsWith('dummy') ? 'Dummy' : id);
  }

  dispose(): void {
    this.#client.close();
  }
}

/** localStorage can be missing or throw (private windows, blocked site data); the seat is then just not remembered. */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered: a rejoin starts afresh.
  }
}

export interface BotMatchOptions {
  readonly solids: readonly Solid[];
  readonly spawns: { readonly ffa: readonly SpawnPoint[]; readonly teams: readonly (readonly SpawnPoint[])[] | null };
  /** The map's Outposts zones. */
  readonly zones?: readonly Zone[];
  /** How the map's nav graph is built, for the bots to find their way. */
  readonly nav: NavOptions;
  readonly mode: ModeId;
  /** Bots a side (free-for-all: twice this many in all, counting you). */
  readonly botsPerTeam: number;
  readonly name: string;
  readonly loadout?: Loadout;
}

/**
 * A match against bots with no server to reach: a game server runs in the
 * page, over a zero-latency in-memory link, so modes, scores, the clock and
 * the intermission all work as online. It stops while the game is paused.
 */
export class BotMatchDriver extends OnlineDriver {
  readonly pausesWithGame = true;
  readonly #network: MemoryNetwork;
  readonly #server: GameServer;

  constructor(options: BotMatchOptions) {
    const network = createMemoryNetwork();
    const world = createWorld(options.solids);
    const perTeam = Math.max(0, Math.min(MAX_BOTS_PER_TEAM, options.botsPerTeam));
    const server = new GameServer(network.server, {
      world,
      mode: options.mode,
      spawns: options.spawns.ffa,
      ...(options.spawns.teams ? { teamSpawns: options.spawns.teams } : {}),
      ...(options.zones ? { zones: options.zones } : {}),
      passphrase: '',
      bots: { nav: buildNavGraph(world, options.nav), perTeam, maxPerTeam: MAX_BOTS_PER_TEAM },
    });
    super({ server: network.connect(), solids: options.solids, mode: options.mode, bots: perTeam, name: options.name, passphrase: '', ...(options.loadout ? { loadout: options.loadout } : {}) });
    this.#network = network;
    this.#server = server;
  }

  override get ping(): number | null {
    return null;
  }

  override get pings(): Readonly<Record<string, number>> {
    return {};
  }

  override tick(cmd: UserCmd): DriverTick {
    this.#network.advance(TICK_SECONDS);
    this.#server.tick();
    return super.tick(cmd);
  }
}
