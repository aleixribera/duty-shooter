import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, decodeServer, type Connection, type NetProfile, type SpawnPoint, type WireData } from '@duty-shooter/fps-core';
import { box, createNetworkedMatch, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { decodeClient, encode, type WireSnapshot } from '../src/net/protocol';
import { ticks } from './support/movement';

// Ticket 32: a spectator is sent the watched player's surroundings, not those of where it fell.

const GROUND = box({ min: [-900, -1, -900], max: [900, 0, 900], material: 'concrete' });
const TIERED: NetProfile = { snapshotEvery: 2, relevance: { near: 30, mid: 120, midEvery: 6, hearing: 200, heardTicks: 120 } };
const at = (x: number, z = 0): SpawnPoint => ({ position: [x, 0, z], yaw: 0 });

function match(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [GROUND], spawns: [at(0), at(600)], mode: 'ffa', latency: 0.01, passphrase: '', net: TIERED, spawnProtection: 0, dummies: [{ id: 'far', team: 0, position: [610, 0, 8], dummy: {} }], ...options });
}

function tap(m: NetworkedMatch, frames: WireSnapshot[]): Connection {
  const raw = m.network.connect();
  return {
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
      raw.onMessage((data: WireData) => {
        const message = decodeServer(data);
        if (message?.t === 'snap') frames.push(message);
        handler(data);
      }),
  };
}

/** Alice near 0 and Bob near 600, with a dummy beside Bob that Alice can't see from where she stands. */
function setup(options: Partial<NetworkedMatchOptions> = {}) {
  const m = match(options);
  const frames: WireSnapshot[] = [];
  const alice = m.join('alice', { connection: tap(m, frames) });
  m.run(ticks(0.2));
  const bob = m.join('bob');
  m.run(ticks(0.5));
  const id = (c: { client: { id: string | null } }) => c.client.id as string;
  const kill = (who: string) => {
    const s = m.server.simulation.playerState(who as never);
    if (s) m.server.simulation.setPlayerState({ ...s, health: 0, diedAt: m.server.simulation.time });
  };
  const sees = (from: number) => new Set(frames.slice(from).flatMap((f) => f.players.map((p) => p.id)));
  return { m, frames, alice, bob, id, kill, sees };
}

describe('the watch message', () => {
  it('decodes a seat to watch, or none, and nothing else', () => {
    expect(decodeClient(encode({ t: 'watch', id: 'p4' }))).toEqual({ t: 'watch', id: 'p4' });
    expect(decodeClient(encode({ t: 'watch', id: null }))).toEqual({ t: 'watch', id: null });
    expect(decodeClient(encode({ t: 'watch', id: 7 } as never))).toBeNull();
    expect(decodeClient(encode({ t: 'watch', id: 'x'.repeat(80) }))).toBeNull();
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(18);
  });
});

describe('what a spectator is sent', () => {
  it('out of the fight and watching, the seats around the watched player', () => {
    const { m, alice, bob, id, kill, sees, frames } = setup();
    kill(id(alice));
    m.run(ticks(0.5));
    expect(sees(0).has('far')).toBe(false);
    alice.client.watch(id(bob));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(true);
  });

  it('back to its own surroundings once it stops watching', () => {
    const { m, alice, bob, id, kill, sees, frames } = setup();
    kill(id(alice));
    alice.client.watch(id(bob));
    m.run(ticks(0.8));
    alice.client.watch(null);
    m.run(ticks(0.3));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(false);
  });

  it('alive, it is sent its own surroundings whoever it names', () => {
    const { m, alice, bob, id, sees, frames } = setup();
    alice.client.watch(id(bob));
    m.run(ticks(0.5));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(false);
  });

  it('in a team mode, only a teammate can be watched', () => {
    const { m, alice, bob, id, kill, sees, frames } = setup({ mode: 'tdm', teamSpawns: [[at(0)], [at(600)]], maxPlayers: 4 });
    const teams = m.history.at(-1)?.players ?? [];
    expect(teams.find((p) => p.id === id(alice))?.team).not.toBe(teams.find((p) => p.id === id(bob))?.team);
    kill(id(alice));
    alice.client.watch(id(bob));
    m.run(ticks(0.5));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(false);
  });
});
