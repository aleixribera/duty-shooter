import { describe, expect, it } from 'vitest';
import { RECONNECT_GRACE, anglesOf, buildNavGraph, createWorld, zoneCentre, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const DUEL: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -12], yaw: Math.PI },
];
const nav = buildNavGraph(createWorld([FLOOR]), {
  area: [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ],
});

function match(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: DUEL, mode: 'ffa', latency: 0.03, ...options });
}

/** Joins `name` (taking a held seat back with `resume`) and steps until it is in the game (fails after 3 s). */
function join(m: NetworkedMatch, name: string, options: { resume?: string; mode?: 'tdm' | 'ffa'; bots?: number } = {}): NetworkedClient {
  const c = m.join(name, options);
  for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  expect(c.client.status, `${name} joined`).toBe('joined');
  return c;
}

/** Closes the client's connection and steps until the server has let it go. */
function drop(m: NetworkedMatch, c: NetworkedClient): void {
  const before = m.server.playerCount;
  c.client.close();
  while (m.server.playerCount === before) m.step();
}

/** Alice shoots Bob (as her screen shows him) until he dies; fails after 5 s. */
function kill(m: NetworkedMatch, alice: NetworkedClient, bob: NetworkedClient): void {
  let aim = { yaw: 0, pitch: 0 };
  for (let i = 0; i < ticks(5); i++) {
    const me = alice.client.self;
    const seen = alice.client.others().find((p) => p.id === bob.client.id);
    if (me && seen) {
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
    }
    const out = m.step({ alice: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) });
    if (out.events.some((e) => e.type === 'kill')) return;
  }
  throw new Error('no kill');
}

const score = (m: NetworkedMatch, name: string) => m.server.mode.scores().find((s) => s.name === name);

describe('coming back after a drop', () => {
  it('puts a returning player back in their seat: same id, spot, ammo and score', () => {
    const m = match();
    const alice = join(m, 'alice');
    const bob = join(m, 'bob');
    m.run(ticks(2));
    kill(m, alice, bob);
    // Alice walks off sideways and stands still, a few rounds down.
    m.run(ticks(0.6), () => ({ alice: usercmd({ yaw: Math.PI / 2, forward: 1 }) }));
    m.run(ticks(1));
    const id = alice.client.id!;
    const token = alice.client.token!;
    const before = m.server.simulation.playerState(id)!;
    expect(before.weapon.ammo).toBeLessThan(30);
    expect(score(m, 'alice')).toMatchObject({ kills: 1, deaths: 0 });

    drop(m, alice);
    expect(m.server.latest.players.some((p) => p.id === id)).toBe(false);
    expect(m.server.status()).toMatchObject({ players: 1, away: 1 });
    expect(score(m, 'alice')).toBeUndefined();
    m.run(ticks(10));

    const back = join(m, 'alice', { resume: token });
    expect(back.client.id).toBe(id);
    expect(back.client.token).toBe(token);
    const after = m.server.simulation.playerState(id)!;
    expect(after.move.position).toEqual(before.move.position);
    expect(after.weapon.ammo).toBe(before.weapon.ammo);
    expect(after.team).toBe(before.team);
    expect(after.life).toBe(before.life);
    expect(score(m, 'alice')).toMatchObject({ id, kills: 1, deaths: 0 });
    expect(score(m, 'bob')).toMatchObject({ kills: 0, deaths: 1 });
    expect(m.server.status()).toMatchObject({ players: 2, away: 0 });
  });

  it('keeps the match running with everyone gone, bots and clock, until the grace period runs out', () => {
    const m = match({ mode: 'tdm', spawns: DUEL, bots: { nav, perTeam: 3 }, reconnectGrace: 20 });
    const alice = join(m, 'alice', { bots: 2 });
    expect(m.server.bots.size).toBe(3);
    const ends = m.server.matchStatus().phaseEnds;
    drop(m, alice);

    m.run(ticks(15));
    expect(m.server.status()).toMatchObject({ players: 0, away: 1, bots: 3, botsPerTeam: 2, phase: 'playing' });
    expect(m.server.matchStatus().phaseEnds).toBe(ends);
    // A newcomer joins the running match: no say in the mode or the bots, and the bots keep the held seat free.
    const carol = join(m, 'carol', { mode: 'ffa', bots: 4 });
    expect(m.server.mode.id).toBe('tdm');
    expect(m.server.matchStatus().phaseEnds).toBe(ends);
    expect(m.server.bots.size).toBe(2);
    drop(m, carol);

    m.run(ticks(25));
    expect(m.server.status()).toMatchObject({ players: 0, away: 0, bots: 0, botsPerTeam: 3 });
    // Too late: the seat is gone, and the token joins as anyone would, starting a fresh lobby.
    const late = join(m, 'alice', { resume: alice.client.token! });
    expect(late.client.id).not.toBe(alice.client.id);
    expect(m.server.bots.size).toBe(5);
  });

  it('holds the seat for five minutes by default', () => {
    expect(RECONNECT_GRACE).toBe(300);
  });

  it('brings a player back fresh into a match that started while they were away', () => {
    const m = match({ modes: { ffa: { timeLimit: 10 } }, intermission: { nuke: 1, vote: 1 } });
    const alice = join(m, 'alice');
    join(m, 'bob');
    m.run(ticks(2));
    kill(m, alice, m.client('bob'));
    const id = alice.client.id!;
    drop(m, alice);
    m.run(ticks(12));
    expect(m.server.phase).toBe('playing');

    const back = join(m, 'alice', { resume: alice.client.token! });
    expect(back.client.id).toBe(id);
    expect(score(m, 'alice')).toMatchObject({ kills: 0, deaths: 0 });
    expect(m.server.latest.players.find((p) => p.id === id)).toMatchObject({ alive: true });
  });

  it('counts a held seat toward the player cap, but always lets its player back in', () => {
    const m = match({ maxPlayers: 2 });
    const alice = join(m, 'alice');
    join(m, 'bob');
    drop(m, alice);
    const carol = m.join('carol');
    m.run(ticks(1));
    expect(carol.client.rejectReason).toBe('full');

    join(m, 'alice', { resume: alice.client.token! });
    expect(m.server.playerCount).toBe(2);
  });

  it('takes the seat over from a connection that is still open (a half-open socket, a second tab)', () => {
    const m = match();
    const first = join(m, 'first');
    const id = first.client.id!;
    m.run(ticks(0.5), () => ({ first: usercmd({ forward: 1 }) }));
    m.run(ticks(1));
    const position = m.server.simulation.playerState(id)!.move.position;

    const second = join(m, 'second', { resume: first.client.token! });
    expect(second.client.id).toBe(id);
    expect(m.server.playerCount).toBe(1);
    expect(m.server.simulation.playerState(id)!.move.position).toEqual(position);
    m.run(ticks(0.5));
    expect(first.client.status).toBe('closed');
    expect(first.client.closeReason).toBe('replaced');
  });
});
