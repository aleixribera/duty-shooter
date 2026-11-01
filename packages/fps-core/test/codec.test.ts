import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type Connection, type ServerMessage, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { decodeSnapshot, encodeSnapshot, MOST_WORDS, packValue, unpackValue, WORDS } from '../src/net/codec';
import { decodeServer, type WireSnapshot } from '../src/net/protocol';
import type { PlayerOutput } from '../src/simulation';
import { Button, usercmd } from '../src/usercmd';
import { FLOOR, ticks } from './support/movement';

const PAIR: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -12], yaw: Math.PI },
];

const player = (over: Partial<PlayerOutput> = {}): PlayerOutput => ({
  id: 'p7',
  team: 2,
  kind: 'player',
  position: [12.3456, -1.5, 987.125],
  velocity: [6.25, -9.81, 0],
  yaw: 1.2345,
  pitch: -0.4321,
  movement: 'tacticalSprint',
  mantle: 'waist',
  stance: 'crouch',
  eyeHeight: 1.234,
  health: 57.3,
  alive: true,
  landing: { fallHeight: 3.5, damage: 12 },
  weapon: { id: 'm4a1', slot: 1, action: 'reload', actionTime: 1.234, reload: 'empty', ammo: 17, ads: 0.25, spread: 1.75, canFire: false, shotIndex: 4, sway: [0, 0] },
  loadout: { primary: 'smg', secondary: 'pistol', grenade: 'frag' },
  grenades: 1,
  grenade: { phase: 'cook', time: 0.5 },
  ...over,
});

const snap = (over: Partial<WireSnapshot> = {}): WireSnapshot => ({ t: 'snap', tick: 54_321, ack: 321, self: null, players: [], events: [], grenades: [], ...over });

describe('packed values', () => {
  it.each([
    ['a null', null],
    ['booleans', [true, false]],
    ['whole numbers of every size', [0, 1, -1, 31, 32, 300, -70_000, 2 ** 40, 2 ** 53]],
    ['exact doubles', [0.1, 1 / 3, -123.456789012345, 1e-300]],
    ['strings with accents, and strings the dictionary has', ['Àlex 日本', 'shooter', '']],
    ['nested data', { a: [{ b: null, position: [1.5, 2, 3] }], move: { grounded: true } }],
  ])('keeps %s exactly', (_name, value) => {
    expect(unpackValue(packValue(value))).toEqual(value);
  });

  it('drops an undefined field, as JSON does', () => {
    expect(unpackValue(packValue({ a: 1, b: undefined }))).toEqual({ a: 1 });
  });

  it('stands a number in for a float that is not worth exactness, within a tenth of a millimetre', () => {
    const [x] = unpackValue(packValue([987.12345678], { lossy: true })) as [number];
    expect(x).toBeCloseTo(987.12345678, 3);
    expect(packValue([987.12345678], { lossy: true }).length).toBeLessThan(packValue([987.12345678]).length);
  });

  it('spends one byte on a dictionary word, so state without numbers costs little', () => {
    expect(packValue('shooter').length).toBe(1);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.length).toBeLessThanOrEqual(MOST_WORDS);
  });
});

