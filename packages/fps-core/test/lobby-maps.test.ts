import { describe, expect, it } from 'vitest';
import { box, buildNavGraph, createWorld, type LobbyEvent, type LobbyPick, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SPREAD: readonly SpawnPoint[] = [-6, 0, 6].map((x) => ({ position: [x, 0, 0], yaw: 0 }));
const BLUE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
const ORANGE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, -20], yaw: 0 }));
const area = (x: number) => ({
  area: [
    [x - 30, -30],
    [x + 30, -30],
    [x + 30, 30],
    [x - 30, 30],
  ] as [number, number][],
});
const nav = buildNavGraph(createWorld([FLOOR]), area(0));

/** A second map far off to the east: its own floor, spawns and nav graph, a crate standing on it. */
const YARD_FLOOR = box({ min: [900, -1, -100], max: [1100, 0, 100], material: 'gravel' });
const CRATE = box({ min: [1000, 0, 10], max: [1001, 1, 11], material: 'wood' });
const yardWorld = createWorld([YARD_FLOOR, CRATE]);
const shift = (points: readonly SpawnPoint[]) => points.map((s) => ({ ...s, position: [s.position[0] + 1000, s.position[1], s.position[2]] as const }));
const yard = { id: 'yard', world: yardWorld, spawns: shift(SPREAD), teamSpawns: [shift(BLUE), shift(ORANGE)], nav: buildNavGraph(yardWorld, area(1000)) };

function lobby(onLog?: (e: LobbyEvent) => void): NetworkedMatch {
  return createNetworkedMatch({
    solids: [FLOOR],
    spawns: SPREAD,
    teamSpawns: [BLUE, ORANGE],
    mode: 'tdm',
    map: 'town',
    maps: [yard],
    lobby: true,
    modes: { tdm: { timeLimit: 2 } },
    intermission: { nuke: 1, vote: 1 },
    latency: 0.03,
    bots: { nav, perTeam: 2 },
    reconnectGrace: 0,
    ...(onLog ? { onLog } : {}),
  });
}

function join(m: NetworkedMatch, name: string): NetworkedClient {
  const c = m.join(name);
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

const fighters = (m: NetworkedMatch) => m.server.latest.players.filter((p) => p.kind === 'player');

describe('the lobby’s maps', () => {
  it('offers every map the server holds, the one played first', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby).toMatchObject({ maps: ['town', 'yard'], map: 'town' });
  });

  it('plays the next match on the map the host picks, with the bots finding their way on it', () => {
    const log: LobbyEvent[] = [];
    const m = lobby((e) => log.push(e));
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    // Only the host picks, and only maps the server holds.
    bob.client.setLobby({ map: 'yard' });
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby?.map).toBe('town');
    alice.client.setLobby({ map: 'nowhere' });
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby?.map).toBe('town');
    alice.client.setLobby({ map: 'yard' });
    m.run(ticks(0.5));
    expect(bob.client.match?.lobby?.map).toBe('yard');

    alice.client.startMatch();
    m.run(ticks(1));
    expect(m.server.simulation.world).toBe(yardWorld);
    expect(m.server.status().map).toBe('yard');
    expect(alice.client.match?.map).toBe('yard');
    expect(log.filter((e) => e.event === 'matchStart').at(-1)).toMatchObject({ map: 'yard' });
    // Everyone, people and bots, spawned on the yard's floor.
    expect(fighters(m)).toHaveLength(4);
    for (const p of fighters(m)) expect(p.position[0]).toBeGreaterThan(900);
    // The bots walk the yard's graph: a few seconds on, they are still on its floor.
    m.run(ticks(1.5));
    for (const p of fighters(m)) expect(p.position[0]).toBeGreaterThan(900);
  });

  it('goes back to the first map when the host picks it for a later match', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    alice.client.setLobby({ map: 'yard' });
    m.run(ticks(0.5));
    alice.client.startMatch();
    m.run(ticks(1));
    expect(m.server.status().map).toBe('yard');
    // The match runs out (2 s), then the nuke and the scoreboard: back in the lobby, the yard still picked.
    m.run(ticks(5));
    expect(m.server.phase).toBe('lobby');
    expect(alice.client.match?.lobby?.map).toBe('yard');
    alice.client.setLobby({ map: 'town' });
    m.run(ticks(0.5));
    alice.client.startMatch();
    m.run(ticks(1));
    expect(m.server.status().map).toBe('town');
    expect(m.server.latest.players.find((p) => p.id === alice.client.id)!.position[0]).toBeLessThan(100);
  });
});

describe('the lobby’s team sizes', () => {
  /** The town plays 2v2 in TDM, the yard 4v4; the server's own default (perTeam 3) covers the rest. */
  function sized(): NetworkedMatch {
    return createNetworkedMatch({
      solids: [FLOOR],
      spawns: SPREAD,
      teamSpawns: [BLUE, ORANGE],
      mode: 'tdm',
      map: 'town',
      teamSize: { tdm: 2 },
      maps: [{ ...yard, teamSize: { tdm: 4, outposts: 5 } }],
      lobby: true,
      modes: { tdm: { timeLimit: 2 } },
      latency: 0.03,
      bots: { nav, perTeam: 3 },
      reconnectGrace: 0,
    });
  }
  const pick = (m: NetworkedMatch, c: NetworkedClient, p: LobbyPick) => {
    c.client.setLobby(p);
    m.run(ticks(0.5));
    return c.client.match!.lobby!;
  };

  it('fills to the picked map’s size for the mode, the server’s default where it has none', () => {
    const m = sized();
    const alice = join(m, 'alice');
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby).toMatchObject({ bots: 2, custom: false });
    expect(pick(m, alice, { map: 'yard' })).toMatchObject({ bots: 4 });
    expect(pick(m, alice, { mode: 'outposts' })).toMatchObject({ bots: 5 });
    expect(pick(m, alice, { mode: 'ffa' })).toMatchObject({ bots: 3 });
  });

  it('keeps the host’s own size until the map or mode changes, and switches bots off and back on', () => {
    const m = sized();
    const alice = join(m, 'alice');
    expect(pick(m, alice, { bots: 1 })).toMatchObject({ bots: 1, custom: true });
    expect(pick(m, alice, { hvb: false })).toMatchObject({ bots: 1, custom: true });
    expect(pick(m, alice, { map: 'yard' })).toMatchObject({ bots: 4, custom: false });
    expect(pick(m, alice, { bots: 6 })).toMatchObject({ bots: 6, custom: true });
    expect(pick(m, alice, { mode: 'outposts' })).toMatchObject({ bots: 5, custom: false });
    expect(pick(m, alice, { fill: false })).toMatchObject({ bots: 0, custom: false });
    // Off stays off across picks; on again is the map's size.
    expect(pick(m, alice, { map: 'town' })).toMatchObject({ bots: 0 });
    expect(pick(m, alice, { fill: true, mode: 'tdm' })).toMatchObject({ bots: 2, custom: false });
  });

  it('starts the match at the map’s size', () => {
    const m = sized();
    const alice = join(m, 'alice');
    pick(m, alice, { map: 'yard' });
    alice.client.startMatch();
    m.run(ticks(1));
    expect(fighters(m)).toHaveLength(8);
    expect(m.server.status()).toMatchObject({ map: 'yard', botsPerTeam: 4 });
  });
});
