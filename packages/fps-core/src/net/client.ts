import { lerpVec, type Vec3 } from '../math';
import type { ModeEvent, Score } from '../modes/game-mode';
import { Simulation, TICK_SECONDS, type PlayerId, type PlayerOutput, type SimEvent } from '../simulation';
import type { UserCmd } from '../usercmd';
import type { World } from '../world';
import { PROTOCOL_VERSION, REDUNDANT_CMDS, decodeServer, encode, type RejectReason, type SequencedCmd, type Snapshot } from './protocol';
import type { Connection } from './transport';

export interface GameClientOptions {
  readonly connection: Connection;
  readonly world: World;
  readonly name: string;
  readonly passphrase: string;
  /** How far behind the newest snapshot other players are drawn, in ticks. */
  readonly interpolationDelay?: number;
  /** Half-life (s) of the visual smoothing applied to prediction corrections. */
  readonly correctionHalfLife?: number;
}

export type ClientStatus = 'connecting' | 'joined' | 'rejected' | 'closed';

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

/**
 * A client's view of a networked match. Predicts the local player by running
 * the simulation on its own usercmds, reconciles against each server snapshot
 * by rewinding to the server's state and replaying unacknowledged usercmds,
 * smooths the visible correction, and interpolates other players between
 * snapshots a few ticks in the past.
 */
export class GameClient {
  readonly #options: GameClientOptions;
  readonly #connection: Connection;
  readonly #local: Simulation;
  readonly #inbox: string[] = [];
  #status: ClientStatus = 'connecting';
  #rejectReason: RejectReason | null = null;
  #closeReason: string | null = null;
  #id: PlayerId | null = null;
  #ticks = 0;
  #lastJoin = -Infinity;
  #seq = 0;
  #pending: SequencedCmd[] = [];
  readonly #sentAt = new Map<number, number>();
  #latest: Snapshot | null = null;
  #reconciled = -1;
  readonly #buffer: Snapshot[] = [];
  readonly #seen = new Set<string>();
  #serverTick = 0;
  #ping = 0;
  #self: PlayerOutput | null = null;
  #correction: Vec3 = [0, 0, 0];

  constructor(options: GameClientOptions) {
    this.#options = options;
    this.#connection = options.connection;
    this.#local = new Simulation(options.world);
    this.#connection.onMessage((data) => this.#inbox.push(data));
    this.#connection.onClose((reason) => {
      this.#closeReason = reason;
      // A rejection's close reason names it, in case the reject message itself was lost.
      const rejected = /^rejected: (\w+)$/.exec(reason);
      if (rejected) {
        this.#status = 'rejected';
        this.#rejectReason = rejected[1] as RejectReason;
      } else if (this.#status !== 'rejected') this.#status = 'closed';
    });
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

  /** The newest authoritative snapshot. */
  get snapshot(): Snapshot | null {
    return this.#latest;
  }

  /** One client tick: reads the network, reconciles, predicts `cmd` and sends it. */
  tick(cmd: UserCmd): ClientFrame {
    this.#ticks += 1;
    const server = this.#readInbox();
    if (this.#status === 'connecting' && this.#ticks - this.#lastJoin >= JOIN_RETRY_TICKS) {
      this.#lastJoin = this.#ticks;
      this.#connection.send(encode({ t: 'join', name: this.#options.name, passphrase: this.#options.passphrase, protocol: PROTOCOL_VERSION }));
    }
    this.#advanceClock();
    this.#decayCorrection();
    if (this.#status !== 'joined' || this.#id === null) return { self: null, predicted: [], server };

    this.#reconcile();
    if (!this.#local.has(this.#id)) return { self: null, predicted: [], server };

    const seq = ++this.#seq;
    const sent: UserCmd = { ...cmd, viewTick: this.renderTick };
    this.#pending.push({ seq, cmd: sent });
    this.#sentAt.set(seq, this.#ticks);
    const out = this.#local.step({ [this.#id]: sent });
    this.#self = out.players.find((p) => p.id === this.#id) ?? null;
    this.#connection.send(encode({ t: 'cmds', cmds: this.#pending.slice(-REDUNDANT_CMDS) }));
    return { self: this.#self, predicted: out.events, server };
  }

  #readInbox(): (SimEvent | ModeEvent)[] {
    const fresh: (SimEvent | ModeEvent)[] = [];
    for (const data of this.#inbox.splice(0)) {
      const message = decodeServer(data);
      if (!message) continue;
      if (message.t === 'welcome') {
        this.#status = 'joined';
        this.#id = message.id;
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
        if (!this.#latest || message.tick > this.#latest.tick) {
          this.#latest = message;
          this.#serverTick = Math.max(this.#serverTick, message.tick);
          const rtt = this.#sentAt.get(message.ack);
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
    for (const p of this.#pending) out = this.#local.step({ [id]: p.cmd }, { replay: true });
    const after = out.players.find((p) => p.id === id) ?? null;
    if (before && after) {
      const delta: Vec3 = [before[0] - after.position[0], before[1] - after.position[1], before[2] - after.position[2]];
      const next: Vec3 = [this.#correction[0] + delta[0], this.#correction[1] + delta[1], this.#correction[2] + delta[2]];
      this.#correction = Math.hypot(...delta) > SNAP_DISTANCE ? [0, 0, 0] : next;
    }
    this.#self = after;
  }

  /** Other players and dummies, interpolated between snapshots at {@link renderTick}. */
  others(): PlayerOutput[] {
    const at = this.renderTick;
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

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Your own shots, impacts and reloads are already predicted locally, so the server's copies are skipped. */
function isOwnCosmetic(event: SimEvent | ModeEvent, id: PlayerId | null): boolean {
  if (id === null) return false;
  switch (event.type) {
    case 'shot':
    case 'impact':
      return event.shooter === id;
    case 'reload':
      return event.player === id;
    case 'melee':
      return event.attacker === id && event.victim === null;
    default:
      return false;
  }
}
