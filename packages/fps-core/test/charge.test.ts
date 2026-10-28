import { describe, expect, it } from 'vitest';
import { TICK_SECONDS, createWorld, planCharge, siteCentre, targetSite, usercmd, type ChargeState, type ChargeSite, type ModeContext, type ModeEvent, type PlayerOutput, type SimEvent, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { Charge, DEFUSE_TIME, FREEZE_TIME, FUSE_TIME, PICKUP_RANGE, PLANT_TIME, ROUND_END_TIME, ROUND_TIME } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const SITES: readonly ChargeSite[] = [
  { id: 'A', name: 'West', min: [-34, 0, -4], max: [-26, 3, 4] },
  { id: 'B', name: 'East', min: [26, 0, -4], max: [34, 3, 4] },
];
const ATTACK_SPAWNS: readonly SpawnPoint[] = [1, 2, 3].map((i) => ({ position: [i * 2, 0, -40], yaw: 0 }));
const DEFEND_SPAWNS: readonly SpawnPoint[] = [1, 2, 3].map((i) => ({ position: [i * 2, 0, 40], yaw: Math.PI }));
const WORLD = createWorld([FLOOR]);

/** Blue players b1..b3 (team 1, attacking first) and orange o1..o3 (team 2). */
const ENTRANTS = [1, 2, 3].flatMap((i) => [
  { id: `b${i}`, name: `b${i}`, team: 1 },
  { id: `o${i}`, name: `o${i}`, team: 2 },
]);
const SITE_A: Vec3 = [-30, 0, 0];

/** A running Charge match: place players, kill them, hold use, step ticks, read the state. */
function charge(options: { roundsToWin?: number } = {}) {
  const mode = new Charge(options);
  mode.start(ENTRANTS);
  const at = new Map<string, Vec3>(ENTRANTS.map((e, i) => [e.id, [i * 3, 0, e.team === 1 ? -40 : 40] as Vec3]));
  const alive = new Map<string, boolean>(ENTRANTS.map((e) => [e.id, true]));
  const using = new Set<string>();
  let tick = 0;
  let next: SimEvent[] = [];
  const players = (): PlayerOutput[] =>
    ENTRANTS.map((e) => ({ id: e.id, team: e.team, alive: alive.get(e.id), kind: 'player', position: at.get(e.id)!, landing: null }) as unknown as PlayerOutput);
  const ctx = (): ModeContext => ({
    tick,
    time: tick * TICK_SECONDS,
    matchTime: tick * TICK_SECONDS,
    players: players(),
    spawns: [],
    teamSpawns: [ATTACK_SPAWNS, DEFEND_SPAWNS],
    world: WORLD,
    zones: [],
    sites: SITES,
    using,
  });
  const events: ModeEvent[] = [];
  const m = {
    mode,
    ctx,
    events,
    state: () => mode.objective(),
    move(id: string, position: Vec3) {
      at.set(id, position);
    },
    hold(id: string, held = true) {
      if (held) using.add(id);
      else using.delete(id);
    },
    kill(...ids: string[]) {
      for (const id of ids) {
        alive.set(id, false);
        next.push({ type: 'kill', killer: null, victim: id, cause: 'fall', zone: null, weapon: null });
      }
    },
    /** Events for the next tick only (shots, hits). */
    happen(...e: SimEvent[]) {
      next.push(...e);
    },
    run(seconds: number) {
      for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
        tick++;
        const out = mode.onEvents(next, ctx());
        next = [];
        events.push(...out);
        // As the server does: a new round brings everyone back.
        if (out.some((e) => e.type === 'roundStart')) {
          for (const e of ENTRANTS) {
            alive.set(e.id, true);
            at.set(e.id, mode.chooseSpawn(e.id, ctx()).position);
          }
        }
      }
    },
    /** Past the freeze, into play. */
    live() {
      m.run(FREEZE_TIME + 0.05);
      expect(m.state().phase).toBe('live');
    },
    /** The carrier walks into site A and holds use until it is planted. */
    plant() {
      const carrier = m.state().carrier!;
      m.move(carrier, SITE_A);
      m.hold(carrier);
      m.run(PLANT_TIME + 0.05);
      m.hold(carrier, false);
      expect(m.state().phase).toBe('planted');
    },
    roundEnds: () => events.filter((e) => e.type === 'roundEnd'),
  };
  return m;
}

