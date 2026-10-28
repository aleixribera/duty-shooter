import { describe, expect, it } from 'vitest';
import { MATCH_COUNTDOWN, PROTOCOL_VERSION, RESPAWN_DELAY, anglesOf, box, zoneCentre, type ModeEvent, type PlayerOutput, type SimEvent, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

/** The spec's networked conditions: 80 ms latency with jitter and 5% loss. */
const BAD_NETWORK = { latency: 0.08, jitter: 0.02, loss: 0.05, seed: 5 } as const;

/** Free-for-all points spread around a 60 m square, and two team sets at opposite ends. */
const SPREAD: readonly SpawnPoint[] = [
  { position: [-25, 0, -25], yaw: 0 },
  { position: [25, 0, -25], yaw: 0 },
  { position: [-25, 0, 25], yaw: Math.PI },
  { position: [25, 0, 25], yaw: Math.PI },
];
const BLUE_HOUSE: readonly SpawnPoint[] = [
  { position: [-3, 0, 20], yaw: Math.PI },
  { position: [0, 0, 20], yaw: Math.PI },
  { position: [3, 0, 20], yaw: Math.PI },
  { position: [6, 0, 20], yaw: Math.PI },
];
const ORANGE_HOUSE: readonly SpawnPoint[] = [
  { position: [-3, 0, -20], yaw: 0 },
  { position: [0, 0, -20], yaw: 0 },
  { position: [3, 0, -20], yaw: 0 },
  { position: [6, 0, -20], yaw: 0 },
];

function tdm(options: Partial<NetworkedMatchOptions> = {}): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE_HOUSE, ORANGE_HOUSE], mode: 'tdm', ...BAD_NETWORK, ...options });
}

/** Joins the named clients one after another (so they join in this order), each stepping until spawned (or fails after 3 s). */
function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
  return names.map((n) => {
    const c = m.join(n);
    for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
    expect(c.client.status, `${c.name} joined`).toBe('joined');
    return c;
  });
}

function serverPlayer(m: NetworkedMatch, id: string | null): PlayerOutput {
  const p = m.server.latest.players.find((x) => x.id === id);
  if (!p) throw new Error(`server has no ${id}`);
  return p;
}

function teamOf(m: NetworkedMatch, c: NetworkedClient): number {
  return serverPlayer(m, c.client.id).team;
}

/** The server's simulation and mode events from tick index `from` on. */
function events(m: NetworkedMatch, from = 0): (SimEvent | ModeEvent)[] {
  return m.history.slice(from).flatMap((o, i) => [...o.events, ...(m.modeHistory[from + i] ?? [])]);
}

/** Every mode event the server sent to a client (kill feed, match end and start). */
function modeEvents(c: NetworkedClient): ModeEvent[] {
  return c.frames.flatMap((f) => f.server.filter((e): e is ModeEvent => e.type === 'killFeed' || e.type === 'matchEnd' || e.type === 'matchStart'));
}

/** `shooter` fires at `victim` (as the shooter's screen shows them) until the server reports a kill, up to 5 s. */
function kill(m: NetworkedMatch, shooter: NetworkedClient, victim: NetworkedClient): boolean {
  let aim = { yaw: 0, pitch: 0 };
  for (let i = 0; i < ticks(5); i++) {
    const me = shooter.client.self;
    const seen = shooter.client.others().find((p) => p.id === victim.client.id);
    if (!me || !seen) {
      m.step();
      continue;
    }
    const centre = zoneCentre(seen, 'upperTorso');
    const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
    aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
    const out = m.step({ [shooter.name]: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) });
    if (out.events.some((e) => e.type === 'kill' && e.victim === victim.client.id)) return true;
  }
  return false;
}

/** Steps until the server's phase is `phase`, returning how many seconds that took (fails after `limit` s). */
function until(m: NetworkedMatch, done: () => boolean, limit = 30): number {
  for (let i = 0; i < ticks(limit); i++) {
    if (done()) return i / 60;
    m.step();
  }
  throw new Error('condition not reached');
}

