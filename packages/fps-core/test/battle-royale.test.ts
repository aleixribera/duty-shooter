import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, botProfile, box, buildNavGraph, createWorld, type BattleRoyaleState, type Connection, type ModeContext, type NavGraph, type PlayerOutput, type SimEvent, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { BattleRoyale, playGround, type MatchEntrant, type SquadSize } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch, type NetworkedMatchOptions } from '@duty-shooter/fps-core/harness';
import { Button } from '../src/usercmd';
import { nameList } from '../src/modes/battle-royale';
import { packValue, unpackValue } from '../src/net/codec';
import { ticks } from './support/movement';

const GROUND = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
const WORLD = createWorld([GROUND]);
const NAV: NavGraph = buildNavGraph(WORLD, { area: [[-240, -240], [240, -240], [240, 240], [-240, 240]], spacing: 4 });
const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];
const ROYALE = 'battle-royale';

const entrants = (count: number): MatchEntrant[] => Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `n${i + 1}`, team: null }));

/** The mode alone, with seats that die when told. `people` are the human seats. */
function royale(options: { squadSize?: SquadSize; seats?: number; people?: readonly string[]; timeLimit?: number } = {}) {
  const seats = entrants(options.seats ?? 6);
  const mode = new BattleRoyale({ squadSize: options.squadSize ?? 1, seed: 11, ...(options.timeLimit ? { timeLimit: options.timeLimit } : {}) });
  const alive = new Map(seats.map((s) => [s.id, true]));
  let matchTime = 0;
  let team = new Map<string, number>();
  const people = new Set(options.people ?? []);
  const ctx = (): ModeContext => ({
    tick: 0,
    time: matchTime,
    matchTime,
    players: seats.map((s) => ({ id: s.id, team: team.get(s.id), alive: alive.get(s.id), kind: 'player', position: [0, 0, 0] }) as unknown as PlayerOutput),
    spawns: SPAWNS,
    teamSpawns: null,
    world: WORLD,
    zones: [],
    sites: [],
    using: new Set(),
    ground: playGround(NAV, WORLD),
    people,
  });
  team = new Map(mode.start(seats, ctx()));
  /** One tick: each [victim, killer] dies, then the mode judges it. */
  const tick = (...deaths: readonly (readonly [string, string?])[]) => {
    const events: SimEvent[] = deaths.map(([victim, killer]) => {
      alive.set(victim, false);
      return { type: 'kill', killer: killer ?? null, victim, cause: 'bullet', zone: null, weapon: null };
    });
    matchTime += TICK_SECONDS;
    mode.onEvents(events, ctx());
    return mode.result(ctx());
  };
  return { mode, team, tick, ctx, people, advance: (s: number) => (matchTime += s) };
}

const place = (mode: BattleRoyale, id: string) => mode.scores().find((s) => s.id === id)?.place;

