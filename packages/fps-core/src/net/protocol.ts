import type { ModeEvent, Score } from '../modes/game-mode';
import type { PlayerOutput, PlayerState, SimEvent } from '../simulation';
import type { UserCmd } from '../usercmd';

/** Bumped whenever the messages change; client and server must agree. */
export const PROTOCOL_VERSION = 1;

/** Usercmds a client repeats in every packet, so a lost packet's usercmds arrive with the next one. */
export const REDUNDANT_CMDS = 8;

/** Events stay in snapshots for this many ticks, so a lost snapshot's events arrive with a later one. */
export const EVENT_RESEND_TICKS = 20;

export type RejectReason = 'passphrase' | 'full' | 'protocol' | 'name';

/** A usercmd tagged with the client's sequence number. */
export interface SequencedCmd {
  readonly seq: number;
  readonly cmd: UserCmd;
}

export type ClientMessage =
  | { readonly t: 'join'; readonly name: string; readonly passphrase: string; readonly protocol: number }
  | { readonly t: 'cmds'; readonly cmds: readonly SequencedCmd[] };

/** A simulation or game-mode event, stamped with its tick and position in that tick for de-duplication. */
export interface StampedEvent {
  readonly tick: number;
  readonly index: number;
  readonly event: SimEvent | ModeEvent;
}

export interface Snapshot {
  readonly t: 'snap';
  readonly tick: number;
  /** Highest usercmd sequence number the server has processed for this client. */
  readonly ack: number;
  /** The client's own full state, for reconciliation (null while not in the simulation). */
  readonly self: PlayerState | null;
  /** Everyone else, as seen after `tick`. */
  readonly players: readonly PlayerOutput[];
  readonly events: readonly StampedEvent[];
  readonly scores: readonly Score[];
  /** Display names by player id. */
  readonly names: Readonly<Record<string, string>>;
}

export type ServerMessage =
  | { readonly t: 'welcome'; readonly id: string; readonly tick: number; readonly mode: string; readonly maxPlayers: number }
  | { readonly t: 'reject'; readonly reason: RejectReason }
  | Snapshot;

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/** Parses a client message, or returns null if it is malformed. Never throws. */
export function decodeClient(data: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  if (value['t'] === 'join') {
    const { name, passphrase, protocol } = value;
    if (typeof name !== 'string' || typeof passphrase !== 'string' || typeof protocol !== 'number') return null;
    return { t: 'join', name, passphrase, protocol };
  }
  if (value['t'] === 'cmds') {
    const cmds = value['cmds'];
    if (!Array.isArray(cmds) || cmds.length > REDUNDANT_CMDS * 2) return null;
    const out: SequencedCmd[] = [];
    for (const c of cmds) {
      const cmd = isObject(c) ? validCmd(c['cmd']) : null;
      if (!cmd || !isObject(c) || !Number.isInteger(c['seq'])) return null;
      out.push({ seq: c['seq'] as number, cmd });
    }
    return { t: 'cmds', cmds: out };
  }
  return null;
}

export function decodeServer(data: string): ServerMessage | null {
  try {
    const value: unknown = JSON.parse(data);
    return isObject(value) && typeof value['t'] === 'string' ? (value as unknown as ServerMessage) : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates and clamps a usercmd from the wire, so a client cannot send impossible input. */
function validCmd(value: unknown): UserCmd | null {
  if (!isObject(value)) return null;
  const { buttons, forward, right, yaw, pitch, firePresses, viewTick } = value;
  if (!Number.isInteger(buttons) || !finite(forward) || !finite(right) || !finite(yaw) || !finite(pitch)) return null;
  if (!Array.isArray(firePresses) || firePresses.length > 4 || !firePresses.every(finite)) return null;
  if (viewTick !== undefined && !finite(viewTick)) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    buttons: (buttons as number) & 0x1ff,
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    yaw,
    pitch: clamp(pitch, -Math.PI / 2, Math.PI / 2),
    firePresses: firePresses.map((f) => clamp(f, 0, 0.999999)),
    ...(viewTick === undefined ? {} : { viewTick }),
  };
}

/** Rounds the numbers in another player's outputs for the wire; they are only drawn and interpolated. */
export function compactOutput(p: PlayerOutput): PlayerOutput {
  const r = (v: number, k = 1000) => Math.round(v * k) / k;
  return {
    ...p,
    position: [r(p.position[0]), r(p.position[1]), r(p.position[2])],
    velocity: [r(p.velocity[0], 100), r(p.velocity[1], 100), r(p.velocity[2], 100)],
    yaw: r(p.yaw, 10000),
    pitch: r(p.pitch, 10000),
    eyeHeight: r(p.eyeHeight),
    health: r(p.health, 10),
    weapon: { ...p.weapon, actionTime: r(p.weapon.actionTime), ads: r(p.weapon.ads, 100), spread: r(p.weapon.spread, 100) },
  };
}