describe('team deathmatch', () => {
  it('puts each joiner on the smaller team', () => {
    const m = tdm();
    const players = joinAll(m, 'a', 'b', 'c', 'd', 'e');
    const teams = players.map((p) => teamOf(m, p));

    expect(teams.filter((t) => t === 1)).toHaveLength(3);
    expect(teams.filter((t) => t === 2)).toHaveLength(2);
    expect(teams.slice(0, 4)).toEqual([1, 2, 1, 2]);
  });

  it('on equal teams, puts a joiner on the team behind on score', () => {
    const m = tdm({ loss: 0 });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(teamOf(m, a!)).toBe(1);
    expect(teamOf(m, b!)).toBe(2);
    // Blue leads 1-0. Teams are 1 v 1, so the next joiner goes to orange, the team behind.
    expect(kill(m, a!, b!)).toBe(true);
    const [c] = joinAll(m, 'c');
    expect(teamOf(m, c!)).toBe(2);
    // Blue is now smaller.
    const [d] = joinAll(m, 'd');
    expect(teamOf(m, d!)).toBe(1);
    // 2 v 2 again, blue still ahead: orange.
    const [e] = joinAll(m, 'e');
    expect(teamOf(m, e!)).toBe(2);
  });

  it('rebalances at match start with the fewest moves', () => {
    const m = tdm({ modes: { tdm: { timeLimit: 3 } }, intermission: { nuke: 0.5, vote: 0.5 }, loss: 0 });
    const players = joinAll(m, 'a', 'b', 'c', 'd', 'e', 'f');
    // Two orange players leave: blue 3, orange 1.
    const orange = players.filter((p) => teamOf(m, p) === 2);
    for (const p of orange.slice(0, 2)) p.client.close();
    m.run(ticks(0.5));
    const stay = players.filter((p) => !orange.slice(0, 2).includes(p));
    const before = new Map(stay.map((p) => [p.name, teamOf(m, p)]));
    expect([...before.values()].filter((t) => t === 1)).toHaveLength(3);

    until(m, () => events(m).some((e) => e.type === 'matchStart'));
    m.step();
    const after = new Map(stay.map((p) => [p.name, teamOf(m, p)]));
    const moved = [...after].filter(([name, team]) => before.get(name) !== team);

    expect(moved).toHaveLength(1);
    expect([...after.values()].filter((t) => t === 1)).toHaveLength(2);
    expect([...after.values()].filter((t) => t === 2)).toHaveLength(2);
  });

  it('has no friendly fire: a team hit does no damage and makes no hit, flinch or kill events', () => {
    const m = tdm({ teamSpawns: [[{ position: [0, 0, 0], yaw: 0 }, { position: [0, 0, -15], yaw: Math.PI }], ORANGE_HOUSE] });
    const [a, , c] = joinAll(m, 'a', 'b', 'c');
    expect(teamOf(m, a!)).toBe(teamOf(m, c!));
    const start = m.history.length;
    const victim = serverPlayer(m, c!.client.id);

    expect(kill(m, a!, c!)).toBe(false);

    const shots = events(m, start).filter((e) => e.type === 'shot' && e.shooter === a!.client.id);
    expect(shots.length).toBeGreaterThan(5);
    expect(events(m, start).filter((e) => e.type === 'hit' || e.type === 'kill')).toEqual([]);
    expect(serverPlayer(m, c!.client.id)).toMatchObject({ health: victim.health, pitch: victim.pitch });
  });

  it('ends at the kill limit with the right team winning', () => {
    const m = tdm({ modes: { tdm: { killLimit: 2 } }, teamSpawns: [[{ position: [0, 0, 0], yaw: 0 }], [{ position: [0, 0, -15], yaw: Math.PI }]] });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    m.run(ticks(0.2));
    expect(m.server.phase).toBe('playing');
    // The respawn is scored away from Alice; find Bob again.
    expect(kill(m, a!, b!)).toBe(true);
    m.step();

    const end = events(m).find((e) => e.type === 'matchEnd');
    expect(end).toMatchObject({ winner: teamOf(m, a!), draw: false, reason: 'killLimit' });
    expect(m.server.phase).toBe('nuke');
    expect(m.server.mode.teamScores()).toEqual([
      { team: 1, score: 2 },
      { team: 2, score: 0 },
    ]);
  });

  it('at the time limit the leading team wins', () => {
    const m = tdm({ modes: { tdm: { timeLimit: 8 } }, teamSpawns: [[{ position: [0, 0, 0], yaw: 0 }], [{ position: [0, 0, -15], yaw: Math.PI }]] });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    until(m, () => m.server.phase !== 'playing');

    expect(events(m).find((e) => e.type === 'matchEnd')).toMatchObject({ winner: 1, winnerName: 'Blue', draw: false, reason: 'timeLimit' });
  });

  it('at the time limit a tie is a draw', () => {
    const m = tdm({ modes: { tdm: { timeLimit: 2 } } });
    const [a] = joinAll(m, 'a', 'b');
    until(m, () => m.server.phase !== 'playing');

    expect(events(m).find((e) => e.type === 'matchEnd')).toMatchObject({ winner: null, winnerName: null, draw: true, reason: 'timeLimit' });
    m.run(ticks(0.5));
    expect(modeEvents(a!).find((e) => e.type === 'matchEnd')).toMatchObject({ draw: true });
  });

  it("spawns everyone at their team's house for the first spawn of a match", () => {
    const m = tdm();
    const players = joinAll(m, 'a', 'b', 'c', 'd');
    for (const p of players) {
      const set = teamOf(m, p) === 1 ? BLUE_HOUSE : ORANGE_HOUSE;
      expect(set.map((s) => s.position)).toContainEqual(serverPlayer(m, p.client.id).position);
    }
  });

  it('respawns out of enemy sight, near teammates', () => {
    // A wall splits the field. Bob (orange) dies; the only spawn Alice (blue) cannot see is behind the wall.
    const wall = box({ min: [10, 0, -30], max: [11, 5, 30], material: 'concrete' });
    const spawns: SpawnPoint[] = [
      { position: [0, 0, -10], yaw: 0 },
      { position: [-8, 0, 5], yaw: 0 },
      { position: [20, 0, 5], yaw: 0 },
    ];
    const m = tdm({ solids: [FLOOR, wall], spawns, teamSpawns: [[{ position: [0, 0, 5], yaw: Math.PI }], [{ position: [0, 0, -5], yaw: 0 }]] });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    m.run(ticks(RESPAWN_DELAY + 0.2));

    expect(serverPlayer(m, b!.client.id).position).toEqual([20, 0, 5]);
  });

  it('shows team assignments in player outputs on every client', () => {
    const m = tdm();
    const [a, b] = joinAll(m, 'a', 'b');
    m.run(ticks(0.5));

    expect(a!.client.self?.team).toBe(1);
    expect(a!.client.others().find((p) => p.id === b!.client.id)?.team).toBe(2);
  });
});