describe('a snapshot on the wire', () => {
  it('survives the trip with everything drawn at the precision the game used', () => {
    const decoded = decodeSnapshot(encodeSnapshot(snap({ players: [player()] })));
    const p = decoded.players[0]!;
    expect({ ...p, position: 0, velocity: 0, yaw: 0, pitch: 0, eyeHeight: 0, health: 0, landing: 0, grenade: 0, weapon: 0 }).toEqual({ ...player(), position: 0, velocity: 0, yaw: 0, pitch: 0, eyeHeight: 0, health: 0, landing: 0, grenade: 0, weapon: 0 });
    expect(p.position[0]).toBeCloseTo(12.3456, 2);
    expect(p.position[1]).toBe(-1.5);
    expect(p.position[2]).toBe(987.125);
    expect(p.velocity).toEqual([6.25, -9.81, 0]);
    expect(p.yaw).toBeCloseTo(1.2345, 3);
    expect(p.pitch).toBeCloseTo(-0.4321, 3);
    expect(p.eyeHeight).toBe(1.234);
    expect(p.health).toBeCloseTo(57.3, 1);
    expect(p.landing).toEqual({ fallHeight: 3.5, damage: 12 });
    expect(p.grenade).toEqual({ phase: 'cook', time: 0.5 });
    expect(p.weapon).toEqual(player().weapon);
    expect(decoded).toMatchObject({ t: 'snap', tick: 54_321, ack: 321, self: null, events: [], grenades: [] });
  });

  it('turns a yaw that has spun many times into the same heading', () => {
    const p = decodeSnapshot(encodeSnapshot(snap({ players: [player({ yaw: 1000.5 })] }))).players[0]!;
    expect(Math.cos(p.yaw)).toBeCloseTo(Math.cos(1000.5), 3);
    expect(Math.sin(p.yaw)).toBeCloseTo(Math.sin(1000.5), 3);
  });

  it('leaves a sticky field out when the server did', () => {
    const decoded = decodeSnapshot(encodeSnapshot(snap({ names: { p1: 'alice' }, popped: ['head1'] })));
    expect(decoded.names).toEqual({ p1: 'alice' });
    expect(decoded.popped).toEqual(['head1']);
    expect('scores' in decoded).toBe(false);
    expect('match' in decoded).toBe(false);
  });

  it('copes with a sequence number a hostile client made huge', () => {
    expect(decodeSnapshot(encodeSnapshot(snap({ ack: 2 ** 53 }))).ack).toBe(2 ** 53);
  });

  it('reads as nothing, rather than throwing, when it is cut short', () => {
    const bytes = encodeSnapshot(snap({ players: [player()], names: { p1: 'alice' } }));
    for (let length = 0; length < bytes.length; length++) expect(decodeServer(bytes.subarray(0, length))).toBeNull();
  });
});

describe('a real match on the wire', () => {
  /** Everything one client's connection receives from a short fight. */
  function fight() {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: PAIR, mode: 'ffa', latency: 0.02, passphrase: '' });
    const received: ServerMessage[] = [];
    const frames: (string | Uint8Array)[] = [];
    const raw = m.network.connect();
    const tapped: Connection = {
      send: (data) => raw.send(data),
      close: (reason) => raw.close(reason),
      get open() {
        return raw.open;
      },
      get reliable() {
        return raw.reliable === true;
      },
      onClose: (handler) => raw.onClose(handler),
      onMessage: (handler) =>
        raw.onMessage((data) => {
          frames.push(data);
          const message = decodeServer(data);
          if (message) received.push(message);
          handler(data);
        }),
    };
    m.join('alice', { connection: tapped });
    const bob = m.join('bob');
    m.run(ticks(0.5));
    const aim = { yaw: 0, buttons: Button.Fire };
    m.run(ticks(2), (tick) => ({ alice: usercmd({ ...aim, ...(tick % 6 === 0 ? { firePresses: [0.5] } : {}) }), bob: usercmd({ forward: 1 }) }));
    return { received, frames, bob };
  }

  it('sends snapshots as binary frames and everything else as text an old page can read', () => {
    const { received, frames } = fight();
    const texts = frames.filter((f) => typeof f === 'string');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect((JSON.parse(text) as { t: string }).t).not.toBe('snap');
    expect(frames.filter((f) => typeof f !== 'string').length).toBeGreaterThan(100);
    expect(received.some((m) => m.t === 'welcome')).toBe(true);
    expect(received.filter((m) => m.t === 'snap').length).toBeGreaterThan(100);
  });

  it('gives the client an exact copy of its own state, so reconciling moves nothing', () => {
    const { bob } = fight();
    // A correction is what reconciling had to move: a rounded state would show one every snapshot.
    expect(Math.hypot(...bob.client.correction)).toBeLessThan(1e-3);
    expect(bob.client.snapshot?.self?.move.position).toBeDefined();
  });

  it('comes to under a quarter of what the same snapshot costs as JSON', () => {
    const { received, frames } = fight();
    const binary = frames.filter((f) => typeof f !== 'string').slice(-60);
    const snaps = received.filter((m) => m.t === 'snap').slice(-60);
    const bytes = binary.reduce((n, f) => n + f.length, 0);
    const json = snaps.reduce((n, s) => n + JSON.stringify(s).length, 0);
    expect(bytes).toBeLessThan(json / 4);
  });

  it('still says protocol to a page from before the bump', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: PAIR, mode: 'ffa', passphrase: '' });
    const old = m.network.connect();
    const frames: (string | Uint8Array)[] = [];
    old.onMessage((data) => frames.push(data));
    old.send(JSON.stringify({ t: 'join', name: 'old', passphrase: '', protocol: PROTOCOL_VERSION - 1 }));
    m.run(5);
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0] as string)).toEqual({ t: 'reject', reason: 'protocol' });
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(13);
  });
});
