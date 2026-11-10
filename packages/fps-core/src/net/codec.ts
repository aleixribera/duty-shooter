import type { GrenadeOutput } from '../combat/grenade';
import type { PlayerOutput } from '../simulation';
import type { StampedEvent, WireSnapshot } from './protocol';

/**
 * The binary snapshot: a frame of varints, with other players in a fixed record
 * and the rest as packed values (see {@link packValue}), which describe
 * themselves, so a new field reaches the client with no change here. Only type
 * imports, so the load scripts can run this file as it is.
 *
 * Everything but snapshots stays JSON text: a page from before a protocol bump
 * must still be able to read its rejection.
 */

declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new () => { decode(bytes: Uint8Array): string };

/** What rarely changes: on a reliable connection these travel only when they do. */
export const STICKY_FIELDS = ['scores', 'names', 'pings', 'popped', 'match'] as const;
export type StickyField = (typeof STICKY_FIELDS)[number];

/**
 * Strings worth a single byte: the keys and the enum values of the snapshot.
 * The order is part of the protocol: bump it to change them. A string that
 * isn't here still travels, spelled out.
 */
export const WORDS = [
  // Player state.
  'id', 'team', 'kind', 'player', 'dummy', 'move', 'weapons', 'slot', 'loadout', 'grenades', 'cmdYaw', 'cmdPitch', 'viewYaw', 'viewPitch', 'health', 'lastDamage', 'landing', 'diedAt', 'life', 'spawn', 'grenade', 'phase', 'since', 'time',
  'position', 'velocity', 'yaw', 'pitch', 'grounded', 'movement', 'stance', 'stanceFrom', 'eyeHeight', 'eyeRate', 'prevButtons', 'airPeak', 'landedFrom', 'mantle', 'mantleBand', 'slide', 'ladder', 'band', 'from', 'to', 'dir', 'entrySpeed', 'ticks',
  'ammo', 'action', 'actionTime', 'reload', 'ammoAdded', 'shellsLoaded', 'meleeResolved', 'ads', 'steady', 'clock', 'nextShot', 'fireReadyAt', 'lastShot', 'shotIndex', 'shotsFired', 'reloadHeld', 'primary', 'secondary',
  'walk', 'sprint', 'airborne', 'stand', 'crouch', 'prone', 'lowVault', 'waist', 'highClimb', 'draw', 'ready', 'cycle', 'inspect', 'melee', 'holster', 'tactical', 'empty', 'cook', 'throw', 'drop',
  'm4a1', 'smg', 'shotgun', 'sniper', 'pistol', 'frag',
  // Events.
  'tick', 'index', 'event', 'type', 'shot', 'hit', 'impact', 'prop', 'kill', 'bounce', 'explosion', 'switch', 'shooter', 'weapon', 'origin', 'direction', 'fraction', 'pellets', 'victim', 'zone', 'damage', 'distance', 'point', 'killed', 'cause', 'normal', 'material', 'side', 'entry', 'exit', 'killer', 'attacker', 'speed', 'thrower', 'bullet', 'fall',
  'head', 'neck', 'upperTorso', 'lowerTorso', 'arm', 'leg', 'foot', 'concrete', 'metal', 'wood', 'dirt', 'grass', 'glass', 'plaster', 'brick', 'asphalt', 'gravel', 'sand', 'sheetMetal', 'plastic',
  'killFeed', 'killerName', 'victimName', 'headshot', 'capture', 'previous', 'roundStart', 'roundEnd', 'round', 'attackers', 'winner', 'reason', 'charge', 'site', 'matchStart', 'matchEnd', 'level',
  // The match.
  'name', 'kills', 'deaths', 'score', 'bot', 'map', 'mode', 'phaseEnds', 'countdownEnds', 'killLimit', 'scoreLimit', 'timeLimit', 'respawnDelay', 'teamScores', 'votes', 'next', 'result', 'objective', 'lobby', 'host', 'players', 'capacity', 'bots', 'custom', 'maxBots', 'hvb', 'maps',
  'playing', 'nuke', 'vote', 'tdm', 'ffa', 'outposts', 'gungame', 'winnerName', 'zones', 'guns', 'progress', 'owner', 'contested', 'capturing', 'remaining', 'carrier', 'dropped', 'planted', 'outcome', 'freeze', 'live', 'over', 'plant', 'defuse',
  // Downed and Revive.
  'downed', 'reviving', 'revive', 'by', 'target', 'down', 'reviver',
  // Score: on every scoreboard row. The last word a single byte can name.
  'assists',
] as const satisfies readonly string[];

