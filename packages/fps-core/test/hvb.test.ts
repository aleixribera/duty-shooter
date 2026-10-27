import { describe, expect, it } from 'vitest';
import { buildNavGraph, createWorld, hvbBots, type LobbyEvent, type ModeId, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SPREAD: readonly SpawnPoint[] = [-25, -15, -5, 5, 15, 25].map((x) => ({ position: [x, 0, 0], yaw: 0 }));
const BLUE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
const ORANGE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, -20], yaw: 0 }));
const nav = buildNavGraph(createWorld([FLOOR]), {
  area: [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ],
});

/** A match with humans vs bots on from the start (a bot match, or a server set up that way). */
function match(mode: ModeId, options: { maxPlayers?: number; onLog?: (e: LobbyEvent) => void; lobby?: boolean } = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE, ORANGE], mode, latency: 0.03, bots: { nav, perTeam: 3 }, hvb: true, reconnectGrace: 0, ...options });
}

function join(m: NetworkedMatch, name: string): NetworkedClient {
  const c = m.join(name);
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

const fighters = (m: NetworkedMatch) => m.server.latest.players.filter((p) => p.kind === 'player');
const isBot = (m: NetworkedMatch, id: string) => m.server.bots.has(id);
const sides = (m: NetworkedMatch) => ({
  people: fighters(m).filter((p) => !isBot(m, p.id)).map((p) => p.team),
  bots: fighters(m).filter((p) => isBot(m, p.id)).map((p) => p.team),
});

describe('humans vs bots', () => {
  it('sizes the bot team for 1 to 12 people in a 12-seat lobby: two more than them, at least four, at most six', () => {
    const bots = Array.from({ length: 12 }, (_, i) => hvbBots(i + 1, 6, 12));
    expect(bots).toEqual([4, 4, 5, 6, 6, 6, 5, 4, 3, 2, 1, 0]);
  });

  it.each(['tdm', 'outposts', 'charge'] as const)('puts every person on one team in %s, against at least four bots', (mode) => {
    const m = match(mode);
    join(m, 'alice');
    expect(sides(m)).toEqual({ people: [1], bots: [2, 2, 2, 2] });
    join(m, 'bob');
    join(m, 'carol');
    // Two more bots than people.
    expect(sides(m)).toEqual({ people: [1, 1, 1], bots: [2, 2, 2, 2, 2] });
    expect(m.server.status()).toMatchObject({ hvb: true, players: 3, bots: 5 });
  });

  it('sends a bot to the other side for each person who joins mid-match, and takes it back when they leave', () => {
    const m = match('tdm');
    join(m, 'alice');
    join(m, 'bob');
    join(m, 'carol');
    const dan = join(m, 'dan');
    expect(sides(m).bots).toHaveLength(6);
    dan.client.close();
    m.run(ticks(0.5));
    expect(sides(m)).toEqual({ people: [1, 1, 1], bots: [2, 2, 2, 2, 2] });
  });

  it('caps the bots at six, and at the seats the people leave free', () => {
    const m = match('tdm', { maxPlayers: 12 });
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) join(m, n);
    expect(sides(m).bots).toHaveLength(6);
    for (const n of ['g', 'h']) join(m, n);
    expect(sides(m).bots).toHaveLength(4);
    expect(fighters(m)).toHaveLength(12);
  });

  it('leaves free-for-all as it was: no sides to take', () => {
    const m = match('ffa');
    join(m, 'alice');
    expect(fighters(m)).toHaveLength(6);
    expect(m.server.status().hvb).toBe(false);
  });

  it('logs the matches it is on for', () => {
    const log: LobbyEvent[] = [];
    const m = match('tdm', { onLog: (e) => log.push(e) });
    join(m, 'alice');
    expect(log.find((e) => e.event === 'matchStart')).toMatchObject({ mode: 'tdm', hvb: true });
  });
});

describe('humans vs bots in the lobby', () => {
  it('is the host\'s choice, for the match they start', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE, ORANGE], mode: 'tdm', latency: 0.03, bots: { nav, perTeam: 3 }, reconnectGrace: 0, lobby: true });
    const alice = m.join('alice');
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby?.hvb).toBe(false);
    alice.client.setLobby({ mode: 'outposts', hvb: true });
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby?.hvb).toBe(true);
    alice.client.startMatch();
    m.run(ticks(1));
    expect(sides(m)).toEqual({ people: [1], bots: [2, 2, 2, 2] });
    expect(m.server.status()).toMatchObject({ mode: 'outposts', hvb: true });
  });

  it('goes back to mixed teams once the lobby empties', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE, ORANGE], mode: 'tdm', latency: 0.03, bots: { nav, perTeam: 3 }, reconnectGrace: 0, lobby: true });
    const alice = m.join('alice');
    m.run(ticks(0.5));
    alice.client.setLobby({ hvb: true });
    m.run(ticks(0.5));
    expect(alice.client.match?.lobby?.hvb).toBe(true);
    alice.client.close();
    m.run(ticks(0.5));
    const bob = m.join('bob');
    m.run(ticks(0.5));
    expect(bob.client.match?.lobby?.hvb).toBe(false);
  });
});
