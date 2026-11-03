import { describe, expect, it } from 'vitest';
import { PREPARATION, box, decodeServer, type Connection, type NetProfile, type SpawnPoint, type WireData } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import type { WireSnapshot } from '../src/net/protocol';
import { ticks } from './support/movement';

// Ticket 58: in a Battle Royale, someone out while their Squad still fights may
// watch only their Squad; the surroundings of an enemy would let them call out
// where that enemy's Squad is. Once their whole Squad is out, anyone.

const GROUND = box({ min: [-900, -1, -900], max: [900, 0, 900], material: 'concrete' });
const TIERED: NetProfile = { snapshotEvery: 2, relevance: { near: 30, mid: 120, midEvery: 6, hearing: 200, heardTicks: 120 } };
const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];

function match(): NetworkedMatch {
  return createNetworkedMatch({
    solids: [GROUND],
    spawns: SPAWNS,
    mode: 'battle-royale',
    modes: { battleRoyale: { squadSize: 2, seed: 3 } },
    latency: 0.01,
    lobby: true,
    countdown: PREPARATION.seconds,
    net: TIERED,
    spawnProtection: 0,
    dummies: [{ id: 'far', team: 0, position: [610, 0, 8], dummy: {} }],
  });
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

/** Alice and Bob in one Squad, Carol and Dave each in another; Carol far off beside a dummy only she is near. */
function setup() {
  const m = match();
  const frames: WireSnapshot[] = [];
  const join = (name: string, connection?: Connection): NetworkedClient => {
    const c = m.join(name, connection ? { connection } : {});
    for (let i = 0; i < ticks(3) && c.client.status !== 'joined'; i++) m.step();
    expect(c.client.status).toBe('joined');
    return c;
  };
  const alice = join('alice', tap(m, frames));
  const bob = join('bob');
  const carol = join('carol');
  carol.client.setSquad(2);
  m.run(ticks(0.3));
  const dave = join('dave');
  dave.client.setSquad(3);
  m.run(ticks(0.3));
  alice.client.startMatch();
  m.run(ticks(0.3));
  for (const c of [alice, bob, carol, dave]) {
    c.client.loaded();
    c.client.ready();
  }
  m.run(ticks(PREPARATION.dive + 1));
  expect(m.server.matchStatus().countdownEnds).toBeNull();
  const id = (c: NetworkedClient) => c.client.id as never;
  const sim = m.server.simulation;
  const place = (c: NetworkedClient, x: number, z: number) => {
    const s = sim.playerState(id(c))!;
    sim.setPlayerState({ ...s, move: { ...s.move, position: [x, 0, z], velocity: [0, 0, 0] } });
  };
  place(alice, 0, 0);
  place(bob, 0, 4);
  place(carol, 600, 0);
  place(dave, -600, 0);
  const team = (c: NetworkedClient) => m.server.simulation.output().players.find((p) => p.id === c.client.id)?.team;
  expect(team(alice)).toBe(team(bob));
  expect(team(carol)).not.toBe(team(alice));
  expect(team(dave)).not.toBe(team(carol));
  const out = (c: NetworkedClient) => {
    const s = sim.playerState(id(c));
    if (s) sim.setPlayerState({ ...s, health: 0, diedAt: sim.time });
  };
  const sees = (from: number) => new Set(frames.slice(from).flatMap((f) => f.players.map((p) => p.id)));
  return { m, frames, alice, bob, carol, out, sees };
}

describe('watching in a Battle Royale', () => {
  it('while the Squad still fights, an enemy named to watch is refused', () => {
    const { m, frames, alice, carol, out, sees } = setup();
    out(alice);
    m.run(ticks(0.5));
    alice.client.watch(carol.client.id);
    m.run(ticks(0.5));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(false);
  });

  it('once the whole Squad is out, anyone left can be watched', () => {
    const { m, frames, alice, bob, carol, out, sees } = setup();
    out(alice);
    out(bob);
    m.run(ticks(0.5));
    alice.client.watch(carol.client.id);
    m.run(ticks(0.5));
    const from = frames.length;
    m.run(ticks(1));
    expect(sees(from).has('far')).toBe(true);
  });
});