/**
 * Words that came after the single bytes ran out: two bytes each (a tag, then
 * which word). New words go at the end of this list, and the same rule holds:
 * the order is part of the protocol.
 */
export const MORE_WORDS = [
  // Recoil return (protocol 26): the recoil a seat is still owed back, in its own state.
  'recoilYaw', 'recoilPitch',
  // Score (protocol 26): a row's Medal, a score event's lines, and the reasons a line can have.
  'medal', 'lines', 'points', 'metres', 'finish', 'assist', 'longShot', 'firstBlood', 'revenge', 'doubleKill', 'tripleKill', 'multiKill', 'streak3', 'streak5', 'streak7', 'streak10', 'zoneKill', 'reboot',
] as const satisfies readonly string[];

const WORD_INDEX: ReadonlyMap<string, number> = new Map(WORDS.map((word, i) => [word, i]));
const MORE_WORD_INDEX: ReadonlyMap<string, number> = new Map(MORE_WORDS.map((word, i) => [word, i]));

// A packed value starts with one of these bytes; from SMALL on, the byte is the value.
const NULL = 0;
const FALSE = 1;
const TRUE = 2;
const FLOAT = 3;
const DOUBLE = 4;
const INTEGER = 5;
const STRING = 6;
const ARRAY = 7;
const OBJECT = 8;
const UNDEFINED = 9;
/** A word of {@link MORE_WORDS}: this tag, then a byte for which. */
const MORE = 10;
const SMALL = 16;
const SMALL_COUNT = 16;
const WORD = SMALL + SMALL_COUNT;

/** How many words a byte can name. */
export const MOST_WORDS = 256 - WORD;

/** Whole numbers past this go as doubles: zigzag would need more bits than a double holds. */
const LARGEST_INTEGER = 2 ** 52;

/** Wire units of a player record: what the eye can tell apart on a moving soldier. */
const MM = 1000;
const CM = 100;
const PITCH_UNITS = 10000;
const TAU = Math.PI * 2;
const YAW_UNITS = 65536;

// A player record's flags.
const ALIVE = 1;
const CAN_FIRE = 2;
const IS_DUMMY = 4;
const HAS_MANTLE = 8;
const HAS_RELOAD = 16;
const HAS_LANDING = 32;
const HAS_GRENADE = 64;
const HAS_REVIVE_STATE = 128;
// What follows that flag.
const IS_DOWNED = 1;
const IS_REVIVING = 2;
/** A Revive's share, and Bleed-out's seconds, in a byte each: the HUD shows no finer. */
const SHARE_UNITS = 255;
const BLEED_UNITS = 4;