describe('free-for-all limits', () => {
  const LANE: readonly SpawnPoint[] = [
    { position: [0, 0, 0], yaw: 0 },
    { position: [0, 0, -15], yaw: Math.PI },
    { position: [30, 0, -30], yaw: Math.PI },
  ];

  it('ends at the kill limit with the player who reached it', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: LANE, modes: { ffa: { killLimit: 1 } }, ...BAD_NETWORK });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    m.step();

    expect(events(m).find((e) => e.type === 'matchEnd')).toMatchObject({ winner: a!.client.id, winnerName: 'a', draw: false, reason: 'killLimit' });
  });

  it('at the time limit the most kills wins', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: LANE, modes: { ffa: { timeLimit: 8 } }, ...BAD_NETWORK });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    until(m, () => m.server.phase !== 'playing');

    expect(events(m).find((e) => e.type === 'matchEnd')).toMatchObject({ winner: a!.client.id, draw: false, reason: 'timeLimit' });
  });

  it('at the time limit a tie at the top is a draw', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: LANE, modes: { ffa: { timeLimit: 2 } }, ...BAD_NETWORK });
    joinAll(m, 'a', 'b');
    until(m, () => m.server.phase !== 'playing');

    expect(events(m).find((e) => e.type === 'matchEnd')).toMatchObject({ winner: null, draw: true, reason: 'timeLimit' });
  });

  it('defaults to 30 kills or 600 s, and team deathmatch to 75 kills or 600 s', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: LANE, ...BAD_NETWORK });
    joinAll(m, 'a');
    expect(m.server.mode).toMatchObject({ id: 'ffa', killLimit: 30, timeLimit: 600 });
    const t = tdm();
    joinAll(t, 'a');
    expect(t.server.mode).toMatchObject({ id: 'tdm', killLimit: 75, timeLimit: 600 });
  });
});

