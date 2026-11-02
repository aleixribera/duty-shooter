import { describe, expect, it } from 'vitest';
import { box, buildNavGraph, createWorld, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

/**
 * The Battle Royale screen's lobby (ticket 12): a server that plays the team
 * modes on its own maps also holds a map that plays only Battle Royale, and a
 * Battle Royale joiner opens its lobby there. Squads are picked in the lobby.
 */
const SPREAD: readonly SpawnPoint[] = [-6, 0, 6].map((x) => ({ position: [x, 0, 0], yaw: 0 }));
const BLUE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
const ORANGE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, -20], yaw: 0 }));
const townNav = buildNavGraph(createWorld([FLOOR]), {
  area: [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ],
});

/** The island: open ground far to the east, wide enough for 60 seats in Squads 100 m apart. */
const X = 5000;
const ISLAND_GROUND = box({ min: [X - 300, -1, -300], max: [X + 300, 0, 300], material: 'grass' });
const islandWorld = createWorld([ISLAND_GROUND]);
const island = {
  id: 'island',
  world: islandWorld,
  spawns: [{ position: [X, 0, 0], yaw: 0 }] as const,
  nav: buildNavGraph(islandWorld, {
    area: [
      [X - 240, -240],
      [X + 240, -240],
      [X + 240, 240],
      [X - 240, 240],
    ],
    spacing: 4,
  }),
  teamSize: { 'battle-royale': 30 },
};

function server(): NetworkedMatch {
  return createNetworkedMatch({
    solids: [FLOOR],
    spawns: SPREAD,
    teamSpawns: [BLUE, ORANGE],
    mode: 'tdm',
    map: 'town',
    teamSize: { tdm: 2, ffa: 2 },
    maps: [island],
    lobby: true,
    modes: { tdm: { timeLimit: 2 }, battleRoyale: { seed: 5, timeLimit: 30 } },
    intermission: { nuke: 1, vote: 1 },
    latency: 0.03,
    bots: { nav: townNav, perTeam: 2, maxPerTeam: 6 },
    reconnectGrace: 0,
  });
}

function join(m: NetworkedMatch, name: string, mode?: 'battle-royale'): NetworkedClient {
  const c = m.join(name, mode ? { mode } : {});
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.client.match?.lobby); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

const lobbyOf = (c: NetworkedClient) => c.client.match!.lobby!;
const settle = (m: NetworkedMatch) => m.run(ticks(0.3));

describe('a Battle Royale lobby on a server of team modes', () => {
  it('opens on the map that plays it, for a Battle Royale joiner on an empty server', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    settle(m);
    expect(lobbyOf(alice)).toMatchObject({ mode: 'battle-royale', map: 'island', maps: ['island'] });
    expect(m.server.status()).toMatchObject({ mode: 'tdm', map: 'town', phase: 'lobby', lobbyMode: 'battle-royale', royale: true });
  });

  it('keeps a map that plays only Battle Royale out of the team modes’ lobby', () => {
    const m = server();
    const alice = join(m, 'alice');
    settle(m);
    expect(lobbyOf(alice)).toMatchObject({ mode: 'tdm', map: 'town', maps: ['town'] });
    // Nor can the host pick it.
    alice.client.setLobby({ map: 'island' });
    settle(m);
    expect(lobbyOf(alice).map).toBe('town');
  });

  it('goes back to the server’s own mode and map once everyone has left', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    settle(m);
    alice.client.close();
    settle(m);
    const bob = join(m, 'bob');
    settle(m);
    expect(lobbyOf(bob)).toMatchObject({ mode: 'tdm', map: 'town' });
  });

  it('starts a real Battle Royale on the island from the host’s Start', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    settle(m);
    alice.client.startMatch();
    m.run(ticks(0.5));
    expect(m.server.phase).toBe('playing');
    expect(m.server.status()).toMatchObject({ mode: 'battle-royale', map: 'island' });
    expect(m.server.latest.players.filter((p) => p.kind === 'player')).toHaveLength(60);
  });
});