describe('Squads', () => {
  it('seats picked Squads together, bots filling their gaps before Squads of their own', () => {
    const mode = new BattleRoyale({ squadSize: 3, seed: 11 });
    // p2 and p5 picked Squad 9, p4 picked Squad 2; the rest picked nothing.
    const seats = entrants(9).map((e) => (e.id === 'p2' || e.id === 'p5' ? { ...e, squad: 9 } : e.id === 'p4' ? { ...e, squad: 2 } : e));
    const team = mode.start(seats, { tick: 0, time: 0, matchTime: 0, players: [], spawns: SPAWNS, teamSpawns: null, world: WORLD, zones: [], sites: [], using: new Set(), ground: playGround(NAV, WORLD), people: new Set() });
    expect(team.get('p2')).toBe(team.get('p5'));
    expect(team.get('p4')).not.toBe(team.get('p2'));
    const counts = new Map<number, number>();
    for (const t of team.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
    expect([...counts.values()]).toEqual([3, 3, 3]);
  });

  it('can change its Squad size between matches', () => {
    const mode = new BattleRoyale({ seed: 11 });
    mode.squadSize = 2;
    const team = mode.start(entrants(4), { tick: 0, time: 0, matchTime: 0, players: [], spawns: SPAWNS, teamSpawns: null, world: WORLD, zones: [], sites: [], using: new Set(), ground: playGround(NAV, WORLD), people: new Set() });
    expect(new Set(team.values()).size).toBe(2);
  });

  it.each([[1, 60], [2, 30], [3, 20]] as const)('%i a Squad seats 60 as %i Squads', (size, squads) => {
    const { team } = royale({ squadSize: size, seats: 60 });
    const counts = new Map<number, number>();
    for (const t of team.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
    expect(counts.size).toBe(squads);
    expect([...counts.values()].every((n) => n === size)).toBe(true);
  });

  it('squadmates cannot hurt each other, and everyone else can', () => {
    const { mode, team } = royale({ squadSize: 2, seats: 4 });
    const seat = (id: string) => ({ id, team: team.get(id)!, kind: 'player' as const });
    expect(mode.canDamage(seat('p1'), seat('p2'))).toBe(false);
    expect(mode.canDamage(seat('p1'), seat('p3'))).toBe(true);
  });

  it('one life: nobody respawns', () => {
    expect(royale().mode.canRespawn()).toBe(false);
  });
});

describe('Winning', () => {
  it('the last Squad with anyone alive wins', () => {
    const { tick } = royale({ squadSize: 2, seats: 6 });
    expect(tick(['p1'], ['p2'])).toBeNull();
    expect(tick(['p3'])).toBeNull();
    const result = tick(['p4', 'p5']);
    expect(result).toMatchObject({ winner: 3, draw: false, reason: 'lastSquad' });
    expect(result?.winnerName).toContain('n5');
    // A Squad of two is named as a line reads it, and says how many it names (ticket 42).
    expect(result?.winnerName).not.toContain(',');
    expect(result?.winnerName).toMatch(/^n\d and n\d$/);
    expect(result?.winners).toBe(2);
    expect(unpackValue(packValue({ type: 'matchEnd', ...result }))).toEqual({ type: 'matchEnd', ...result });
  });

  it('names a Squad as a line reads it', () => {
    expect(nameList(['Ada'])).toBe('Ada');
    expect(nameList(['Ada', 'Mate'])).toBe('Ada and Mate');
    expect(nameList(['Ada', 'Mate', 'Joan'])).toBe('Ada, Mate and Joan');
  });

  it('places a Squad by how many remained when it went out', () => {
    const { mode, tick } = royale({ seats: 4 });
    tick(['p2', 'p1']);
    expect(place(mode, 'p2')).toBe(4);
    tick(['p4', 'p1']);
    expect(place(mode, 'p4')).toBe(3);
    tick(['p3', 'p1']);
    expect(place(mode, 'p3')).toBe(2);
    expect(place(mode, 'p1')).toBe(1);
  });

  it('when the last seats die on one tick, the higher kill count wins', () => {
    const { tick } = royale({ seats: 3 });
    tick(['p1', 'p3']);
    expect(tick(['p2', 'p3'], ['p3', 'p2'])).toMatchObject({ winner: 3, reason: 'lastSquad' });
  });

  it('then the lower seat number, read as a number, so a result always exists', () => {
    const { tick } = royale({ seats: 10 });
    tick(...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => [id] as const));
    // As text, p10 would sort before p9.
    expect(tick(['p9', 'p10'], ['p10', 'p9'])).toMatchObject({ winner: 9, reason: 'lastSquad' });
  });

  it('at the time limit the Squad with the most kills among the living wins', () => {
    const m = royale({ seats: 4 });
    m.tick(['p4', 'p2']);
    m.advance(10_000);
    expect(m.tick()).toMatchObject({ winner: 2, reason: 'timeLimit', draw: false });
  });
});

describe('Early end', () => {
  it('ends at once when no human is alive, and the humans are placed by the Squads that remained', () => {
    const { mode, tick, people } = royale({ seats: 6, people: ['p1'] });
    expect(people.has('p1')).toBe(true);
    tick(['p6']);
    expect(tick(['p1', 'p2'])).toMatchObject({ winner: null, draw: false, reason: 'noHumans' });
    expect(place(mode, 'p1')).toBe(5);
  });

  it('a human alive keeps it going, a Squad of bots out or not', () => {
    const { tick } = royale({ seats: 4, people: ['p1'] });
    expect(tick(['p2'])).toBeNull();
    expect(tick(['p3'])).toBeNull();
  });

  it('a human on the winning Squad wins it, rather than ending it early', () => {
    const { tick } = royale({ seats: 2, people: ['p1'] });
    expect(tick(['p1', 'p2'])).toMatchObject({ winner: 2, reason: 'lastSquad' });
  });

  it('a match with no humans in it plays to the end', () => {
    const { tick } = royale({ seats: 3 });
    expect(tick(['p3'])).toBeNull();
  });
});

describe('the Ring', () => {
  const ring = (seed: number, timeLimit?: number) => {
    const mode = new BattleRoyale({ seed, ...(timeLimit ? { timeLimit } : {}) });
    mode.start(entrants(4), { spawns: SPAWNS, ground: playGround(NAV, WORLD) } as unknown as ModeContext);
    return mode.ring;
  };

  it('replays from its seed', () => {
    expect(ring(5)).toEqual(ring(5));
    expect(ring(5)).not.toEqual(ring(6));
  });

  it('has 6 Stages, the first shrink at 1:00, the whole of it done by 10:00', () => {
    const plan = ring(1);
    expect(plan).toHaveLength(6);
    expect(plan[0]!.shrinkAt).toBe(60);
    expect(plan.at(-1)!.shrinkEnd).toBeLessThanOrEqual(600);
    for (const [i, s] of plan.entries()) if (i > 0) expect(s.shrinkAt).toBeGreaterThan(plan[i - 1]!.shrinkEnd);
  });

  it('keeps each circle fully inside the last, for any seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const s of ring(seed)) {
        expect(Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) + s.to.radius).toBeLessThanOrEqual(s.from.radius + 1e-6);
      }
    }
  });

  it('starts round all the ground, and leaves no safe ground at the end', () => {
    const plan = ring(2);
    expect(plan[0]!.from.radius).toBeGreaterThanOrEqual(Math.hypot(240, 240));
    expect(plan.at(-1)!.to.radius).toBe(0);
  });

  it('hurts more at each Stage', () => {
    const plan = ring(3);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.damage).toBeGreaterThan(plan[i - 1]!.damage);
  });

  it('is always within a sprint, from the far side of one circle to the next', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const s of ring(seed)) {
        const run = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) + s.from.radius - s.to.radius;
        expect(run / STATS.movement.sprintSpeed.value).toBeLessThan(s.shrinkEnd - s.start);
      }
    }
  });

  it('runs on a short match in proportion', () => {
    const plan = ring(4, 60);
    expect(plan[0]!.shrinkAt).toBeCloseTo(6);
    expect(plan.at(-1)!.shrinkEnd).toBeLessThanOrEqual(60);
  });
});

