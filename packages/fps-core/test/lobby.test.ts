import { describe, expect, it } from 'vitest';
import { INTERMISSION, type PlayerOutput, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SPREAD: readonly SpawnPoint[] = [
  { position: [-25, 0, -25], yaw: 0 },
  { position: [25, 0, -25], yaw: 0 },
  { position: [-25, 0, 25], yaw: Math.PI },
  { position: [25, 0, 25], yaw: Math.PI },
];
const BLUE: readonly SpawnPoint[] = [0, 3, 6].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
const ORANGE: readonly SpawnPoint[] = [0, 3, 6].map((x) => ({ position: [x, 0, -20], yaw: 0 }));

/** A server with a lobby; its matches last 2 s. */
function lobby(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({
    solids: [FLOOR],
    spawns: SPREAD,
    teamSpawns: [BLUE, ORANGE],
    mode: 'tdm',
    lobby: true,
    modes: { tdm: { timeLimit: 2 }, ffa: { timeLimit: 2 }, outposts: { timeLimit: 2 } },
    latency: 0.03,
    seed: 3,
    ...options,
  });
}

/** Joins the named clients in order, each stepping until it has its welcome and first snapshot. */
function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
  return names.map((n) => {
    const c = m.join(n);
    for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
    expect(c.client.status, `${n} joined`).toBe('joined');
    return c;
  });
}

function until(m: NetworkedMatch, done: () => boolean, limit = 30): number {
  for (let i = 0; i < ticks(limit); i++) {
    if (done()) return i / 60;
    m.step();
  }
  throw new Error('condition not reached');
}

const player = (m: NetworkedMatch, c: NetworkedClient): PlayerOutput => m.server.latest.players.find((p) => p.id === c.client.id)!;

describe('the lobby', () => {
  it('takes the first person in as its host, with no match until they start one', () => {
    const m = lobby();
    const [a, b] = joinAll(m, 'a', 'b');
    m.run(ticks(1));
    expect(m.server.phase).toBe('lobby');
    expect(m.server.host).toBe(a!.client.id);
    expect(b!.client.match?.lobby).toMatchObject({ host: a!.client.id, players: [a!.client.id, b!.client.id], mode: 'tdm', maps: ['range'], map: 'range' });
    expect(b!.client.match?.phaseEnds).toBeNull();
    expect(m.server.status()).toMatchObject({ phase: 'lobby', lobby: true });
  });

  it('holds everyone still while they wait', () => {
    const m = lobby();
    const [a] = joinAll(m, 'a');
    const before = player(m, a!).position;
    m.run(ticks(1), () => ({ a: usercmd({ forward: 1, buttons: ['Sprint', 'Fire'] }) }));
    expect(player(m, a!).position).toEqual(before);
  });

  it('lets only the host pick the mode and bots and start the match', () => {
    const m = lobby();
    const [a, b] = joinAll(m, 'a', 'b');
    b!.client.setLobby({ mode: 'ffa' });
    b!.client.startMatch();
    m.run(ticks(0.5));
    expect(m.server.phase).toBe('lobby');
    expect(a!.client.match?.lobby?.mode).toBe('tdm');

    a!.client.setLobby({ mode: 'outposts', bots: 3 });
    m.run(ticks(0.5));
    // Bots only where the server has them.
    expect(a!.client.match?.lobby).toMatchObject({ mode: 'outposts', bots: 0, maxBots: 0 });
    a!.client.startMatch();
    until(m, () => m.server.phase === 'playing', 2);
    expect(m.server.mode.id).toBe('outposts');
    for (const c of [a!, b!]) expect(player(m, c).alive).toBe(true);
    expect(new Set([player(m, a!).team, player(m, b!).team])).toEqual(new Set([1, 2]));
  });

  it('comes back after every match: the nuke, the scoreboard, then the lobby, with the result kept', () => {
    const m = lobby();
    const [a] = joinAll(m, 'a', 'b');
    a!.client.startMatch();
    until(m, () => m.server.phase === 'playing', 2);
    until(m, () => m.server.phase === 'nuke');
    const toScoreboard = until(m, () => m.server.phase === 'vote');
    const toLobby = until(m, () => m.server.phase === 'lobby');
    expect(toScoreboard).toBeCloseTo(INTERMISSION.nuke, 1);
    expect(toLobby).toBeCloseTo(INTERMISSION.scoreboard, 1);
    m.run(ticks(0.5));
    expect(a!.client.match).toMatchObject({ phase: 'lobby', result: { reason: 'timeLimit' } });
    // And it stays there until the host starts the next one.
    m.run(ticks(5));
    expect(m.server.phase).toBe('lobby');
  });

  it('counts no votes on a server with a lobby', () => {
    const m = lobby();
    const [a, b] = joinAll(m, 'a', 'b');
    a!.client.startMatch();
    until(m, () => m.server.phase === 'vote');
    b!.client.vote('ffa');
    m.run(ticks(0.5));
    expect(a!.client.match?.votes.ffa).toBe(0);
  });

  it('passes the host on when the host leaves', () => {
    const m = lobby();
    const [a, b] = joinAll(m, 'a', 'b', 'c');
    a!.client.close();
    m.run(ticks(0.5));
    expect(m.server.host).toBe(b!.client.id);
    expect(b!.client.match?.lobby?.host).toBe(b!.client.id);
  });

  it('puts someone joining a match under way straight into it', () => {
    const m = lobby();
    const [a] = joinAll(m, 'a');
    a!.client.startMatch();
    until(m, () => m.server.phase === 'playing', 2);
    const [b] = joinAll(m, 'b');
    expect(m.server.phase).toBe('playing');
    expect(player(m, b!).alive).toBe(true);
    expect(player(m, b!).team).not.toBe(0);
  });

  it('starts afresh in the lobby once everyone has gone', () => {
    const m = lobby({ reconnectGrace: 0 });
    const [a] = joinAll(m, 'a');
    a!.client.startMatch();
    until(m, () => m.server.phase === 'playing', 2);
    a!.client.close();
    m.run(ticks(0.5));
    const [b] = joinAll(m, 'b');
    expect(m.server.phase).toBe('lobby');
    expect(m.server.host).toBe(b!.client.id);
  });

  it('starts a match at once for a script player on an empty server, to load it like a game', () => {
    const m = lobby();
    m.join('load', { script: true });
    until(m, () => m.server.phase === 'playing', 2);
  });

  it('keeps matches back to back, with a vote, on a server without a lobby', () => {
    const m = lobby({ lobby: false });
    const [a] = joinAll(m, 'a');
    expect(m.server.phase).toBe('playing');
    expect(a!.client.match?.lobby).toBeNull();
    expect(m.server.status().lobby).toBe(false);
  });
});
