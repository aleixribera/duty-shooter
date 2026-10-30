import { angleDelta, lerpVec, type Vec3 } from '../math';
import type { ModeEvent, ModeId, Score } from '../modes/game-mode';
import { Simulation, TICK_SECONDS, type PlayerId, type PlayerOutput, type SimEvent } from '../simulation';
import type { GrenadeOutput } from '../combat/grenade';
import type { UserCmd } from '../usercmd';
import type { Loadout } from '../weapon/loadout';
import type { World } from '../world';
import { PROTOCOL_VERSION, REDUNDANT_CMDS, decodeServer, encode, type LobbyPick, type MatchStatus, type RejectReason, type SequencedCmd, type Snapshot } from './protocol';
import type { Connection } from './transport';

export interface GameClientOptions {
  readonly connection: Connection;
  /** Opens another connection to the same server: with it a dropped or silent connection comes back to its seat on its own; without, a drop ends the session. */
  readonly reconnect?: () => Connection;
  readonly world: World;
  readonly name: string;
  readonly passphrase: string;
  /** The mode to ask for; the server honours it only when nobody else is playing. */
  readonly mode?: ModeId;
  /** Bots a side to ask for; also honoured only on an empty server. */
  readonly bots?: number;
  /** Humans vs bots, asked for like the mode. */
  readonly hvb?: boolean;
  /** A seat token from an earlier welcome, to take that seat back if the server still holds it. */
  readonly resume?: string;
  /** Marks a scripted player (smoke and load tests) for the server's event log. */
  readonly script?: boolean;
  /** What to carry; the default loadout when absent. */
  readonly loadout?: Loadout;
  /** How far behind the newest snapshot other players are drawn, in ticks. */
  readonly interpolationDelay?: number;
  /** Half-life (s) of the visual smoothing applied to prediction corrections. */
  readonly correctionHalfLife?: number;
}

export type ClientStatus = 'connecting' | 'joined' | 'reconnecting' | 'rejected' | 'closed';

/** What one client tick produced. */
export interface ClientFrame {
  /** The local player as predicted after this tick; null until joined and spawned. */
  readonly self: PlayerOutput | null;
  /** Events predicted locally this tick: your own shots, impacts and reloads, with no network delay. */
  readonly predicted: readonly SimEvent[];
  /** Events from the server that are new since the last tick (everyone's hits, kills, kill feed, other players' shots). */
  readonly server: readonly (SimEvent | ModeEvent)[];
}

/** Corrections bigger than this (m) are a teleport (respawn) and snap instead of smoothing. */
const SNAP_DISTANCE = 2;
const JOIN_RETRY_TICKS = 30;
/** Silence this long (ticks, 3 s) is a dead connection: a half-open socket never reports its own close, and the server sends 60 times a second. */
const SILENT_TICKS = 180;
/** How long one attempt to connect may take (ticks, 5 s) before the next. */
const ATTEMPT_TICKS = 300;
/** How long to keep trying (ticks): 10 s for a first join, so a server that is down is reported; 2 min to come back to a seat. */
const JOIN_WINDOW_TICKS = 600;
const RESUME_WINDOW_TICKS = 7200;
/** Waits between attempts (ticks), the last repeating: the first retry is all but instant, for a socket that just blinked. */
const BACKOFF_TICKS = [6, 30, 60, 120] as const;
/** Close reasons to take at face value: this page left, or another page took the seat. */
const FINAL_CLOSES: ReadonlySet<string> = new Set(['client left', 'replaced']);
/** Unread messages kept (a hidden tab draws no frames, so nothing reads them): the oldest go, and the server's close and the seat token bring it back. */
const MAX_INBOX = 600;

/**
 * A client's view of a networked match. Predicts the local player by running
 * the simulation on its own usercmds, reconciles against each server snapshot
 * by rewinding to the server's state and replaying unacknowledged usercmds,
 * smooths the visible correction, and interpolates other players between
 * snapshots a few ticks in the past.
 */