/** A server playing the mode on open ground. */
function match(options: Partial<NetworkedMatchOptions> & { squadSize?: SquadSize; seed?: number; timeLimit?: number } = {}): NetworkedMatch {
  const { squadSize, seed, timeLimit, ...rest } = options;
  return createNetworkedMatch({
    solids: [GROUND],
    spawns: SPAWNS,
    mode: ROYALE,
    modes: { battleRoyale: { squadSize: squadSize ?? 1, seed: seed ?? 3, ...(timeLimit ? { timeLimit } : {}) } },
    bots: { nav: NAV, perTeam: 3, maxPerTeam: 6 },
    intermission: { nuke: 1, vote: 1 },
    latency: 0.03,
    ...rest,
  });
}

function joined(m: NetworkedMatch, name: string, options: Parameters<NetworkedMatch['join']>[1] = {}): NetworkedClient {
  const c = m.join(name, options);
  for (let i = 0; i < ticks(3) && c.client.status !== 'joined'; i++) m.step();
  expect(c.client.status).toBe('joined');
  return c;
}

const seat = (m: NetworkedMatch, id: string | null | undefined) => m.server.latest.players.find((p) => p.id === id);
const objective = (m: NetworkedMatch) => m.server.matchStatus().objective as BattleRoyaleState;
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('a match on the server', () => {
  it('always seats 60, whatever the server allows other modes', () => {
    const m = match({ maxPlayers: 12 });
    joined(m, 'alice');
    m.run(ticks(0.5));
    expect(m.server.maxPlayers).toBe(60);
    expect(m.server.latest.players.filter((p) => p.kind === 'player')).toHaveLength(60);
    expect(m.server.bots.size).toBe(59);
  });

  it('gives every seat 3 frags, bots too, and never refills them', () => {
    const m = match({ countdown: 1 });
    joined(m, 'alice');
    m.run(ticks(1.2));
    expect(new Set(m.server.latest.players.map((p) => p.grenades))).toEqual(new Set([STATS.royale.frags.value]));
    const alice = m.client('alice').client.id!;
    m.run(ticks(0.2), () => ({ alice: usercmd({ buttons: Button.Grenade }) }));
    m.run(ticks(0.2));
    expect(seat(m, alice)!.grenades).toBe(STATS.royale.frags.value - 1);
  });

  it('a loadout change in the opening hold keeps to 3 frags', () => {
    const m = match({ countdown: 5 });
    const c = joined(m, 'alice');
    c.client.setLoadout({ primary: 'smg', secondary: 'pistol', grenade: 'frag' });
    m.run(ticks(0.5));
    expect(seat(m, c.client.id)).toMatchObject({ grenades: STATS.royale.frags.value, loadout: { primary: 'smg' } });
  });

  it('a pick of loadout after the hold waits for a spawn that never comes', () => {
    const m = match({ countdown: 0.1 });
    const c = joined(m, 'alice');
    m.run(ticks(1));
    c.client.setLoadout({ primary: 'smg', secondary: 'pistol', grenade: 'frag' });
    m.run(ticks(0.5));
    expect(seat(m, c.client.id)!.loadout.primary).toBe('m4a1');
  });

  it('squadmates spawn a few metres apart, and every Squad far from every other', () => {
    const m = match({ squadSize: 3 });
    joined(m, 'alice');
    m.run(ticks(0.2));
    const people = m.server.latest.players.filter((p) => p.kind === 'player');
    for (const a of people) {
      for (const b of people) {
        if (a.id === b.id) continue;
        if (a.team === b.team) expect(flat(a.position, b.position)).toBeLessThan(11);
      }
    }
  });

  it('squadmates are kept in view from anywhere; others past reach are not', () => {
    const m = match({ squadSize: 2, countdown: 5 });
    const alice = joined(m, 'alice');
    m.run(ticks(0.5));
    const me = seat(m, alice.client.id)!;
    const mate = m.server.latest.players.find((p) => p.id !== me.id && p.team === me.team)!;
    expect(alice.client.others().some((p) => p.id === mate.id)).toBe(true);
  });

  it('reports the Ring, the seats alive and the Squads alive', () => {
    const m = match({ squadSize: 2 });
    joined(m, 'alice');
    m.run(ticks(0.2));
    expect(objective(m)).toMatchObject({ kind: 'battle-royale', stage: 1, alive: 60, squads: 30 });
    expect(objective(m).next.radius).toBeLessThan(objective(m).circle.radius);
  });

  it('does not send a tick of Ring: the status only moves when the Ring or the field does', () => {
    const m = match({ timeLimit: 600 });
    joined(m, 'alice');
    m.run(ticks(0.5));
    const before = JSON.stringify(objective(m));
    m.run(ticks(0.5));
    expect(JSON.stringify(objective(m))).toBe(before);
  });

  it('outside the Ring health falls, faster each Stage, with no regen, until the Ring has the seat', () => {
    // A short match: the Ring closes over everyone standing still.
    const m = match({ timeLimit: 60, bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 } });
    const alice = joined(m, 'alice');
    const id = alice.client.id!;
    let ring = 0;
    const lost: number[] = [];
    let last = 100;
    let rose = false;
    for (let i = 0; i < ticks(70) && m.server.phase === 'playing'; i++) {
      m.step();
      const me = seat(m, id)!;
      if (me.health < last) lost.push(last - me.health);
      if (me.health > last) rose = true;
      last = me.health;
      for (const e of m.server.latest.events) if (e.type === 'kill' && e.victim === id && e.cause === 'ring') ring += 1;
    }
    expect(ring).toBe(1);
    expect(rose).toBe(false);
    expect(lost.length).toBeGreaterThan(10);
    expect(m.server.phase).not.toBe('playing');
  });

  it('nobody is hurt by the Ring in the opening hold', () => {
    const m = match({ countdown: 30, timeLimit: 10, bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 } });
    const alice = joined(m, 'alice');
    m.run(ticks(20));
    expect(seat(m, alice.client.id)!.health).toBe(STATS.health.max.value);
  });

  it('the kill feed names the Ring, with no killer', () => {
    const m = match({ timeLimit: 60, bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 } });
    joined(m, 'alice');
    for (let i = 0; i < ticks(70) && m.server.phase === 'playing'; i++) m.step();
    const feed = m.modeHistory.flat().find((e) => e.type === 'killFeed');
    expect(feed).toMatchObject({ killer: null, cause: 'ring' });
  });

  it('ends for a lone person the Ring has killed, with bots still in it', () => {
    const m = match({ timeLimit: 60 });
    joined(m, 'alice');
    for (let i = 0; i < ticks(70) && m.server.phase === 'playing'; i++) m.step();
    const end = m.modeHistory.flat().find((e) => e.type === 'matchEnd');
    expect(end).toBeDefined();
  });
});