describe('intermission', () => {
  /** A TDM match that times out after 2 s, with the default intermission. */
  function shortMatch(options: Partial<NetworkedMatchOptions> = {}) {
    const m = tdm({ modes: { tdm: { timeLimit: 2 }, ffa: { timeLimit: 2 } }, ...options });
    const players = joinAll(m, 'a', 'b');
    until(m, () => m.server.phase !== 'playing');
    return { m, players, endTick: m.history.length };
  }

  it('runs the nuke for 6 s, the vote until 20 s, then starts the next match', () => {
    const { m, endTick } = shortMatch();
    expect(m.history[endTick - 1]!.tick).toBeGreaterThan(0);

    const toVote = until(m, () => m.server.phase === 'vote');
    const toStart = until(m, () => m.server.phase === 'playing');

    expect(toVote).toBeCloseTo(6, 1);
    expect(toVote + toStart).toBeCloseTo(20, 1);
    expect(events(m, endTick).filter((e) => e.type === 'matchStart')).toHaveLength(1);
  });

  it('broadcasts the phase and its deadline', () => {
    const { m, players } = shortMatch();
    m.run(ticks(1));
    const status = players[0]!.client.match!;

    expect(status.phase).toBe('nuke');
    expect(status.phaseEnds! - players[0]!.client.serverTime).toBeGreaterThan(4);
    expect(status.phaseEnds! - players[0]!.client.serverTime).toBeLessThan(5.5);
    expect(status.result).toMatchObject({ draw: true });
  });

  it('freezes input for the whole intermission: nobody moves or fires', () => {
    const { m, players, endTick } = shortMatch();
    const [a] = players;
    const before = serverPlayer(m, a!.client.id).position;
    m.run(ticks(15), () => ({ a: usercmd({ forward: 1, buttons: ['Sprint', 'Fire'] }) }));

    expect(m.server.phase).not.toBe('playing');
    expect(serverPlayer(m, a!.client.id).position).toEqual(before);
    expect(a!.client.self!.position).toEqual(before);
    expect(events(m, endTick).filter((e) => e.type === 'shot')).toEqual([]);
  });

  it('scores nothing and kills nobody after the match ends', () => {
    const m = tdm({ modes: { tdm: { killLimit: 1 } }, teamSpawns: [[{ position: [0, 0, 0], yaw: 0 }], [{ position: [0, 0, -15], yaw: Math.PI }]] });
    const [a, b] = joinAll(m, 'a', 'b');
    expect(kill(m, a!, b!)).toBe(true);
    // Keep "firing" through the intermission.
    m.run(ticks(8), () => ({ a: usercmd({ buttons: ['Fire'] }) }));
    const endTick = m.modeHistory.findIndex((e) => e.some((x) => x.type === 'matchEnd'));

    expect(events(m, endTick + 1).filter((e) => e.type === 'kill' || e.type === 'hit')).toEqual([]);
    expect(m.server.mode.teamScores()).toEqual([
      { team: 1, score: 1 },
      { team: 2, score: 0 },
    ]);
  });

  it('starts the next match on fresh spawns with everyone alive', () => {
    const { m, players } = shortMatch();
    m.run(ticks(2), () => ({ a: usercmd({ forward: 1 }) }));
    until(m, () => m.server.phase === 'playing');
    for (const p of players) {
      const set = teamOf(m, p) === 1 ? BLUE_HOUSE : ORANGE_HOUSE;
      expect(set.map((s) => s.position)).toContainEqual(serverPlayer(m, p.client.id).position);
      expect(serverPlayer(m, p.client.id).alive).toBe(true);
    }
  });
});