const HAS_SELF = 1;
const FIRST_STICKY_FLAG = 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class Writer {
  #bytes = new Uint8Array(4096);
  #view = new DataView(this.#bytes.buffer);
  #at = 0;

  #reserve(extra: number): void {
    if (this.#at + extra <= this.#bytes.length) return;
    const grown = new Uint8Array(Math.max(this.#bytes.length * 2, this.#at + extra));
    grown.set(this.#bytes.subarray(0, this.#at));
    this.#bytes = grown;
    this.#view = new DataView(grown.buffer);
  }

  byte(value: number): void {
    this.#reserve(1);
    this.#bytes[this.#at++] = value;
  }

  /** A whole number of any size, seven bits a byte, smallest bits first. */
  varuint(value: number): void {
    this.#reserve(160);
    let rest = value;
    while (rest >= 128) {
      this.#bytes[this.#at++] = (rest % 128) | 128;
      rest = Math.floor(rest / 128);
    }
    this.#bytes[this.#at++] = rest;
  }

  /** A signed whole number: small either side of zero is short. */
  varint(value: number): void {
    this.varuint(value < 0 ? -2 * value - 1 : 2 * value);
  }

  float(value: number): void {
    this.#reserve(4);
    this.#view.setFloat32(this.#at, value);
    this.#at += 4;
  }

  double(value: number): void {
    this.#reserve(8);
    this.#view.setFloat64(this.#at, value);
    this.#at += 8;
  }

  bytes(chunk: Uint8Array): void {
    this.#reserve(chunk.length);
    this.#bytes.set(chunk, this.#at);
    this.#at += chunk.length;
  }

  /** What was written, in a copy of its own, leaving the writer empty. */
  take(): Uint8Array {
    const taken = this.#bytes.slice(0, this.#at);
    this.#at = 0;
    return taken;
  }
}

class Reader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  #at = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  byte(): number {
    if (this.#at >= this.#bytes.length) throw new RangeError('The frame ended early');
    return this.#bytes[this.#at++] as number;
  }

  varuint(): number {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.byte();
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
  }

  varint(): number {
    const value = this.varuint();
    return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
  }

  float(): number {
    const value = this.#view.getFloat32(this.#at);
    this.#at += 4;
    return value;
  }

  double(): number {
    const value = this.#view.getFloat64(this.#at);
    this.#at += 8;
    return value;
  }

  text(length: number): string {
    if (this.#at + length > this.#bytes.length) throw new RangeError('The frame ended early');
    const text = decoder.decode(this.#bytes.subarray(this.#at, this.#at + length));
    this.#at += length;
    return text;
  }
}

/** One writer, emptied by each {@link Writer.take}: a server sends thousands of these chunks a second. */
const out = new Writer();

export interface PackOptions {
  /** Fractions go as floats, a tenth of a millimetre at the edge of a kilometre-wide map: for what is only drawn. */
  readonly lossy?: boolean;
}

function writeString(text: string): void {
  const word = WORD_INDEX.get(text);
  if (word !== undefined) {
    out.byte(WORD + word);
    return;
  }
  const more = MORE_WORD_INDEX.get(text);
  if (more !== undefined) {
    out.byte(MORE);
    out.byte(more);
    return;
  }
  const bytes = encoder.encode(text);
  out.byte(STRING);
  out.varuint(bytes.length);
  out.bytes(bytes);
}

function writeNumber(value: number, lossy: boolean): void {
  if (Number.isInteger(value) && Math.abs(value) < LARGEST_INTEGER) {
    if (value >= 0 && value < SMALL_COUNT) {
      out.byte(SMALL + value);
    } else {
      out.byte(INTEGER);
      out.varint(value);
    }
  } else if (lossy || Math.fround(value) === value) {
    out.byte(FLOAT);
    out.float(value);
  } else {
    out.byte(DOUBLE);
    out.double(value);
  }
}

function writeValue(value: unknown, lossy: boolean): void {
  if (value === null) out.byte(NULL);
  else if (value === undefined) out.byte(UNDEFINED);
  else if (value === true) out.byte(TRUE);
  else if (value === false) out.byte(FALSE);
  else if (typeof value === 'number') writeNumber(value, lossy);
  else if (typeof value === 'string') writeString(value);
  else if (Array.isArray(value)) {
    out.byte(ARRAY);
    out.varuint(value.length);
    for (const item of value) writeValue(item, lossy);
  } else {
    const entries = Object.entries(value as object).filter((entry) => entry[1] !== undefined);
    out.byte(OBJECT);
    out.varuint(entries.length);
    for (const [key, item] of entries) {
      writeString(key);
      writeValue(item, lossy);
    }
  }
}

function readValue(reader: Reader): unknown {
  const tag = reader.byte();
  if (tag >= WORD) {
    const word = WORDS[tag - WORD];
    if (word === undefined) throw new RangeError('Not a word');
    return word;
  }
  if (tag >= SMALL) return tag - SMALL;
  switch (tag) {
    case NULL:
      return null;
    case UNDEFINED:
      return undefined;
    case FALSE:
      return false;
    case TRUE:
      return true;
    case FLOAT:
      return reader.float();
    case DOUBLE:
      return reader.double();
    case INTEGER:
      return reader.varint();
    case STRING:
      return reader.text(reader.varuint());
    case MORE: {
      const word = MORE_WORDS[reader.byte()];
      if (word === undefined) throw new RangeError('Not a word');
      return word;
    }
    case ARRAY: {
      const list: unknown[] = [];
      for (let n = reader.varuint(); n > 0; n--) list.push(readValue(reader));
      return list;
    }
    case OBJECT: {
      const object: Record<string, unknown> = {};
      for (let n = reader.varuint(); n > 0; n--) {
        const key = readValue(reader) as string;
        object[key] = readValue(reader);
      }
      return object;
    }
    default:
      throw new RangeError(`Not a value: ${tag}`);
  }
}

/** Any JSON-like value in few bytes. Exact unless told otherwise: a client's own state must come back to the bit. */
export function packValue(value: unknown, options: PackOptions = {}): Uint8Array {
  writeValue(value, options.lossy === true);
  return out.take();
}

export function unpackValue(bytes: Uint8Array): unknown {
  return readValue(new Reader(bytes));
}

const units = (value: number, per: number): number => Math.round(value * per) + 0;
const positive = (value: number, per: number): number => Math.max(0, units(value, per));

/** Another player, once a tick, for every client that gets them: everything a client needs to draw them, and no more. */
export function packPlayer(p: PlayerOutput): Uint8Array {
  const w = p.weapon;
  out.byte((p.alive ? ALIVE : 0) | (w.canFire ? CAN_FIRE : 0) | (p.kind === 'dummy' ? IS_DUMMY : 0) | (p.mantle ? HAS_MANTLE : 0) | (w.reload ? HAS_RELOAD : 0) | (p.landing ? HAS_LANDING : 0) | (p.grenade ? HAS_GRENADE : 0) | (p.downed || p.reviving !== null ? HAS_REVIVE_STATE : 0));
  writeString(p.id);
  out.varuint(p.team);
  for (const v of p.position) out.varint(units(v, MM));
  for (const v of p.velocity) out.varint(units(v, CM));
  // A turn in two bytes: a usercmd's yaw may have spun any number of times, and clients only take its heading.
  const turn = Math.round((((p.yaw % TAU) + TAU) % TAU) * (YAW_UNITS / TAU)) % YAW_UNITS;
  out.byte(turn >> 8);
  out.byte(turn & 255);
  out.varint(units(p.pitch, PITCH_UNITS));
  writeString(p.movement);
  writeString(p.stance);
  out.varuint(positive(p.eyeHeight, MM));
  out.varuint(positive(p.health, 10));
  writeString(w.id);
  out.varuint(w.slot);
  writeString(w.action);
  out.varuint(positive(w.actionTime, MM));
  out.varuint(w.ammo);
  out.varuint(positive(w.ads, CM));
  out.varuint(positive(w.spread, CM));
  out.varuint(w.shotIndex);
  writeValue(p.loadout, false);
  out.varuint(p.grenades);
  if (p.mantle) writeString(p.mantle);
  if (w.reload) writeString(w.reload);
  if (p.landing) {
    out.float(p.landing.fallHeight);
    out.float(p.landing.damage);
  }
  if (p.grenade) {
    writeString(p.grenade.phase);
    out.float(p.grenade.time);
  }
  if (p.downed || p.reviving !== null) {
    out.byte((p.downed ? IS_DOWNED : 0) | (p.reviving !== null ? IS_REVIVING : 0));
    if (p.downed) {
      out.byte(positive(p.downed.bleedOut, BLEED_UNITS));
      out.byte(units(p.downed.revive, SHARE_UNITS));
    }
    if (p.reviving !== null) out.byte(units(p.reviving, SHARE_UNITS));
  }
  return out.take();
}

function readPlayer(r: Reader): PlayerOutput {
  const flags = r.byte();
  const id = readValue(r) as string;
  const team = r.varuint();
  const position: [number, number, number] = [r.varint() / MM, r.varint() / MM, r.varint() / MM];
  const velocity: [number, number, number] = [r.varint() / CM, r.varint() / CM, r.varint() / CM];
  const yaw = (((r.byte() << 8) | r.byte()) * TAU) / YAW_UNITS;
  const pitch = r.varint() / PITCH_UNITS;
  const movement = readValue(r) as PlayerOutput['movement'];
  const stance = readValue(r) as PlayerOutput['stance'];
  const eyeHeight = r.varuint() / MM;
  const health = r.varuint() / 10;
  const weaponId = readValue(r) as PlayerOutput['weapon']['id'];
  const slot = r.varuint();
  const action = readValue(r) as PlayerOutput['weapon']['action'];
  const actionTime = r.varuint() / MM;
  const ammo = r.varuint();
  const ads = r.varuint() / CM;
  const spread = r.varuint() / CM;
  const shotIndex = r.varuint();
  const loadout = readValue(r) as PlayerOutput['loadout'];
  const grenades = r.varuint();
  const mantle = flags & HAS_MANTLE ? (readValue(r) as PlayerOutput['mantle']) : null;
  const reload = flags & HAS_RELOAD ? (readValue(r) as PlayerOutput['weapon']['reload']) : null;
  const landing = flags & HAS_LANDING ? { fallHeight: r.float(), damage: r.float() } : null;
  const grenade = flags & HAS_GRENADE ? { phase: readValue(r) as 'cook' | 'throw', time: r.float() } : null;
  const reviveState = flags & HAS_REVIVE_STATE ? r.byte() : 0;
  const downed = reviveState & IS_DOWNED ? { bleedOut: r.byte() / BLEED_UNITS, revive: r.byte() / SHARE_UNITS } : null;
  const reviving = reviveState & IS_REVIVING ? r.byte() / SHARE_UNITS : null;
  return {
    id,
    team,
    kind: flags & IS_DUMMY ? 'dummy' : 'player',
    position,
    velocity,
    yaw,
    pitch,
    movement,
    mantle,
    stance,
    eyeHeight,
    health,
    alive: (flags & ALIVE) !== 0,
    landing,
    // Scope sway only moves your own view.
    weapon: { id: weaponId, slot, action, actionTime, reload, ammo, ads, spread, canFire: (flags & CAN_FIRE) !== 0, shotIndex, sway: [0, 0] },
    loadout,
    grenades,
    grenade,
    downed,
    reviving,
  };
}

/** An event with its stamp; only drawn and heard, so its fractions needn't be exact. */
export function packEvent(stamped: StampedEvent): Uint8Array {
  out.varuint(stamped.tick);
  out.varuint(stamped.index);
  writeValue(stamped.event, true);
  return out.take();
}

export function packGrenades(grenades: readonly GrenadeOutput[]): Uint8Array {
  writeValue(grenades, true);
  return out.take();
}

/** A snapshot's parts, each already packed: the same for many clients, and packed only once a tick. */
export interface SnapshotParts {
  readonly tick: number;
  readonly ack: number;
  /** The client's own state, or null while not in the simulation. */
  readonly self: Uint8Array | null;
  readonly players: readonly Uint8Array[];
  /** Seats the client should keep drawing from what it last got (see `WireSnapshot.held`). */
  readonly held: readonly string[];
  readonly events: readonly Uint8Array[];
  readonly grenades: Uint8Array;
  /** One entry per {@link STICKY_FIELDS}; null leaves it out. */
  readonly sticky: readonly (Uint8Array | null)[];
}

/** Puts a client's snapshot together. */
export function joinSnapshot(parts: SnapshotParts): Uint8Array {
  let flags = parts.self ? HAS_SELF : 0;
  parts.sticky.forEach((field, i) => {
    if (field) flags |= FIRST_STICKY_FLAG << i;
  });
  out.byte(flags);
  out.varuint(parts.tick);
  out.varuint(parts.ack);
  if (parts.self) out.bytes(parts.self);
  out.varuint(parts.players.length);
  for (const player of parts.players) out.bytes(player);
  out.varuint(parts.held.length);
  for (const id of parts.held) writeString(id);
  out.varuint(parts.events.length);
  for (const event of parts.events) out.bytes(event);
  out.bytes(parts.grenades);
  for (const field of parts.sticky) if (field) out.bytes(field);
  return out.take();
}

/** A whole snapshot in one go. */
export function encodeSnapshot(snapshot: WireSnapshot): Uint8Array {
  return joinSnapshot({
    tick: snapshot.tick,
    ack: snapshot.ack,
    self: snapshot.self ? packValue(snapshot.self) : null,
    players: snapshot.players.map(packPlayer),
    held: snapshot.held ?? [],
    events: snapshot.events.map(packEvent),
    grenades: packGrenades(snapshot.grenades),
    sticky: STICKY_FIELDS.map((field) => (snapshot[field] === undefined ? null : packValue(snapshot[field]))),
  });
}

/** Reads a snapshot. Throws on a frame that is cut short or not a snapshot. */
export function decodeSnapshot(bytes: Uint8Array): WireSnapshot {
  const r = new Reader(bytes);
  const flags = r.byte();
  const tick = r.varuint();
  const ack = r.varuint();
  const self = flags & HAS_SELF ? (readValue(r) as WireSnapshot['self']) : null;
  const players: PlayerOutput[] = [];
  for (let n = r.varuint(); n > 0; n--) players.push(readPlayer(r));
  const held: string[] = [];
  for (let n = r.varuint(); n > 0; n--) held.push(readValue(r) as string);
  const events: StampedEvent[] = [];
  for (let n = r.varuint(); n > 0; n--) {
    const eventTick = r.varuint();
    const index = r.varuint();
    events.push({ tick: eventTick, index, event: readValue(r) as StampedEvent['event'] });
  }
  const grenades = readValue(r) as readonly GrenadeOutput[];
  const snapshot: Record<string, unknown> = { t: 'snap', tick, ack, self, players, events, grenades };
  if (held.length > 0) snapshot['held'] = held;
  STICKY_FIELDS.forEach((field, i) => {
    if (flags & (FIRST_STICKY_FLAG << i)) snapshot[field] = readValue(r);
  });
  return snapshot as unknown as WireSnapshot;
}