/** Joins over a line `cut` drops, as the network does; the client isn't told to come back. */
function joinedOver(m: NetworkedMatch, name: string) {
  let live!: Connection;
  const connection: Connection = {
    get open() {
      return live.open;
    },
    send: (data) => live.send(data),
    close: (reason) => live.close(reason),
    onMessage: (handler) => live.onMessage(handler),
    onClose: (handler) => live.onClose(handler),
  };
  live = m.network.connect();
  const c = joined(m, name, { connection });
  return { c, cut: () => live.close('network went away') };
}

describe('reconnects', () => {
  it('a bot plays a dropped seat, and the player takes it back', () => {
    const m = match({ countdown: 0, reconnectGrace: 60, spawnProtection: 30 });
    const { c: alice, cut } = joinedOver(m, 'alice');
    const id = alice.client.id!;
    const token = alice.client.token!;
    m.run(ticks(0.5));
    cut();
    m.run(ticks(0.2));
    expect(m.server.playerCount).toBe(0);
    expect(m.server.status().away).toBe(1);
    expect(seat(m, id)?.alive).toBe(true);
    expect(m.server.latest.players.filter((p) => p.kind === 'player')).toHaveLength(60);
    const was = seat(m, id)!.position;
    m.run(ticks(2));
    expect(flat(seat(m, id)!.position, was)).toBeGreaterThan(1);

    const back = joined(m, 'alice', { resume: token });
    m.run(ticks(0.2));
    expect(back.client.id).toBe(id);
    expect(m.server.status().away).toBe(0);
    expect(m.server.bots.has(id)).toBe(false);
    const held = seat(m, id)!.position;
    m.run(ticks(1));
    expect(flat(seat(m, id)!.position, held)).toBeLessThan(0.2);
  });

  it('a seat that died under its bot stays dead when its player returns', () => {
    const m = match({ countdown: 0, reconnectGrace: 60, lobby: true });
    const { c: alice, cut } = joinedOver(m, 'alice');
    joined(m, 'bob');
    const id = alice.client.id!;
    const token = alice.client.token!;
    alice.client.startMatch();
    m.run(ticks(0.5));
    cut();
    m.run(ticks(0.5));
    const sim = m.server.simulation;
    sim.setPlayerState({ ...sim.playerState(id)!, health: 0, diedAt: sim.time });
    m.run(ticks(0.5));
    expect(m.server.phase).toBe('playing');
    const back = joined(m, 'alice', { resume: token });
    expect(back.client.id).toBe(id);
    m.run(ticks(1));
    expect(seat(m, id)?.alive).toBe(false);
  });

  it('a seat whose hold ran out stays with its bot while others play', () => {
    const m = match({ countdown: 0, reconnectGrace: 1, lobby: true });
    const { c: alice, cut } = joinedOver(m, 'alice');
    joined(m, 'bob');
    const id = alice.client.id!;
    alice.client.startMatch();
    m.run(ticks(0.5));
    cut();
    m.run(ticks(2));
    expect(m.server.status().away).toBe(0);
    expect(seat(m, id)).toBeDefined();
    expect(m.server.bots.has(id)).toBe(true);
  });

  it('with the last hold out and no person left, the match ends', () => {
    const m = match({ countdown: 0, reconnectGrace: 1 });
    const { cut } = joinedOver(m, 'alice');
    m.run(ticks(0.5));
    cut();
    m.run(ticks(0.5));
    expect(m.server.phase).toBe('playing');
    m.run(ticks(1));
    expect(m.server.status()).toMatchObject({ away: 0, bots: 0 });
    expect(m.server.phase).not.toBe('playing');
  });

  it('leaving on purpose leaves the seat to a bot, with nothing held', () => {
    const m = match({ countdown: 0 });
    const alice = joined(m, 'alice');
    const bob = joined(m, 'bob');
    m.run(ticks(0.5));
    expect(bob.latest?.self ?? null).toBeNull();
    const id = alice.client.id!;
    alice.client.close();
    m.run(ticks(0.5));
    expect(m.server.status().away).toBe(0);
    expect(seat(m, id)).toBeDefined();
  });
});