export class GameClient {
  readonly #options: GameClientOptions;
  #loadout: Loadout | null = null;
  #connection: Connection;
  /** Which connection is current: a replaced one's late messages and close are ignored. */
  #generation = 0;
  /** A connection is out, waiting to be welcomed; otherwise waiting for {@link #retryAt}. */
  #attempting = true;
  #attemptAt = 0;
  #attempts = 0;
  #retryAt = 0;
  #lostAt = 0;
  /** When the server was last heard from. */
  #heard = 0;
  /** The next welcome comes after a drop: what the old connection left behind goes. */
  #rejoining = false;
  readonly #local: Simulation;
  readonly #inbox: string[] = [];
  #status: ClientStatus = 'connecting';
  #rejectReason: RejectReason | null = null;
  #closeReason: string | null = null;
  #id: PlayerId | null = null;
  #token: string | null = null;
  #ticks = 0;
  #lastJoin = -Infinity;
  #seq = 0;
  #pending: SequencedCmd[] = [];
  readonly #sentAt = new Map<number, number>();
  #latest: Snapshot | null = null;
  /** The next snapshot replaces {@link #latest} whatever its tick. */
  #resync = false;
  #reconciled = -1;
  readonly #buffer: Snapshot[] = [];
  readonly #seen = new Set<string>();
  #serverTick = 0;
  #ping = 0;
  #self: PlayerOutput | null = null;
  #correction: Vec3 = [0, 0, 0];
  /** Server events read but not yet returned by a tick. */
  #fresh: (SimEvent | ModeEvent)[] = [];
  /** The local player's life counter in the newest snapshot; a change means a (re)spawn. */
  #life = -1;
  #spawn: { yaw: number; pitch: number } | null = null;

  constructor(options: GameClientOptions) {
    this.#options = options;
    this.#loadout = options.loadout ?? null;
    this.#connection = options.connection;
    this.#local = new Simulation(options.world, { predictOnly: true });
    this.#attach(options.connection);
  }