describe('Charge rounds', () => {
  it('opens with a frozen freeze, then 90 s of play', () => {
    const m = charge();
    expect(m.state()).toMatchObject({ round: 1, attackers: 1, phase: 'freeze', remaining: FREEZE_TIME, planted: null });
    expect(m.mode.frozen()).toBe(true);
    m.live();
    expect(m.mode.frozen()).toBe(false);
    expect(m.state().remaining).toBeCloseTo(ROUND_TIME - 0.05, 1);
  });

  it('gives the charge to an attacker, a different one each round', () => {
    const m = charge();
    const first = m.state().carrier;
    expect(first).toMatch(/^b/);
    m.live();
    m.kill('o1', 'o2', 'o3');
    m.run(ROUND_END_TIME + 0.05);
    expect(m.state()).toMatchObject({ round: 2, phase: 'freeze' });
    expect(m.state().carrier).toMatch(/^b/);
    expect(m.state().carrier).not.toBe(first);
  });

  it('never lets anyone respawn within a round', () => {
    expect(new Charge().canRespawn()).toBe(false);
  });

  it('starts each side at its own spawns, and swaps the spawns with the sides', () => {
    const m = charge();
    expect(ATTACK_SPAWNS.map((s) => s.position)).toContainEqual(m.mode.chooseSpawn('b1', m.ctx()).position);
    expect(DEFEND_SPAWNS.map((s) => s.position)).toContainEqual(m.mode.chooseSpawn('o1', m.ctx()).position);
  });
});

describe('Charge planting and defusing', () => {
  it('plants after 4 s of holding use in a site, and starts the 40 s fuse', () => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.move(carrier, SITE_A);
    m.hold(carrier);
    m.run(PLANT_TIME - 0.1);
    expect(m.state().action).toMatchObject({ player: carrier, kind: 'plant' });
    expect(m.state().phase).toBe('live');
    m.run(0.15);
    expect(m.state()).toMatchObject({ phase: 'planted', carrier: null, planted: { site: 'A', position: SITE_A }, action: null });
    expect(m.state().remaining).toBeGreaterThan(FUSE_TIME - 0.1);
    expect(m.events).toContainEqual(expect.objectContaining({ type: 'charge', action: 'plant', player: carrier, site: 'A' }));
  });

  it('plants only in a site, and only the carrier', () => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.move(carrier, [0, 0, 0]);
    m.hold(carrier);
    const other = ['b1', 'b2', 'b3'].find((id) => id !== carrier)!;
    m.move(other, SITE_A);
    m.hold(other);
    m.run(PLANT_TIME + 1);
    expect(m.state()).toMatchObject({ phase: 'live', action: null, planted: null });
  });

  it.each([
    ['moving', (m: ReturnType<typeof charge>, id: string) => m.move(id, [SITE_A[0] + 1, 0, SITE_A[2]])],
    ['firing', (m: ReturnType<typeof charge>, id: string) => m.happen({ type: 'shot', shooter: id } as SimEvent)],
    ['being hurt', (m: ReturnType<typeof charge>, id: string) => m.happen({ type: 'hit', shooter: 'o1', victim: id } as SimEvent)],
    ['letting go of use', (m: ReturnType<typeof charge>, id: string) => m.hold(id, false)],
  ])('cancels a plant on %s, losing its progress', (_, disturb) => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.move(carrier, SITE_A);
    m.hold(carrier);
    m.run(PLANT_TIME - 1);
    disturb(m, carrier);
    m.run(TICK_SECONDS);
    // Gone, or (still holding, where it stands now) begun afresh.
    expect(m.state().action?.progress ?? 0).toBeLessThan(0.01);
    // Holding on, it starts over: the full time again.
    m.hold(carrier);
    m.run(PLANT_TIME - 0.1);
    expect(m.state().phase).toBe('live');
    m.run(0.15);
    expect(m.state().phase).toBe('planted');
  });

  it('defuses after 6 s of a defender holding use beside the charge', () => {
    const m = charge();
    m.live();
    m.plant();
    m.move('o2', [SITE_A[0] + 1, 0, SITE_A[2]]);
    m.hold('o2');
    m.run(DEFUSE_TIME - 0.1);
    expect(m.state().action).toMatchObject({ player: 'o2', kind: 'defuse' });
    m.run(0.15);
    expect(m.state()).toMatchObject({ phase: 'over', outcome: { winner: 2, reason: 'defused' } });
    expect(m.events).toContainEqual(expect.objectContaining({ type: 'charge', action: 'defuse', player: 'o2' }));
  });

  it('cancels a defuse when the defender is hurt or killed', () => {
    const m = charge();
    m.live();
    m.plant();
    m.move('o2', [SITE_A[0] + 1, 0, SITE_A[2]]);
    m.hold('o2');
    m.run(DEFUSE_TIME - 1);
    m.happen({ type: 'hit', shooter: 'b1', victim: 'o2' } as SimEvent);
    m.run(TICK_SECONDS);
    expect(m.state().action).toBeNull();
    m.run(DEFUSE_TIME - 1);
    m.kill('o2');
    m.run(TICK_SECONDS * 2);
    expect(m.state()).toMatchObject({ phase: 'planted', action: null });
  });

  it('lets only defenders within reach defuse', () => {
    const m = charge();
    m.live();
    m.plant();
    m.hold('b2');
    m.move('b2', SITE_A);
    m.move('o1', [SITE_A[0] + 3, 0, SITE_A[2]]);
    m.hold('o1');
    m.run(DEFUSE_TIME + 1);
    expect(m.state()).toMatchObject({ phase: 'planted', action: null });
  });
});

