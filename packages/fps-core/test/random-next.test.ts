import { describe, expect, it } from 'vitest';
import { box, buildNavGraph, createWorld, randomNextMatch, shuffledSides, type ModeId, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

// Ticket 115: at a match's end a random next match is on (PLAN item 9b: by default), and starts in place of the lobby unless the host turns it off.

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

  it('is on at every match’s end and starts at the scoreboard’s end with no lobby between, on another map and mode, the sides dealt afresh', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    playToEnd(m, alice);
    m.run(ticks(0.2));
    // On by default, and everyone sees it on.
    expect(alice.client.match?.lobby?.random).toBe(true);
    expect(bob.client.match?.lobby?.random).toBe(true);
    // Only the host may turn it off.
    bob.client.randomNext(false);
    m.run(ticks(0.2));
    expect(alice.client.match?.lobby?.random).toBe(true);
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
    // While a match plays, nothing is asked; it comes on again at the match's end.
    expect(bob.client.match?.lobby?.random).toBeUndefined();
    // Two people, a side each; everyone spawned on the yard.
    const team = (c: NetworkedClient) => m.server.latest.players.find((p) => p.id === c.client.id)!.team;
    expect(team(alice)).not.toBe(team(bob));
    for (const p of m.server.latest.players.filter((p) => p.kind === 'player')) expect(p.position[0]).toBeGreaterThan(900);
    for (let i = 0; i < ticks(4) && m.server.phase === 'playing'; i++) m.step();
    expect(m.server.phase).toBe('nuke');
    m.run(ticks(0.2));
    expect(bob.client.match?.lobby?.random).toBe(true);
  });

  it('turned off by the host, the lobby comes as usual; turned on again, it starts', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    playToEnd(m, alice);
    alice.client.randomNext(false);
    m.run(ticks(0.2));
    // Everyone sees it off.
    expect(bob.client.match?.lobby?.random).toBeUndefined();
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.status().map).toBe('town');
    // The next match's end has it on again; off and back on, it starts.
    playToEnd(m, alice);
    alice.client.randomNext(false);
    m.run(ticks(0.2));
    alice.client.randomNext(true);
    for (let i = 0; i < ticks(3) && m.server.phase !== 'playing'; i++) m.step();
    expect(m.server.phase).toBe('playing');
    expect(m.server.status().map).toBe('yard');
  });

  it('stays with the match when the host leaves: the next host can turn it off', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    playToEnd(m, alice);
    alice.client.close();
    m.run(ticks(0.3));
    expect(m.server.host).toBe(bob.client.id);
    expect(bob.client.match?.lobby?.random).toBe(true);
    bob.client.randomNext(false);
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.status().map).toBe('town');
  });

  it('starts nothing on a server everyone has left: the lobby comes, with it off', () => {
    const m = lobby();
    const alice = join(m, 'alice');
    playToEnd(m, alice);
    alice.client.close();
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.status().map).toBe('town');
    const bob = join(m, 'bob');
    m.run(ticks(0.2));
    expect(bob.client.match?.lobby?.random).toBeUndefined();
  });

  it('is left to the page on a server of one map (a Bot Match): the lobby comes, still on', () => {
    const m = lobby([]);
    const alice = join(m, 'alice');
    playToEnd(m, alice);
    m.run(ticks(3));
    expect(m.server.phase).toBe('lobby');
    expect(alice.client.match?.lobby?.random).toBe(true);
  });
});