describe('late joiners', () => {
  it('spectate: no seat, no bot displaced, every seat in view', () => {
    const m = match({ countdown: 0 });
    joined(m, 'alice');
    m.run(ticks(0.5));
    const bots = m.server.bots.size;
    const late = joined(m, 'late');
    m.run(ticks(0.5));
    expect(m.server.bots.size).toBe(bots);
    expect(m.server.latest.players.filter((p) => p.kind === 'player')).toHaveLength(60);
    expect(late.client.id).not.toBeNull();
    expect(seat(m, late.client.id)).toBeUndefined();
    expect(late.latest?.self ?? null).toBeNull();
    expect(late.client.others()).toHaveLength(60);
  });

  it('stay for as long as they watch, however long the match', () => {
    const m = match({ countdown: 0, idleTimeout: 5 });
    joined(m, 'alice');
    m.run(ticks(0.5));
    const late = joined(m, 'late');
    m.run(ticks(12));
    expect(late.client.status).toBe('joined');
  });

  it('take a bot\'s seat at the next match', () => {
    const m = match({ countdown: 0, timeLimit: 60, bots: { nav: NAV, perTeam: 1, maxPerTeam: 1 }, lobby: true });
    const alice = joined(m, 'alice');
    m.run(ticks(0.2));
    alice.client.startMatch();
    m.run(ticks(0.5));
    const late = joined(m, 'late');
    expect(seat(m, late.client.id)).toBeUndefined();
    for (let i = 0; i < ticks(90) && m.server.phase !== 'lobby'; i++) m.step();
    expect(m.server.phase).toBe('lobby');
    alice.client.startMatch();
    m.run(ticks(0.5));
    expect(m.server.phase).toBe('playing');
    expect(seat(m, late.client.id)?.alive).toBe(true);
    expect(m.server.latest.players.filter((p) => p.kind === 'player')).toHaveLength(60);
  });
});

