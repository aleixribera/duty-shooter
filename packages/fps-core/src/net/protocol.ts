import { MODE_IDS, type MatchResult, type ModeEvent, type ModeId, type ObjectiveState, type Score, type TeamScore } from '../modes/game-mode';
import type { GrenadeOutput } from '../combat/grenade';
import type { PlayerOutput, PlayerState, SimEvent } from '../simulation';
import { parseLoadout, type Loadout } from '../weapon/loadout';
import { ALL_BUTTONS, type UserCmd } from '../usercmd';

/** Bumped whenever the messages change; client and server must agree. */
export const PROTOCOL_VERSION = 9;

/** Usercmds a client repeats in every packet, so a lost packet's usercmds arrive with the next one. */
export const REDUNDANT_CMDS = 8;

/** Events stay in snapshots for this many ticks, so a lost snapshot's events arrive with a later one. */
export const EVENT_RESEND_TICKS = 20;

/** Longest seat token accepted in a join. */
const MAX_TOKEN = 64;

export type RejectReason = 'passphrase' | 'full' | 'protocol' | 'name';

/** A usercmd tagged with the client's sequence number. */
export interface SequencedCmd {
  readonly seq: number;
  readonly cmd: UserCmd;
}

/**
 * The host's choices for the next match: mode, bots, humans vs bots, and map.
 * A pick changes only what it names. `fill` turns bots on (filling to the
 * map's team size for the mode) or off; `bots` sets a size of the host's own,
 * a side, kept until the map or mode changes.
 */
export type LobbyPick = { readonly mode?: ModeId; readonly fill?: boolean; readonly bots?: number; readonly hvb?: boolean; readonly map?: string };

export type ClientMessage =
  | {
      readonly t: 'join';
      readonly name: string;
      readonly passphrase: string;
      readonly protocol: number;
      /** The mode the joiner would like; honoured only on an empty server. */
      readonly mode?: ModeId;
      /** Bots a side the joiner would like (within the server's cap); honoured only on an empty server. */
      readonly bots?: number;
      /** Humans vs bots, as the joiner would like it; honoured only on an empty server. */
      readonly hvb?: boolean;
      /** The seat token from an earlier welcome: a player back within the grace period takes up where they left off. */
      readonly resume?: string;
      /** Set by the smoke and load-test scripts, so the event log doesn't count them as people. */
      readonly script?: boolean;
      /** What the joiner carries; the default loadout when absent. */
      readonly loadout?: Loadout;
    }
  /** A new loadout, carried from the player's next spawn. */
  | { readonly t: 'loadout'; readonly loadout: Loadout }
  /** Usercmds, with the round trip (ms) the client last measured, for everyone's scoreboard. */
  | { readonly t: 'cmds'; readonly cmds: readonly SequencedCmd[]; readonly ping?: number }
  /** A vote for the next match's mode, changeable until the vote window closes. */
  | { readonly t: 'vote'; readonly mode: ModeId }
  /** The host's choices for the next match, in the lobby. */
  | ({ readonly t: 'lobby' } & LobbyPick)
  /** The host starts the next match from the lobby. */
  | { readonly t: 'start' };

/**
 * Where the match is: playing, or in the intermission after `matchEnd`
 * (the nuke, then the scoreboard and vote, then `matchStart`). A server with
 * a lobby has no vote: after the scoreboard everyone goes back to the
 * `lobby`, until the host starts the next match.
 */
export type Phase = 'playing' | 'nuke' | 'vote' | 'lobby';

/** The intermission's default phase lengths (s): the nuke, then the scoreboard and vote (just the scoreboard on a server with a lobby). */
export const INTERMISSION = { nuke: 6, vote: 14, scoreboard: 10 } as const;

/** The lobby between matches, as every client needs it. */
export interface LobbyState {
  /** The person who picks and starts the next match: the first one in, until they leave. */
  readonly host: string | null;
  /** The people in the lobby (bots aside), in the order they joined, and how many it holds. */
  readonly players: readonly string[];
  readonly capacity: number;
  /** The host's picks for the next match. */
  readonly mode: ModeId;
  /** Bots a side the match fills to (0: bots off): the map's team size for the mode, or the host's own size. */
  readonly bots: number;
  /** Whether `bots` is the host's own size rather than the map's. */
  readonly custom: boolean;
  /** The most bots a side the host may pick; 0 when the server has none. */
  readonly maxBots: number;
  /** Humans vs bots for the next match (team modes only). */
  readonly hvb: boolean;
  /** The maps the lobby can play, and the one picked. */
  readonly maps: readonly string[];
  readonly map: string;
}