  #attach(connection: Connection): void {
    this.#connection = connection;
    const generation = ++this.#generation;
    connection.onMessage((data) => {
      if (generation !== this.#generation) return;
      if (this.#inbox.length >= MAX_INBOX) this.#inbox.shift();
      this.#inbox.push(data);
    });
    connection.onClose((reason) => {
      if (generation === this.#generation) this.#closed(reason);
    });
  }

  #closed(reason: string): void {
    this.#closeReason = reason;
    // A rejection's close reason names it, in case the reject message itself was lost.
    const rejected = /^rejected: (\w+)$/.exec(reason);
    if (rejected) {
      this.#status = 'rejected';
      this.#rejectReason = rejected[1] as RejectReason;
    } else if (this.#status === 'rejected') return;
    else if (this.#options.reconnect && !FINAL_CLOSES.has(reason)) this.#lost();
    else this.#status = 'closed';
  }

  /** The connection is gone: the next attempt is scheduled, the seat kept until the window runs out. */
  #lost(): void {
    if (this.#status !== 'reconnecting') {
      this.#status = 'reconnecting';
      this.#lostAt = this.#ticks;
      this.#attempts = 0;
    }
    this.#rejoining = true;
    this.#attempting = false;
    const wait = BACKOFF_TICKS[Math.min(this.#attempts, BACKOFF_TICKS.length - 1)]!;
    this.#attempts += 1;
    // Spread out, so everyone dropped by one server restart doesn't arrive in the same tick.
    this.#retryAt = this.#ticks + Math.round(wait * (0.75 + Math.random() * 0.5));
  }

  /** Lets go of a connection that has stopped answering, without waiting for it to say so. */
  #abandon(reason: string): void {
    const dead = this.#connection;
    this.#generation += 1;
    this.#closeReason = reason;
    dead.close(reason);
    this.#lost();
  }

  /** Each tick: notices a silent connection, opens the next attempt, gives up when the window runs out. */
  #keepConnected(): void {
    if (!this.#options.reconnect) return;
    const status = this.#status;
    if (status === 'joined') {
      if (this.#ticks - this.#heard > SILENT_TICKS) this.#abandon('connection lost');
      return;
    }
    if (status === 'connecting') {
      if (this.#ticks - this.#attemptAt > ATTEMPT_TICKS) this.#abandon('no answer from the server');
      return;
    }
    if (status !== 'reconnecting') return;
    if (this.#ticks - this.#lostAt > (this.#id === null ? JOIN_WINDOW_TICKS : RESUME_WINDOW_TICKS)) {
      this.#generation += 1;
      this.#connection.close('gave up');
      this.#status = 'closed';
    } else if (this.#attempting) {
      if (this.#ticks - this.#attemptAt > ATTEMPT_TICKS) this.#abandon('no answer from the server');
    } else if (this.#ticks >= this.#retryAt) {
      this.#attempting = true;
      this.#attemptAt = this.#ticks;
      this.#lastJoin = -Infinity;
      this.#attach(this.#options.reconnect());
    }
  }

  get status(): ClientStatus {
    return this.#status;
  }

  get rejectReason(): RejectReason | null {
    return this.#rejectReason;
  }

  get closeReason(): string | null {
    return this.#closeReason;
  }

  /** This seat's token once joined: join again with it as `resume` to come back to the seat after a drop. */
  get token(): string | null {
    return this.#token;
  }

  get id(): PlayerId | null {
    return this.#id;
  }

  /** Round-trip time (s), smoothed: from sending a usercmd to the snapshot that acknowledges it. */
  get ping(): number {
    return this.#ping;
  }

  /** The server tick other players are being drawn at (fractional). */
  get renderTick(): number {
    return this.#serverTick - (this.#options.interpolationDelay ?? 4);
  }

  /** Visual offset to add to the predicted position while a correction is being smoothed out. */
  get correction(): Vec3 {
    return this.#correction;
  }

  get self(): PlayerOutput | null {
    return this.#self;
  }

  get scores(): readonly Score[] {
    return this.#latest?.scores ?? [];
  }

  get names(): Readonly<Record<string, string>> {
    return this.#latest?.names ?? {};
  }

  /** Every player's round trip (ms) as last reported to the server. */
  get pings(): Readonly<Record<string, number>> {
    return this.#latest?.pings ?? {};
  }

  /** Mode, phase, clock, team scores and vote, per the newest snapshot. */
  get match(): MatchStatus | null {
    return this.#latest?.match ?? null;
  }

  /** The server's simulation time (s) as this client estimates it now, for counting down to `match.phaseEnds`. */
  get serverTime(): number {
    return this.#serverTick * TICK_SECONDS;
  }

  /** Changes what the player carries from their next spawn (sent with any later join too). */
  setLoadout(loadout: Loadout): void {
    this.#loadout = loadout;
    if (this.#status === 'joined') this.#connection.send(encode({ t: 'loadout', loadout }));
  }

  /** Predicts on another map from now on: the one a new match is played on. */
  setWorld(world: World): void {
    this.#local.setWorld(world);
  }

  /** The host's picks for the next match, in the lobby (ignored from anyone else). */
  setLobby(settings: LobbyPick): void {
    if (this.#status === 'joined') this.#connection.send(encode({ t: 'lobby', ...settings }));
  }

  /** The host starts the next match from the lobby (ignored from anyone else). */
  startMatch(): void {
    if (this.#status === 'joined') this.#connection.send(encode({ t: 'start' }));
  }

  /** Votes for the next match's mode (counted only while the vote is open; a later vote replaces it). */
  vote(mode: ModeId): void {
    if (this.#status === 'joined') this.#connection.send(encode({ t: 'vote', mode }));
  }

  /** Grenades in flight or on the ground, per the newest snapshot. */
  get grenades(): readonly GrenadeOutput[] {
    return this.#latest?.grenades ?? [];
  }

  /** Ids of the props shot this match, per the newest snapshot. */
  get popped(): readonly string[] {
    return this.#latest?.popped ?? [];
  }

  /** The newest authoritative snapshot. */
  get snapshot(): Snapshot | null {
    return this.#latest;
  }

  /**
   * Reads the network and returns the facing of a spawn or respawn the server
   * just reported, once. Call before building the next usercmd, so it can
   * look where the spawn faces instead of where the mouse pointed before.
   */
  takeSpawn(): { yaw: number; pitch: number } | null {
    this.#fresh.push(...this.#readInbox());
    const spawn = this.#spawn;
    this.#spawn = null;
    return spawn;
  }

  /** One client tick: reads the network, reconciles, predicts `cmd` and sends it. */
  tick(cmd: UserCmd): ClientFrame {
    this.#ticks += 1;
    const server = [...this.#fresh.splice(0), ...this.#readInbox()];
    this.#keepConnected();
    if ((this.#status === 'connecting' || (this.#status === 'reconnecting' && this.#attempting)) && this.#ticks - this.#lastJoin >= JOIN_RETRY_TICKS) {
      this.#lastJoin = this.#ticks;
      this.#connection.send(
        encode({ t: 'join', name: this.#options.name, passphrase: this.#options.passphrase, protocol: PROTOCOL_VERSION, ...(this.#options.mode ? { mode: this.#options.mode } : {}), ...(this.#options.bots === undefined ? {} : { bots: this.#options.bots }), ...(this.#options.hvb === undefined ? {} : { hvb: this.#options.hvb }), ...(this.#resume ? { resume: this.#resume } : {}), ...(this.#options.script ? { script: true } : {}), ...(this.#loadout ? { loadout: this.#loadout } : {}) }),
      );
    }
    this.#advanceClock();
    this.#decayCorrection();
    // Waiting to come back, the player holds still where they were last seen rather than leaving the view.
    if (this.#status === 'reconnecting') return { self: this.#self, predicted: [], server };
    if (this.#status !== 'joined' || this.#id === null) return { self: null, predicted: [], server };

    this.#reconcile();
    if (!this.#local.has(this.#id)) return { self: null, predicted: [], server };

    const seq = ++this.#seq;
    const sent: UserCmd = { ...cmd, viewTick: this.renderTick };
    this.#pending.push({ seq, cmd: sent });
    this.#sentAt.set(seq, this.#ticks);
    // The server ignores input during the intermission, so prediction does too.
    const out = this.#local.step({ [this.#id]: this.#frozen ? [] : sent });
    this.#self = out.players.find((p) => p.id === this.#id) ?? null;
    this.#connection.send(encode({ t: 'cmds', cmds: this.#pending.slice(-REDUNDANT_CMDS), ping: Math.round(this.#ping * 1000) }));
    return { self: this.#self, predicted: out.events, server };
  }

  /** The seat to ask for: this session's, or the one the page remembered. */
  get #resume(): string | null {
    return this.#token ?? this.#options.resume ?? null;
  }

  get #frozen(): boolean {
    const phase = this.#latest?.match.phase;
    return phase !== undefined && phase !== 'playing';
  }

  #readInbox(): (SimEvent | ModeEvent)[] {
    const fresh: (SimEvent | ModeEvent)[] = [];
    if (this.#inbox.length > 0) this.#heard = this.#ticks;
    for (const data of this.#inbox.splice(0)) {
      const message = decodeServer(data);
      if (!message) continue;
      if (message.t === 'welcome') {
        if (this.#rejoining) this.#rejoined(message.id);
        this.#status = 'joined';
        this.#attempting = false;
        this.#id = message.id;
        this.#token = message.token;
        this.#serverTick = message.tick;
      } else if (message.t === 'reject') {
        this.#status = 'rejected';
        this.#rejectReason = message.reason;
      } else if (message.t === 'snap') {
        for (const stamped of message.events) {
          const key = `${stamped.tick}:${stamped.index}`;
          if (this.#seen.has(key)) continue;
          this.#seen.add(key);
          if (!isOwnCosmetic(stamped.event, this.#id)) fresh.push(stamped.event);
        }
        if (!this.#latest || message.tick > this.#latest.tick || this.#resync) {
          this.#latest = message;
          this.#resync = false;
          if (message.self && message.self.life !== this.#life) {
            this.#life = message.self.life;
            this.#spawn = { yaw: message.self.cmdYaw + message.self.viewYaw, pitch: message.self.cmdPitch + message.self.viewPitch };
          }
          this.#serverTick = Math.max(this.#serverTick, message.tick);
          // One sample per acknowledged usercmd: later snapshots repeating the same ack (the uplink stalled) would only add their wait.
          const rtt = this.#sentAt.get(message.ack);
          this.#sentAt.delete(message.ack);
          if (rtt !== undefined) this.#ping = this.#ping === 0 ? (this.#ticks - rtt) * TICK_SECONDS : this.#ping * 0.9 + (this.#ticks - rtt) * TICK_SECONDS * 0.1;
        }
        this.#bufferSnapshot(message);
      }
    }
    if (this.#seen.size > 4000) {
      const cutoff = (this.#latest?.tick ?? 0) - 120;
      for (const key of this.#seen) if (Number(key.split(':')[0]) < cutoff) this.#seen.delete(key);
    }
    return fresh;
  }

  /**
   * Welcomed back after a drop: usercmds the old connection carried are gone
   * with it, and the server starts counting them afresh. The newest snapshot
   * stays up (the page keeps its match) until the next one replaces it,
   * whatever its tick: a restarted server counts from zero.
   */
  #rejoined(id: PlayerId): void {
    this.#rejoining = false;
    this.#resync = true;
    this.#pending = [];
    this.#sentAt.clear();
    this.#buffer.length = 0;
    this.#reconciled = -1;
    if (this.#id !== null && this.#id !== id) {
      this.#local.removePlayer(this.#id);
      this.#self = null;
      this.#life = -1;
    }
  }

  #bufferSnapshot(snap: Snapshot): void {
    if (this.#buffer.some((s) => s.tick === snap.tick)) return;
    this.#buffer.push(snap);
    this.#buffer.sort((a, b) => a.tick - b.tick);
    while (this.#buffer.length > 2 && (this.#buffer[1] as Snapshot).tick < this.renderTick - 1) this.#buffer.shift();
    while (this.#buffer.length > 120) this.#buffer.shift();
  }

  /** Keeps the estimate of the server's current tick moving one tick per tick, never behind the newest snapshot. */
  #advanceClock(): void {
    this.#serverTick += 1;
    const newest = this.#latest?.tick ?? this.#serverTick;
    const behind = newest - this.#serverTick;
    // Far off (joining, a stall): jump. Otherwise ease toward the newest snapshot so
    // jitter never makes other players skip forward.
    if (behind > 6 || behind < -30) this.#serverTick = newest;
    else if (behind > 0) this.#serverTick += behind * 0.1;
    else if (behind < -2) this.#serverTick -= 0.02;
  }

  #decayCorrection(): void {
    const k = Math.pow(0.5, TICK_SECONDS / (this.#options.correctionHalfLife ?? 0.1));
    const c = this.#correction;
    this.#correction = Math.hypot(c[0], c[1], c[2]) < 1e-4 ? [0, 0, 0] : [c[0] * k, c[1] * k, c[2] * k];
  }

  /** Rewinds to the newest server state of the local player and replays the usercmds it has not processed yet. */
  #reconcile(): void {
    const snap = this.#latest;
    const id = this.#id;
    if (!snap || id === null || snap.tick <= this.#reconciled) return;
    this.#reconciled = snap.tick;
    const before = this.#self?.position ?? null;
    if (!snap.self) {
      this.#local.removePlayer(id);
      this.#self = null;
      return;
    }
    this.#local.setPlayerState(snap.self);
    this.#local.setTick(snap.tick);
    this.#pending = this.#pending.filter((p) => p.seq > snap.ack);
    for (const seq of [...this.#sentAt.keys()]) if (seq < snap.ack) this.#sentAt.delete(seq);
    let out = this.#local.output();
    for (const p of this.#pending) out = this.#local.step({ [id]: this.#frozen ? [] : p.cmd }, { replay: true });
    const after = out.players.find((p) => p.id === id) ?? null;
    if (before && after) {
      const delta: Vec3 = [before[0] - after.position[0], before[1] - after.position[1], before[2] - after.position[2]];
      const next: Vec3 = [this.#correction[0] + delta[0], this.#correction[1] + delta[1], this.#correction[2] + delta[2]];
      this.#correction = Math.hypot(...delta) > SNAP_DISTANCE ? [0, 0, 0] : next;
    }
    this.#self = after;
  }

  /**
   * Other players and dummies, interpolated between snapshots at
   * {@link renderTick}, plus `offset` ticks (the render frame's fraction of a tick).
   */
  others(offset = 0): PlayerOutput[] {
    const at = this.renderTick + offset;
    const buffer = this.#buffer;
    if (buffer.length === 0) return [];
    let a = buffer[0] as Snapshot;
    let b = a;
    for (const s of buffer) {
      if (s.tick <= at) a = s;
      if (s.tick >= at) {
        b = s;
        break;
      }
      b = s;
    }
    if (b.tick < a.tick) b = a;
    const f = b.tick === a.tick ? 0 : Math.min(1, Math.max(0, (at - a.tick) / (b.tick - a.tick)));
    return a.players.map((pa) => {
      const pb = b.players.find((p) => p.id === pa.id);
      if (!pb || f === 0) return pa;
      // Respawns teleport: no sliding across the map.
      if (Math.hypot(pb.position[0] - pa.position[0], pb.position[2] - pa.position[2]) > SNAP_DISTANCE) return f < 0.5 ? pa : pb;
      const near = f < 0.5 ? pa : pb;
      return {
        ...near,
        position: lerpVec(pa.position, pb.position, f),
        velocity: lerpVec(pa.velocity, pb.velocity, f),
        yaw: pa.yaw + angleDelta(pa.yaw, pb.yaw) * f,
        pitch: pa.pitch + (pb.pitch - pa.pitch) * f,
        eyeHeight: pa.eyeHeight + (pb.eyeHeight - pa.eyeHeight) * f,
      };
    });
  }

  close(): void {
    this.#connection.close('client left');
    this.#status = 'closed';
  }
}

/** Your own shots, impacts, reloads, switches and grenade handling are already predicted locally, so the server's copies are skipped. */
function isOwnCosmetic(event: SimEvent | ModeEvent, id: PlayerId | null): boolean {
  if (id === null) return false;
  switch (event.type) {
    case 'shot':
    case 'impact':
    case 'prop':
      return event.shooter === id;
    case 'reload':
    case 'switch':
    case 'grenade':
      return event.player === id;
    case 'melee':
      return event.attacker === id && event.victim === null;
    default:
      return false;
  }
}
