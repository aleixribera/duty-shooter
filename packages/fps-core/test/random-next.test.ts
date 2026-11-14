import { describe, expect, it } from 'vitest';
import { box, buildNavGraph, createWorld, randomNextMatch, shuffledSides, type ModeId, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

// Ticket 115: at a match's end the host may ask for a random next match, which starts in place of the lobby.

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
const YARD_FLOOR = box({ min: [900, -1, -100], max: [1100, 0, 100], material: 'gravel' });
const yardWorld = createWorld([YARD_FLOOR]);
const shift = (points: readonly SpawnPoint[]) => points.map((s) => ({ ...s, position: [s.position[0] + 1000, s.position[1], s.position[2]] as const }));
const yard = { id: 'yard', world: yardWorld, spawns: shift(SPREAD), teamSpawns: [shift(BLUE), shift(ORANGE)], nav: buildNavGraph(yardWorld, area(1000)) };

/** A lobby server on the town and the yard, matches of 2 s, a 1 s nuke and a 1 s scoreboard; `random` of 0 picks the first choice. */
function lobby(maps = [yard], random: () => number = () => 0): NetworkedMatch {
  return createNetworkedMatch({
    solids: [FLOOR],
    spawns: SPREAD,
    teamSpawns: [BLUE, ORANGE],
    mode: 'ffa',
    map: 'town',
    maps,
    lobby: true,
    modes: { tdm: { timeLimit: 2 }, ffa: { timeLimit: 2 } },
    intermission: { nuke: 1, vote: 1 },
    latency: 0.03,
    bots: { nav, perTeam: 1 },
    reconnectGrace: 0,
    random,
  });
}

function join(m: NetworkedMatch, name: string): NetworkedClient {
  const c = m.join(name);
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

/** Plays the host's free-for-all on the town until its end. */
function playToEnd(m: NetworkedMatch, host: NetworkedClient): void {
  host.client.setLobby({ mode: 'ffa' });
  m.run(ticks(0.3));
  host.client.startMatch();
  m.run(ticks(0.5));
  expect(m.server.phase).toBe('playing');
  for (let i = 0; i < ticks(4) && m.server.phase === 'playing'; i++) m.step();
  expect(m.server.phase).toBe('nuke');
}

describe('the random next match', () => {
  it('picks another map in another mode, each as likely, and falls back when there is none', () => {
    const choices = (['town', 'yard'] as const).flatMap((map) => (['tdm', 'ffa'] as ModeId[]).map((mode) => ({ map, mode })));
    const played = { map: 'town', mode: 'tdm' as ModeId };
    expect(randomNextMatch(played, choices, () => 0)).toEqual({ map: 'yard', mode: 'ffa' });
    expect(randomNextMatch(played, choices, () => 0.999)).toEqual({ map: 'yard', mode: 'ffa' });
    // One map: another mode on it.
    expect(randomNextMatch(played, choices.filter((c) => c.map === 'town'), () => 0)).toEqual({ map: 'town', mode: 'ffa' });
    expect(randomNextMatch(played, [], () => 0)).toBeNull();
  });

  it('deals sides at random, as even as they can be', () => {
    const people = ['a', 'b', 'c', 'd', 'e'];
    for (const r of [0, 0.3, 0.7, 0.99]) {
      const sides = shuffledSides(people, () => r);
      expect([...sides.keys()].sort()).toEqual(people);
      const blue = [...sides.values()].filter((t) => t === 1).length;
      expect(blue).toBe(3);
    }
    // Different luck, different sides.
    const a = shuffledSides(people, () => 0);
    const b = shuffledSides(people, () => 0.99);
    expect(people.some((p) => a.get(p) !== b.get(p))).toBe(true);
  });

  it('starts at the scoreboard’s end with no lobby between, on another map and mode, the sides dealt afresh', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    playToEnd(m, alice);
    // Only the host may ask.
    bob.client.randomNext(true);
    m.run(ticks(0.2));
    expect(alice.client.match?.lobby?.random).toBeUndefined();
    alice.client.randomNext(true);
    m.run(ticks(0.2));
    // Everyone sees it asked for.
    expect(bob.client.match?.lobby?.random).toBe(true);
    const phases = new Set<string>();
    for (let i = 0; i < ticks(3) && m.server.phase !== 'playing'; i++) {
      m.step();
      phases.add(m.server.phase);
    }
    expect(phases.has('lobby')).toBe(false);
    expect(m.server.phase).toBe('playing');
    expect(m.server.status()).toMatchObject({ map: 'yard', mode: 'tdm' });
    m.run(ticks(0.3));
    expect(bob.client.match).toMatchObject({ map: 'yard', mode: 'tdm', phase: 'playing' });
    // The ask is spent: the next match's end goes back to the lobby unless the host asks again.
    expect(bob.client.match?.lobby?.random).toBeUndefined();
    // Two people, a side each; everyone spawned on the yard.
    const team = (c: NetworkedClient) => m.server.latest.players.find((p) => p.id === c.client.id)!.team;
    expect(team(alice)).not.toBe(team(bob));
    for (const p of m.server.latest.players.filter((p) => p.kind === 'player')) expect(p.position[0]).toBeGreaterThan(900);
  });

  it('can be taken back: the lobby comes as usual', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    playToEnd(m, alice);
    alice.client.randomNext(true);
    m.run(ticks(0.2));
    alice.client.randomNext(false);
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.status().map).toBe('town');
  });

  it('goes with the host who asked: the next host is not taken to have asked', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    playToEnd(m, alice);
    alice.client.randomNext(true);
    m.run(ticks(0.2));
    alice.client.close();
    m.run(ticks(0.3));
    expect(m.server.host).toBe(bob.client.id);
    expect(bob.client.match?.lobby?.random).toBeUndefined();
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.status().map).toBe('town');
  });

  it('is asked of the page on a server of one map (a Bot Match): the lobby comes, still asking', () => {
    const m = lobby([]);
    const alice = join(m, 'alice');
    playToEnd(m, alice);
    alice.client.randomNext(true);
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(alice.client.match?.lobby?.random).toBe(true);
  });
});