describe('Charge carrier', () => {
  it('drops the charge where the carrier dies, for any attacker to pick up', () => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.move(carrier, [5, 0, -10]);
    m.run(TICK_SECONDS);
    m.kill(carrier);
    m.run(TICK_SECONDS);
    expect(m.state()).toMatchObject({ carrier: null, dropped: [5, 0, -10] });
    expect(m.events).toContainEqual(expect.objectContaining({ type: 'charge', action: 'drop', player: carrier }));
    // A defender walking over it leaves it be.
    m.move('o1', [5, 0, -10]);
    m.run(0.5);
    expect(m.state().carrier).toBeNull();
    const other = ['b1', 'b2', 'b3'].find((id) => id !== carrier)!;
    m.move(other, [5.5, 0, -10]);
    m.run(TICK_SECONDS);
    expect(m.state()).toMatchObject({ carrier: other, dropped: null });
    expect(m.events).toContainEqual(expect.objectContaining({ type: 'charge', action: 'pickup', player: other }));
  });

  it('drops the charge where a carrier who leaves last stood', () => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.move(carrier, [7, 0, -12]);
    m.run(TICK_SECONDS);
    m.mode.leave(carrier);
    m.run(TICK_SECONDS);
    expect(m.state().dropped).toEqual([7, 0, -12]);
  });
});