describe('mode voting', () => {
  /** Runs a 2 s TDM match into its vote window, has each named client vote, then runs to the next match. */
  function voteRound(names: readonly string[], votes: (clients: NetworkedClient[], m: NetworkedMatch) => void, extra?: (m: NetworkedMatch, clients: NetworkedClient[]) => void) {
    const m = tdm({ modes: { tdm: { timeLimit: 2 }, ffa: { timeLimit: 2 } }, loss: 0 });
    const clients = joinAll(m, ...names);
    until(m, () => m.server.phase === 'vote');
    votes(clients, m);
    m.run(ticks(1));
    extra?.(m, clients);
    until(m, () => m.server.phase === 'playing');
    return { m, clients };
  }

  it('the plurality wins', () => {
    const { m } = voteRound(['a', 'b', 'c'], ([a, b, c]) => {
      a!.client.vote('ffa');
      b!.client.vote('ffa');
      c!.client.vote('tdm');
    });
    expect(m.server.mode.id).toBe('ffa');
    expect(events(m).filter((e) => e.type === 'matchStart').at(-1)).toEqual({ type: 'matchStart', mode: 'ffa' });
  });

  it('a tie keeps the mode', () => {
    const { m } = voteRound(['a', 'b'], ([a, b]) => {
      a!.client.vote('ffa');
      b!.client.vote('tdm');
    });
    expect(m.server.mode.id).toBe('tdm');
  });

  it('no votes keep the mode', () => {
    const { m } = voteRound(['a', 'b'], () => {});
    expect(m.server.mode.id).toBe('tdm');
  });

  it('a changed vote counts once', () => {
    let tally: unknown = null;
    const { m } = voteRound(
      ['a', 'b', 'c'],
      ([a, b, c], m) => {
        a!.client.vote('ffa');
        m.run(ticks(0.5));
        a!.client.vote('tdm');
        b!.client.vote('ffa');
        c!.client.vote('tdm');
      },
      (match) => (tally = match.server.matchStatus().votes),
    );
    expect(tally).toEqual({ tdm: 2, ffa: 1, outposts: 0, charge: 0, gungame: 0 });
    expect(m.server.mode.id).toBe('tdm');
  });

  it('broadcasts the live tally', () => {
    voteRound(['a', 'b', 'c'], ([a, b]) => {
      a!.client.vote('ffa');
      b!.client.vote('ffa');
    }, (_m, clients) => {
      expect(clients[2]!.client.match).toMatchObject({ phase: 'vote', votes: { ffa: 2, tdm: 0 }, next: 'ffa' });
    });
  });

  it('ignores votes before the window opens and after it closes', () => {
    const m = tdm({ modes: { tdm: { timeLimit: 2 }, ffa: { timeLimit: 30 } }, loss: 0 });
    const [a, b] = joinAll(m, 'a', 'b');
    // During play: ignored, and the mode never changes mid-match.
    a!.client.vote('ffa');
    b!.client.vote('ffa');
    m.run(ticks(0.5));
    expect(m.server.matchStatus().votes).toEqual({ tdm: 0, ffa: 0, outposts: 0, charge: 0, gungame: 0 });
    expect(m.server.mode.id).toBe('tdm');
    // During the nuke: ignored too.
    until(m, () => m.server.phase === 'nuke');
    a!.client.vote('ffa');
    m.run(ticks(0.5));
    expect(m.server.matchStatus().votes).toEqual({ tdm: 0, ffa: 0, outposts: 0, charge: 0, gungame: 0 });
    until(m, () => m.server.phase === 'playing');
    expect(m.server.mode.id).toBe('tdm');
    // After the window: ignored.
    a!.client.vote('ffa');
    b!.client.vote('ffa');
    m.run(ticks(0.5));
    expect(m.server.matchStatus().votes).toEqual({ tdm: 0, ffa: 0, outposts: 0, charge: 0, gungame: 0 });
    expect(m.server.mode.id).toBe('tdm');
  });
});