/** The match as every client needs it: map, mode, phase and its deadline, limits, team scores and the vote. */
export interface MatchStatus {
  /** The map the match is on (it changes only at a match's start). */
  readonly map: string;
  readonly mode: ModeId;
  readonly phase: Phase;
  /** Simulation time (s) the phase ends: the time limit while playing (null without one), the next phase in the intermission. */
  readonly phaseEnds: number | null;
  readonly killLimit: number | null;
  /** Team points that win an objective mode; null for none. */
  readonly scoreLimit: number | null;
  readonly timeLimit: number | null;
  /** Seconds a dead player waits before respawning. */
  readonly respawnDelay: number;
  readonly teamScores: readonly TeamScore[] | null;
  /** Votes cast so far for each mode. */
  readonly votes: Readonly<Record<ModeId, number>>;
  /** The mode the next match will be if the vote ended now. */
  readonly next: ModeId;
  /** How the match ended, during the intermission. */
  readonly result: MatchResult | null;
  /** The mode's objectives (Outposts zones), or null. */
  readonly objective: ObjectiveState | null;
  /** The lobby, on a server that has one (null on one that runs matches back to back). */
  readonly lobby: LobbyState | null;
}

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
  /** Each player's round trip (ms) as their client measured it. */
  readonly pings: Readonly<Record<string, number>>;
  /** Ids of the props shot this match (mannequin heads knocked off), in the order they went. */
  readonly popped: readonly string[];
  /** Grenades in flight or on the ground. */
  readonly grenades: readonly GrenadeOutput[];
  readonly match: MatchStatus;
}

export type ServerMessage =
  /** `token` is this seat's secret: joining again with it as `resume` takes the seat back after a drop. */
  | { readonly t: 'welcome'; readonly id: string; readonly tick: number; readonly mode: ModeId; readonly map: string; readonly maxPlayers: number; readonly token: string }
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
    const { name, passphrase, protocol, mode, bots, hvb, resume, script } = value;
    const loadout = value['loadout'] === undefined ? undefined : parseLoadout(value['loadout']);
    if (loadout === null) return null;
    if (typeof name !== 'string' || typeof passphrase !== 'string' || typeof protocol !== 'number') return null;
    if (mode !== undefined && !isMode(mode)) return null;
    if (bots !== undefined && !(typeof bots === 'number' && Number.isInteger(bots) && bots >= 0 && bots <= 16)) return null;
    if (resume !== undefined && !(typeof resume === 'string' && resume.length <= MAX_TOKEN)) return null;
    if (script !== undefined && typeof script !== 'boolean') return null;
    if (hvb !== undefined && typeof hvb !== 'boolean') return null;
    return {
      t: 'join',
      name,
      passphrase,
      protocol,
      ...(mode === undefined ? {} : { mode }),
      ...(bots === undefined ? {} : { bots }),
      ...(hvb === undefined ? {} : { hvb }),
      ...(resume === undefined ? {} : { resume }),
      ...(script ? { script } : {}),
      ...(loadout ? { loadout } : {}),
    };
  }
  if (value['t'] === 'loadout') {
    const loadout = parseLoadout(value['loadout']);
    return loadout ? { t: 'loadout', loadout } : null;
  }
  if (value['t'] === 'vote') {
    const { mode } = value;
    return isMode(mode) ? { t: 'vote', mode } : null;
  }
  if (value['t'] === 'lobby') {
    const { mode, fill, bots, hvb, map } = value;
    if (mode !== undefined && !isMode(mode)) return null;
    if (fill !== undefined && typeof fill !== 'boolean') return null;
    if (bots !== undefined && !(typeof bots === 'number' && Number.isInteger(bots) && bots >= 0 && bots <= 16)) return null;
    if (hvb !== undefined && typeof hvb !== 'boolean') return null;
    if (map !== undefined && !(typeof map === 'string' && map.length <= 40)) return null;
    return { t: 'lobby', ...(mode === undefined ? {} : { mode }), ...(fill === undefined ? {} : { fill }), ...(bots === undefined ? {} : { bots }), ...(hvb === undefined ? {} : { hvb }), ...(map === undefined ? {} : { map }) };
  }
  if (value['t'] === 'start') return { t: 'start' };
  if (value['t'] === 'cmds') {
    const cmds = value['cmds'];
    if (!Array.isArray(cmds) || cmds.length > REDUNDANT_CMDS * 2) return null;
    const out: SequencedCmd[] = [];
    for (const c of cmds) {
      const cmd = isObject(c) ? validCmd(c['cmd']) : null;
      if (!cmd || !isObject(c) || !Number.isInteger(c['seq'])) return null;
      out.push({ seq: c['seq'] as number, cmd });
    }
    const ping = value['ping'];
    return finite(ping) ? { t: 'cmds', cmds: out, ping: Math.round(Math.min(9999, Math.max(0, ping))) } : { t: 'cmds', cmds: out };
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

function isMode(value: unknown): value is ModeId {
  return typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value);
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
    buttons: (buttons as number) & ALL_BUTTONS,
    forward: clamp(forward, -1, 1),
    right: clamp(right, -1, 1),
    yaw,
    // Past straight down or up: the client counts recoil into its pitch limits, and the simulation clamps the view.
    pitch: clamp(pitch, -Math.PI, Math.PI),
    firePresses: firePresses.map((f) => clamp(f, 0, 0.999999)),
    ...(viewTick === undefined ? {} : { viewTick }),
  };
}

/** Rounds a grenade's numbers for the wire; clients only draw it. */
export function compactGrenade(g: GrenadeOutput): GrenadeOutput {
  const r = (v: number, k = 1000) => Math.round(v * k) / k;
  return { ...g, position: [r(g.position[0]), r(g.position[1]), r(g.position[2])], velocity: [r(g.velocity[0], 100), r(g.velocity[1], 100), r(g.velocity[2], 100)] };
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