describe('Charge round outcomes', () => {
  it('goes to the attackers on the detonation', () => {
    const m = charge();
    m.live();
    m.plant();
    m.run(FUSE_TIME + 0.05);
    expect(m.state().outcome).toEqual({ winner: 1, reason: 'detonated' });
    expect(m.events).toContainEqual(expect.objectContaining({ type: 'charge', action: 'detonate', site: 'A' }));
  });

  it('goes to the attackers when every defender is dead', () => {
    const m = charge();
    m.live();
    m.kill('o1', 'o2', 'o3');
    m.run(TICK_SECONDS);
    expect(m.state().outcome).toEqual({ winner: 1, reason: 'eliminated' });
  });

  it('goes to the defenders when every attacker dies before the plant', () => {
    const m = charge();
    m.live();
    m.kill('b1', 'b2', 'b3');
    m.run(TICK_SECONDS);
    expect(m.state().outcome).toEqual({ winner: 2, reason: 'eliminated' });
  });

  it('does not end when every attacker dies after the plant: the defenders must defuse', () => {
    const m = charge();
    m.live();
    m.plant();
    m.kill('b1', 'b2', 'b3');
    m.run(1);
    expect(m.state().phase).toBe('planted');
    m.run(FUSE_TIME);
    expect(m.state().outcome).toEqual({ winner: 1, reason: 'detonated' });
  });

  it('goes to the defenders when the round runs out with nothing planted', () => {
    const m = charge();
    m.live();
    m.run(ROUND_TIME - 0.5);
    expect(m.state().phase).toBe('live');
    m.run(0.6);
    expect(m.state().outcome).toEqual({ winner: 2, reason: 'time' });
    expect(m.roundEnds()).toEqual([{ type: 'roundEnd', round: 1, winner: 2, reason: 'time' }]);
  });

  it('shows the result for a moment, then starts the next round with everyone back', () => {
    const m = charge();
    m.live();
    m.kill('o1', 'o2', 'o3', 'b1');
    m.run(ROUND_END_TIME - 0.1);
    expect(m.state()).toMatchObject({ round: 1, phase: 'over' });
    m.run(0.15);
    expect(m.state()).toMatchObject({ round: 2, phase: 'freeze', outcome: null, planted: null, dropped: null });
    expect(m.events).toContainEqual({ type: 'roundStart', round: 2, attackers: 1 });
  });
});

describe('Charge match', () => {
  /** Plays a round the attackers win by wiping out the defenders. */
  const attackersWin = (m: ReturnType<typeof charge>) => {
    m.live();
    const defenders = ['b', 'o'].map((t) => ['1', '2', '3'].map((n) => t + n))[m.state().attackers === 1 ? 1 : 0]!;
    m.kill(...defenders);
    m.run(ROUND_END_TIME + 0.05);
  };

  it('swaps sides after round 3, spawns and all', () => {
    const m = charge();
    for (let i = 0; i < 3; i++) attackersWin(m);
    expect(m.state()).toMatchObject({ round: 4, attackers: 2 });
    expect(m.state().carrier).toMatch(/^o/);
    expect(ATTACK_SPAWNS.map((s) => s.position)).toContainEqual(m.mode.chooseSpawn('o1', m.ctx()).position);
    expect(DEFEND_SPAWNS.map((s) => s.position)).toContainEqual(m.mode.chooseSpawn('b1', m.ctx()).position);
  });

  it('is won by the first team to 4 rounds, the round wins being the team scores', () => {
    const m = charge();
    // Blue attack and win rounds 1 to 3; orange attack round 4 and win it; blue, now defending, take round 5 and the match.
    for (let i = 0; i < 3; i++) attackersWin(m);
    expect(m.mode.teamScores()).toEqual([
      { team: 1, score: 3 },
      { team: 2, score: 0 },
    ]);
    expect(m.mode.result()).toBeNull();
    attackersWin(m);
    expect(m.mode.teamScores()).toEqual([
      { team: 1, score: 3 },
      { team: 2, score: 1 },
    ]);
    m.live();
    m.kill('o1', 'o2', 'o3');
    m.run(TICK_SECONDS);
    expect(m.mode.result()).toEqual({ winner: 1, winnerName: 'Blue', draw: false, reason: 'roundLimit' });
    // The match is over: no more rounds.
    m.run(ROUND_END_TIME + 1);
    expect(m.state().round).toBe(5);
  });

  it('scores plants and defuses on the scoreboard', () => {
    const m = charge();
    m.live();
    const carrier = m.state().carrier!;
    m.plant();
    const row = m.mode.scores().find((s) => s.id === carrier)!;
    expect(row.score).toBeGreaterThan(0);
  });
});

