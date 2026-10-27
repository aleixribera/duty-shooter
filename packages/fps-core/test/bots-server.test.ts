import { describe, expect, it } from 'vitest';
import { anglesOf, buildNavGraph, createWorld, zoneCentre, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SPREAD: readonly SpawnPoint[] = [
  { position: [-25, 0, -25], yaw: 0 },
  { position: [25, 0, -25], yaw: 0 },
  { position: [-25, 0, 25], yaw: Math.PI },
  { position: [25, 0, 25], yaw: Math.PI },
];
const BLUE_HOUSE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
const ORANGE_HOUSE: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].map((x) => ({ position: [x, 0, -20], yaw: 0 }));
const nav = buildNavGraph(createWorld([FLOOR]), {
  area: [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ],
});

/** A team deathmatch that fills to 3v3 with bots (none with `bots: false`). */
function match(options: Omit<Partial<NetworkedMatchOptions>, 'bots'> & { bots?: NetworkedMatchOptions['bots'] | false } = {}): NetworkedMatch {
  const { bots = { nav, perTeam: 3 }, ...rest } = options;
  return createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE_HOUSE, ORANGE_HOUSE], mode: 'tdm', latency: 0.03, ...(bots ? { bots } : {}), ...rest });
}

/** Joins `name` and steps until it is in the game (fails after 3 s). */
function join(m: NetworkedMatch, name: string, options: { bots?: number } = {}): NetworkedClient {
  const c = m.join(name, options);
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

function leave(m: NetworkedMatch, c: NetworkedClient): void {
  c.client.close();
  m.run(ticks(0.5));
}

const fighters = (m: NetworkedMatch) => m.server.latest.players.filter((p) => p.kind === 'player');
const teamSizes = (m: NetworkedMatch) => [1, 2].map((t) => fighters(m).filter((p) => p.team === t).length);

describe('bot fill', () => {
  it('makes nobody wait: one person gets five bots for a 3v3, people take their seats, and the bots go when the last person leaves', () => {
    const m = match({ reconnectGrace: 0 });
    expect(m.server.bots.size).toBe(0);
    const alice = join(m, 'alice');
    expect(m.server.bots.size).toBe(5);
    expect(teamSizes(m)).toEqual([3, 3]);
    expect(m.server.status()).toMatchObject({ players: 1, bots: 5, botsPerTeam: 3, maxBotsPerTeam: 4 });

    const bob = join(m, 'bob');
    expect(m.server.bots.size).toBe(4);
    expect(teamSizes(m)).toEqual([3, 3]);
    expect(m.server.status().players).toBe(2);

    leave(m, alice);
    expect(m.server.bots.size).toBe(5);
    leave(m, bob);
    expect(m.server.bots.size).toBe(0);
    expect(fighters(m)).toEqual([]);
  });

  it('arms each bot with its own loadout', () => {
    const m = match();
    join(m, 'alice');
    m.run(ticks(1));
    for (const [id, seat] of m.server.bots) {
      const p = m.server.latest.players.find((x) => x.id === id)!;
      expect(p.weapon.id, seat.name).toBe(seat.bot.profile.loadout.primary);
      expect(p.grenades, seat.name).toBe(1);
    }
  });

  it('fills a free-for-all to six', () => {
    const m = match({ mode: 'ffa' });
    join(m, 'alice');
    expect(fighters(m)).toHaveLength(6);
  });

  it('marks bots in the scores, with names nobody else has', () => {
    const m = match();
    const alice = join(m, 'alice');
    const scores = alice.client.scores;
    expect(scores.filter((s) => s.bot)).toHaveLength(5);
    expect(scores.find((s) => s.id === alice.client.id)!.bot).toBeFalsy();
    expect(new Set(scores.map((s) => s.name)).size).toBe(6);
  });

  it("takes the first player's choice of bots per side, up to the cap, until the server empties", () => {
    const m = match({ reconnectGrace: 0 });
    const alice = join(m, 'alice', { bots: 1 });
    expect(m.server.bots.size).toBe(1);
    // Later joiners don't get a say.
    const bob = join(m, 'bob', { bots: 4 });
    expect(m.server.bots.size).toBe(0);
    leave(m, alice);
    leave(m, bob);

    join(m, 'carol', { bots: 9 });
    expect(m.server.status().botsPerTeam).toBe(4);
    expect(m.server.bots.size).toBe(7);
    leave(m, m.client('carol'));
    expect(m.server.status().botsPerTeam).toBe(3);

    join(m, 'dan', { bots: 0 });
    expect(m.server.bots.size).toBe(0);
  });

  it('has no bots without a nav graph to walk', () => {
    const m = match({ bots: false });
    join(m, 'alice', { bots: 3 });
    expect(m.server.bots.size).toBe(0);
    expect(m.server.status().maxBotsPerTeam).toBe(0);
  });

  it('leaves no seat for a bot that a person needs', () => {
    const m = match({ maxPlayers: 4 });
    join(m, 'alice');
    expect(fighters(m)).toHaveLength(4);
    for (const n of ['bob', 'carol', 'dan']) join(m, n);
    expect(m.server.bots.size).toBe(0);
    expect(m.server.status().players).toBe(4);
  });

  it('sends bots after people too: a player standing in the open gets shot', () => {
    const m = match({ mode: 'ffa' });
    const alice = join(m, 'alice', { bots: 1 });
    const from = m.history.length;
    for (let i = 0; i < ticks(30) && !m.history.slice(from).some((o) => o.events.some((e) => e.type === 'hit' && e.victim === alice.client.id)); i++) m.step();
    expect(m.history.slice(from).some((o) => o.events.some((e) => e.type === 'hit' && e.victim === alice.client.id))).toBe(true);
  });

  it('keeps the bots still and quiet through the intermission', () => {
    const m = match({ modes: { tdm: { timeLimit: 3 } }, intermission: { nuke: 2, vote: 2 } });
    join(m, 'alice');
    const phase = () => m.server.phase;
    while (phase() === 'playing') m.step();
    m.run(ticks(0.5));
    const at = fighters(m).map((p) => p.position);
    const from = m.history.length;
    while (phase() !== 'playing') m.step();
    const during = m.history.slice(from, -1);
    expect(during.flatMap((o) => o.events.filter((e) => e.type === 'shot'))).toEqual([]);
    expect(during.at(-1)!.players.filter((p) => p.kind === 'player').map((p) => p.position)).toEqual(at);
    expect(m.server.bots.size).toBe(5);
  });
});

describe('spawn protection', () => {
  /** Alice fires at Bob for `seconds` (as her screen shows him); the damage Bob took (he may die and respawn meanwhile). */
  function fire(m: NetworkedMatch, alice: NetworkedClient, bob: NetworkedClient, seconds: number): number {
    const from = m.history.length;
    let aim = { yaw: 0, pitch: 0 };
    for (let i = 0; i < ticks(seconds); i++) {
      const me = alice.client.self;
      const seen = alice.client.others().find((p) => p.id === bob.client.id);
      if (!me || !seen) {
        m.step();
        continue;
      }
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      m.step({ alice: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) });
    }
    return m.history.slice(from).flatMap((o) => o.events).reduce((sum, e) => sum + (e.type === 'hit' && e.victim === bob.client.id ? e.damage : 0), 0);
  }

  const duel = () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [{ position: [0, 0, 0], yaw: 0 }, { position: [0, 0, -12], yaw: Math.PI }], mode: 'ffa', latency: 0.03 });
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    return { m, alice, bob };
  };

  it('keeps a player who just spawned from taking damage for a moment', () => {
    const { m, alice, bob } = duel();
    expect(fire(m, alice, bob, 1)).toBe(0);
    m.run(ticks(0.6));
    expect(fire(m, alice, bob, 0.5)).toBeGreaterThan(0);
  });

  it('ends when the protected player fires', () => {
    const { m, alice, bob } = duel();
    // Bob fires off to the side until the server has his first shot.
    const shot = () => m.history.some((o) => o.events.some((e) => e.type === 'shot' && e.shooter === bob.client.id));
    while (!shot() && m.server.simulation.time < 1.2) m.step({ bob: usercmd({ yaw: Math.PI / 2, buttons: ['Fire'] }) });
    expect(shot()).toBe(true);
    expect(fire(m, alice, bob, 0.3)).toBeGreaterThan(0);
    // Still inside the 1.5 s he would have had.
    expect(m.server.simulation.time).toBeLessThan(1.5);
  });
});