describe('Squads picked in the lobby', () => {
  it('lets only the host pick Solos, Duos or Trios', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    const bob = join(m, 'bob');
    settle(m);
    expect(lobbyOf(alice).squadSize).toBe(1);
    bob.client.setLobby({ squads: 3 });
    settle(m);
    expect(lobbyOf(alice).squadSize).toBe(1);
    alice.client.setLobby({ squads: 3 });
    settle(m);
    expect(lobbyOf(bob).squadSize).toBe(3);
  });

  it('puts each person in a Squad of their own in Solos', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    const bob = join(m, 'bob');
    settle(m);
    const squads = lobbyOf(alice).squads;
    expect(squads[alice.client.id!]).toBeDefined();
    expect(squads[bob.client.id!]).not.toBe(squads[alice.client.id!]);
  });

  it('puts a friend arriving in Duos or Trios in a Squad with room beside people already there', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    alice.client.setLobby({ squads: 2 });
    settle(m);
    const bob = join(m, 'bob');
    const carol = join(m, 'carol');
    settle(m);
    const squads = lobbyOf(alice).squads;
    expect(squads[bob.client.id!]).toBe(squads[alice.client.id!]);
    // A Duo is full with two: the third goes to a Squad of their own.
    expect(squads[carol.client.id!]).not.toBe(squads[alice.client.id!]);
  });

  it('lets anyone move to a Squad with room, and not into a full one', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    alice.client.setLobby({ squads: 2 });
    settle(m);
    const bob = join(m, 'bob');
    const carol = join(m, 'carol');
    settle(m);
    const first = lobbyOf(alice).squads[alice.client.id!]!;
    carol.client.setSquad(first);
    settle(m);
    expect(lobbyOf(carol).squads[carol.client.id!]).not.toBe(first);
    bob.client.setSquad(9);
    settle(m);
    expect(lobbyOf(bob).squads[bob.client.id!]).toBe(9);
    carol.client.setSquad(first);
    settle(m);
    expect(lobbyOf(carol).squads[carol.client.id!]).toBe(first);
  });

  it('re-packs Squads that no longer fit when the size comes down', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    alice.client.setLobby({ squads: 3 });
    settle(m);
    join(m, 'bob');
    join(m, 'carol');
    settle(m);
    expect(new Set(Object.values(lobbyOf(alice).squads)).size).toBe(1);
    alice.client.setLobby({ squads: 2 });
    settle(m);
    const counts = new Map<number, number>();
    for (const s of Object.values(lobbyOf(alice).squads)) counts.set(s, (counts.get(s) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([1, 2]);
  });

  it('plays the Squads as picked, with bots filling the gaps and every other Squad', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    alice.client.setLobby({ squads: 3 });
    settle(m);
    const bob = join(m, 'bob');
    const carol = join(m, 'carol');
    settle(m);
    carol.client.setSquad(7);
    settle(m);
    alice.client.startMatch();
    m.run(ticks(0.5));
    const seats = m.server.latest.players.filter((p) => p.kind === 'player');
    expect(seats).toHaveLength(60);
    const team = (id: string | null) => seats.find((p) => p.id === id)!.team;
    expect(team(bob.client.id)).toBe(team(alice.client.id));
    expect(team(carol.client.id)).not.toBe(team(alice.client.id));
    const counts = new Map<number, number>();
    for (const p of seats) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
    expect(counts.size).toBe(20);
    expect([...counts.values()].every((n) => n === 3)).toBe(true);
  });

  it('keeps the Squads for the next match, back in the lobby', () => {
    const m = server();
    const alice = join(m, 'alice', 'battle-royale');
    alice.client.setLobby({ squads: 2 });
    settle(m);
    const bob = join(m, 'bob');
    settle(m);
    bob.client.setSquad(4);
    alice.client.setSquad(4);
    settle(m);
    alice.client.startMatch();
    for (let i = 0; i < ticks(60) && m.server.phase !== 'lobby'; i++) m.step();
    expect(m.server.phase).toBe('lobby');
    settle(m);
    expect(lobbyOf(alice)).toMatchObject({ mode: 'battle-royale', squadSize: 2 });
    expect(lobbyOf(alice).squads[alice.client.id!]).toBe(4);
    expect(lobbyOf(alice).squads[bob.client.id!]).toBe(4);
  });
});