describe('Charge on the server', () => {
  const match = () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [...ATTACK_SPAWNS, ...DEFEND_SPAWNS], teamSpawns: [ATTACK_SPAWNS, DEFEND_SPAWNS], sites: SITES, mode: 'charge', latency: 0.03, seed: 4 });
    const ada = m.join('Ada');
    const bo = m.join('Bo');
    return { m, ada, bo };
  };
  const forward = usercmd({ forward: 1 });
  const id = (c: { client: { id: string | null } }) => c.client.id!;
  const at = (m: ReturnType<typeof match>['m'], who: string) => m.server.simulation.playerState(who)!.move.position;

  it('holds everyone still in the freeze, looking around allowed, then lets them move', () => {
    const { m, ada } = match();
    for (let i = 0; i < ticks(0.5); i++) m.step();
    expect(m.server.mode.frozen()).toBe(true);
    const start = at(m, id(ada));
    for (let i = 0; i < ticks(2); i++) m.step({ Ada: { ...forward, yaw: 1 } });
    expect(Math.hypot(at(m, id(ada))[0] - start[0], at(m, id(ada))[2] - start[2])).toBeLessThan(0.01);
    expect(m.server.simulation.playerState(id(ada))!.cmdYaw).toBeCloseTo(1);
    for (let i = 0; i < ticks(FREEZE_TIME); i++) m.step({ Ada: forward });
    expect(m.server.mode.frozen()).toBe(false);
    expect(Math.hypot(at(m, id(ada))[0] - start[0], at(m, id(ada))[2] - start[2])).toBeGreaterThan(2);
  });

  it('re-arms a player who changes loadout in the freeze, where they stand', () => {
    const { m, ada } = match();
    for (let i = 0; i < ticks(1); i++) m.step();
    ada.client.setLoadout({ primary: 'shotgun', secondary: 'pistol', grenade: 'frag' });
    for (let i = 0; i < ticks(0.5); i++) m.step();
    expect(m.server.simulation.playerState(id(ada))!.loadout.primary).toBe('shotgun');
  });

  it('puts everyone back at their side, alive, when the next round starts', () => {
    const { m, ada, bo } = match();
    for (let i = 0; i < ticks(FREEZE_TIME + 0.5); i++) m.step();
    // Ada walks off; Bo falls dead (as if shot): one side wiped out ends the round.
    for (let i = 0; i < ticks(1); i++) m.step({ Ada: forward });
    const bs = m.server.simulation.playerState(id(bo))!;
    m.server.simulation.setPlayerState({ ...bs, health: 0, diedAt: m.server.simulation.time });
    const ends = () => m.modeHistory.flat().filter((e) => e.type === 'roundEnd').length;
    for (let i = 0; i < ticks(1) && ends() === 0; i++) m.step();
    expect(ends()).toBe(1);
    // No respawn within the round.
    for (let i = 0; i < ticks(ROUND_END_TIME - 1); i++) m.step();
    expect(m.server.simulation.playerState(id(bo))!.health).toBe(0);
    for (let i = 0; i < ticks(1.5); i++) m.step();
    expect(m.modeHistory.flat()).toContainEqual({ type: 'roundStart', round: 2, attackers: 1 });
    const spawns = [...ATTACK_SPAWNS, ...DEFEND_SPAWNS].map((s) => s.position.join());
    for (const c of [ada, bo]) {
      expect(m.server.simulation.playerState(id(c))!.health).toBeGreaterThan(0);
      expect(spawns).toContain(at(m, id(c)).join());
    }
    // The snapshots carry the round.
    expect(ada.client.match?.objective).toMatchObject({ kind: 'charge', round: 2, phase: 'freeze' });
  });

  it('makes a player who joins mid-round wait, dead, for the next round', () => {
    const { m } = match();
    for (let i = 0; i < ticks(FREEZE_TIME + 1); i++) m.step();
    const cy = m.join('Cy');
    for (let i = 0; i < ticks(1); i++) m.step();
    expect(m.server.simulation.playerState(cy.client.id!)!.health).toBe(0);
  });
});