describe('joining with a preferred mode', () => {
  it('honours the first joiner on an empty server', () => {
    const m = tdm();
    const a = m.join('a', { mode: 'ffa' });
    for (let i = 0; i < ticks(3) && a.client.status !== 'joined'; i++) m.step();

    expect(m.server.mode.id).toBe('ffa');
    expect(m.server.status()).toMatchObject({ mode: 'ffa', players: 1, phase: 'playing' });
  });

  it('ignores it on a busy server', () => {
    const m = tdm();
    joinAll(m, 'a');
    const b = m.join('b', { mode: 'ffa' });
    for (let i = 0; i < ticks(3) && b.client.status !== 'joined'; i++) m.step();

    expect(b.client.status).toBe('joined');
    expect(m.server.mode.id).toBe('tdm');
  });

  it('rejects an old protocol version', () => {
    const m = tdm({ loss: 0 });
    const raw = m.network.connect();
    let closed = '';
    raw.onClose((reason) => (closed = reason));
    raw.send(JSON.stringify({ t: 'join', name: 'old', passphrase: 'letmein', protocol: PROTOCOL_VERSION - 1 }));
    m.run(10);

    expect(closed).toBe('rejected: protocol');
    expect(m.server.playerCount).toBe(0);
  });
});

describe('the opening countdown', () => {
  it('holds everyone for 5 s at the start of every match, unable to move or fire, before the clock starts', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, countdown: MATCH_COUNTDOWN, modes: { ffa: { timeLimit: 600 } } });
    const [a] = joinAll(m, 'a');
    const status = m.server.matchStatus();
    expect(MATCH_COUNTDOWN).toBe(5);
    expect(status.countdownEnds).not.toBeNull();
    expect(status.phaseEnds).toBeCloseTo(status.countdownEnds! + 600, 5);
    const start = serverPlayer(m, a!.client.id).position;
    let shots = 0;
    while (m.server.matchStatus().countdownEnds !== null) {
      const out = m.step({ a: usercmd({ forward: 1, buttons: ['Fire'] }) });
      shots += out.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBe(0);
    expect(serverPlayer(m, a!.client.id).position).toEqual(start);
    // Then play is on: the same input moves and fires.
    for (let i = 0; i < ticks(1); i++) shots += m.step({ a: usercmd({ forward: 1, buttons: ['Fire'] }) }).events.filter((e) => e.type === 'shot').length;
    expect(shots).toBeGreaterThan(0);
    expect(serverPlayer(m, a!.client.id).position).not.toEqual(start);
  });

  it('gives Charge none: its first round opens with its own freeze', () => {
    const m = tdm({ mode: 'charge', countdown: MATCH_COUNTDOWN, ...{ latency: 0, jitter: 0, loss: 0 } });
    joinAll(m, 'a');
    expect(m.server.matchStatus().countdownEnds).toBeNull();
  });
});