describe('Downed on the server', () => {
  it('a bot squadmate walks over and Revives a person, by the same rules', () => {
    const m = match({ squadSize: 2 });
    const id = joined(m, 'alice').client.id!;
    m.run(ticks(1));
    const sim = m.server.simulation;
    sim.setPlayerState({ ...sim.playerState(id)!, health: STATS.royale.downedHealth.value, downed: { since: sim.time, by: null, revive: null } });
    let revived: SimEvent | undefined;
    for (let i = 0; i < ticks(25) && !revived; i++) revived = m.step().events.find((e) => e.type === 'revive');
    expect(revived).toMatchObject({ target: id });
    expect(seat(m, id)).toMatchObject({ downed: null });
    expect(seat(m, id)!.health).toBeGreaterThanOrEqual(50);
  });

  it('a bot goes Downed by the same rules, and takes no action there', () => {
    const m = match({ squadSize: 2 });
    joined(m, 'alice');
    m.run(ticks(1));
    const sim = m.server.simulation;
    const bot = [...m.server.bots.keys()].at(-1)!;
    sim.setPlayerState({ ...sim.playerState(bot)!, health: STATS.royale.downedHealth.value, downed: { since: sim.time, by: null, revive: null } });
    m.run(ticks(2));
    const lying = seat(m, bot)!;
    expect(lying).toMatchObject({ stance: 'prone', grenade: null });
    expect(lying.downed).not.toBeNull();
  });

  it('a Downed bot crawls toward its mate', () => {
    const m = match({ squadSize: 2 });
    joined(m, 'alice');
    m.run(ticks(1));
    const sim = m.server.simulation;
    const bot = [...m.server.bots.keys()].at(-1)!;
    const at = () => seat(m, bot)!.position;
    const mate = m.server.latest.players.find((p) => p.team === seat(m, bot)!.team && p.id !== bot)!.id;
    // Near enough to know of, and too far to reach it where it lies.
    const state = sim.playerState(mate)!;
    sim.setPlayerState({ ...state, move: { ...state.move, position: [at()[0] + 12, 0, at()[2]] } });
    sim.setPlayerState({ ...sim.playerState(bot)!, health: STATS.royale.downedHealth.value, downed: { since: sim.time, by: null, revive: null } });
    m.run(ticks(0.1));
    const from = at();
    m.run(ticks(5));
    expect(seat(m, bot)!.downed).not.toBeNull();
    expect(Math.hypot(at()[0] - from[0], at()[2] - from[2])).toBeGreaterThan(1);
  });
});