describe('the Charge bot planner', () => {
  const bot = (id: string, x: number, z = -20) => ({ id, position: [x, 0, z] as Vec3 });
  const state = (extra: Partial<ChargeState> = {}): ChargeState => ({
    kind: 'charge',
    round: 1,
    attackers: 1,
    phase: 'live',
    remaining: 60,
    carrier: null,
    dropped: null,
    planted: null,
    action: null,
    outcome: null,
    ...extra,
  });

  it('sends the carrier to plant at the round target, two escorts with it and the rest ahead to the site', () => {
    const bots = [bot('a', 0), bot('b', 2), bot('c', 4), bot('d', 30), bot('e', 32)];
    const plan = planCharge(1, bots, bots, SITES, state({ carrier: 'a' }));
    const target = targetSite(SITES, 1)!;
    expect(plan.get('a')).toMatchObject({ position: siteCentre(target), use: true });
    expect(plan.get('b')?.position).toEqual([0, 0, -20]);
    expect(plan.get('c')?.position).toEqual([0, 0, -20]);
    expect(plan.get('d')?.position).toEqual(siteCentre(target));
    expect(plan.get('e')?.position).toEqual(siteCentre(target));
    expect(plan.get('d')?.use).toBeFalsy();
  });

  it('picks the target afresh each round, keeping it for the whole round', () => {
    const targets = new Set([1, 2, 3, 4, 5, 6, 7].map((r) => targetSite(SITES, r)!.id));
    expect(targets).toEqual(new Set(['A', 'B']));
  });

  it('sends the nearest attacker to fetch a dropped charge', () => {
    const bots = [bot('a', 0), bot('b', 10), bot('c', 20)];
    const plan = planCharge(1, bots, bots, SITES, state({ dropped: [11, 0, -20] }));
    expect(plan.get('b')?.position).toEqual([11, 0, -20]);
    expect(plan.get('b')!.radius).toBeLessThan(PICKUP_RANGE);
  });

  it('splits the defenders across both sites', () => {
    const bots = [bot('a', 0, 20), bot('b', 1, 20), bot('c', 2, 20), bot('d', 3, 20)];
    const plan = planCharge(2, bots, bots, SITES, state());
    const at = [...plan.values()].map((o) => SITES.find((site) => siteCentre(site).join() === o.position.join())!.id);
    expect(at.filter((x) => x === 'A')).toHaveLength(2);
    expect(at.filter((x) => x === 'B')).toHaveLength(2);
  });

  it('sends the nearest defender to defuse, under fire only when the fuse is nearly out', () => {
    const bots = [bot('a', -29, 2), bot('b', 0, 20)];
    const planted = { site: 'A', position: SITE_A };
    const calm = planCharge(2, bots, bots, SITES, state({ phase: 'planted', planted, remaining: 30 }));
    expect(calm.get('a')).toMatchObject({ position: SITE_A, use: true, urgent: false });
    expect(calm.get('b')).toMatchObject({ position: SITE_A });
    expect(calm.get('b')?.use).toBeFalsy();
    const late = planCharge(2, bots, bots, SITES, state({ phase: 'planted', planted, remaining: DEFUSE_TIME + 1 }));
    expect(late.get('a')).toMatchObject({ use: true, urgent: true });
  });

  it('tells the side the clock is against to hurry: the attackers late with no plant, the defenders with the fuse running down', () => {
    const attackers = [bot('a', 0), bot('b', 2)];
    expect([...planCharge(1, attackers, attackers, SITES, state({ carrier: 'a' })).values()].some((o) => o.hurry)).toBe(false);
    expect([...planCharge(1, attackers, attackers, SITES, state({ carrier: 'a', remaining: 20 })).values()].every((o) => o.hurry)).toBe(true);
    const defenders = [bot('c', -29, 2), bot('d', 0, 20)];
    const planted = { site: 'A', position: SITE_A };
    expect([...planCharge(2, defenders, defenders, SITES, state({ phase: 'planted', planted, remaining: 30 })).values()].some((o) => o.hurry)).toBe(false);
    expect([...planCharge(2, defenders, defenders, SITES, state({ phase: 'planted', planted, remaining: DEFUSE_TIME + 5 })).values()].every((o) => o.hurry)).toBe(true);
    // Attackers guarding their plant are in no hurry.
    expect([...planCharge(1, attackers, attackers, SITES, state({ phase: 'planted', planted, remaining: 5 })).values()].some((o) => o.hurry)).toBe(false);
  });
});