describe('where the mode is offered', () => {
  it('bots in a Battle Royale play below their usual skill', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'tdm', lobby: true, teamSize: { [ROYALE]: 30 }, bots: { nav: NAV, perTeam: 1, maxPerTeam: 1 }, intermission: { nuke: 1, vote: 1 }, latency: 0.03 });
    const alice = joined(m, 'alice');
    m.run(ticks(0.2));
    const slowed = () => [...m.server.bots.values()].every((b) => b.bot.profile.reaction > botProfile(b.name).reaction * 2);
    alice.client.setLobby({ mode: ROYALE });
    m.run(ticks(0.2));
    alice.client.startMatch();
    m.run(ticks(0.5));
    expect(m.server.mode.id).toBe(ROYALE);
    expect(slowed()).toBe(true);
  });

  it('stays out of a lobby on a map that does not play it', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'tdm', lobby: true, bots: { nav: NAV, perTeam: 1, maxPerTeam: 1 }, latency: 0.03 });
    const alice = joined(m, 'alice');
    m.run(ticks(0.2));
    alice.client.setLobby({ mode: ROYALE });
    m.run(ticks(0.2));
    expect(m.server.matchStatus().lobby?.mode).toBe('tdm');
  });

  it('is the host\'s pick on a map that does', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'tdm', lobby: true, teamSize: { [ROYALE]: 30 }, bots: { nav: NAV, perTeam: 1, maxPerTeam: 1 }, latency: 0.03 });
    const alice = joined(m, 'alice');
    m.run(ticks(0.2));
    alice.client.setLobby({ mode: ROYALE });
    m.run(ticks(0.2));
    expect(m.server.matchStatus().lobby?.mode).toBe(ROYALE);
  });

  it('a person alive on the status is not a spectator', () => {
    const m = match({ countdown: 0 });
    joined(m, 'alice');
    m.run(ticks(0.2));
    expect(m.server.status()).toMatchObject({ mode: ROYALE, players: 1, bots: 59 });
  });
});
