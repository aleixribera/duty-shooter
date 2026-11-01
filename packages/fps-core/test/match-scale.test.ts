import { describe, expect, it, vi } from 'vitest';
import { Bot, MATCH_SCALES, MODE_IDS, Simulation, WIDE_MAP, WIDE_SCALE, botProfile, box, buildNavGraph, createWorld, type BotView, type NavGraph, type PlayerOutput, type SimEvent, type SpawnPoint, type TickOutput, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { ticks } from './support/movement';

const GROUND = box({ min: [-400, -1, -400], max: [400, 0, 400], material: 'concrete' });
const area = (half: number): [number, number][] => [[-half, -half], [half, -half], [half, half], [-half, half]];
const smallNav = buildNavGraph(createWorld([GROUND]), { area: area(30) });
const wideNav = buildNavGraph(createWorld([GROUND]), { area: area(300), spacing: 12 });
const SPAWNS: readonly SpawnPoint[] = [[-20, -20], [20, -20], [-20, 20], [20, 20]].map(([x, z]) => ({ position: [x!, 0, z!], yaw: 0 }));

describe('seat and bot limits', () => {
  it.each(MODE_IDS)('%s keeps its 32 seats and 6 bots a side', (mode) => {
    expect(MATCH_SCALES[mode]).toMatchObject({ seats: 32, botsPerTeam: 6 });
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode, maxPlayers: 60, bots: { nav: smallNav, perTeam: 3, maxPerTeam: 30 } });
    expect(m.server.maxPlayers).toBe(32);
    expect(m.server.maxBotsPerTeam).toBe(6);
  });

  it('a host still sets fewer seats than the mode allows', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'tdm', maxPlayers: 12, bots: { nav: smallNav, perTeam: 3, maxPerTeam: 2 } });
    expect(m.server.maxPlayers).toBe(12);
    expect(m.server.maxBotsPerTeam).toBe(2);
  });

  it('a wide match seats 60 and fills them with bots', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'ffa', maxPlayers: 60, scale: WIDE_SCALE, net: WIDE_MAP, bots: { nav: smallNav, perTeam: 30, maxPerTeam: 30 } });
    m.join('alice');
    m.run(ticks(0.5));
    expect(m.server.maxPlayers).toBe(60);
    expect(m.server.playerCount + m.server.bots.size).toBe(60);
  });
});

describe('how often a bot thinks', () => {
  /** Who thought, how often it was told to, over the ticks of `run`. */
  function told(m: NetworkedMatch): Map<string, number | undefined> {
    const spies = [...m.server.bots].map(([id, seat]) => [id, vi.spyOn(seat.bot, 'think')] as const);
    m.step();
    return new Map(spies.map(([id, spy]) => [id, (spy.mock.lastCall?.[0] as BotView).thinkEvery]));
  }

  it('leaves bots near a person at the full rate and slows those far from everybody', () => {
    // Bots spawn in pairs: some beside alice at the first spawn, some 400 m away.
    const spawns: SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }, { position: [400 / 2, 0, 200], yaw: 0 }];
    const m = createNetworkedMatch({ solids: [GROUND], spawns, mode: 'ffa', maxPlayers: 60, scale: WIDE_SCALE, net: WIDE_MAP, bots: { nav: wideNav, perTeam: 4, maxPerTeam: 30 } });
    m.join('alice');
    m.run(ticks(1));
    const alice = m.server.latest.players.find((p) => !m.server.bots.has(p.id))!;
    const far = (p: PlayerOutput) => Math.hypot(p.position[0] - alice.position[0], p.position[2] - alice.position[2]) > WIDE_SCALE.farBots!.range;
    const rates = told(m);
    const bots = m.server.latest.players.filter((p) => m.server.bots.has(p.id));
    expect(bots.some(far) && bots.some((p) => !far(p))).toBe(true);
    for (const b of bots) expect(rates.get(b.id), b.id).toBe(far(b) ? WIDE_SCALE.farBots!.thinkEvery : undefined);
  });

  it('never slows a bot in a team mode, however far it stands', () => {
    const spawns: SpawnPoint[] = [{ position: [-300, 0, 0], yaw: 0 }, { position: [300, 0, 0], yaw: 0 }];
    const m = createNetworkedMatch({ solids: [GROUND], spawns, mode: 'ffa', bots: { nav: wideNav, perTeam: 3 } });
    m.join('alice');
    m.run(ticks(1));
    expect([...told(m).values()].every((every) => every === undefined)).toBe(true);
  });
});

/** A bot fighting a still target, thinking every `thinkEvery` ticks; returns the first tick a shot hit the target, or null. */
function firstHit(thinkEvery: number, nav: NavGraph, world: ReturnType<typeof createWorld>, botAt: Vec3, botYaw: number, targetAt: Vec3): number | null {
  const sim = new Simulation(world);
  sim.addPlayer({ id: 'b', team: 1, position: botAt, yaw: botYaw });
  sim.addPlayer({ id: 't', team: 2, position: targetAt, yaw: 0 });
  const bot = new Bot('b', botProfile('Kestrel'), nav, world);
  let out: TickOutput = sim.output();
  let events: readonly SimEvent[] = [];
  for (let i = 0; i < ticks(12); i++) {
    const self = out.players.find((p) => p.id === 'b')!;
    const cmd: UserCmd = bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events, isEnemy: (o: PlayerOutput) => o.team !== self.team, thinkEvery });
    out = sim.step({ b: cmd, t: usercmd({ yaw: 0 }) });
    events = out.events;
    if (events.some((e) => e.type === 'hit' && e.victim === 't')) return i;
  }
  return null;
}

describe('a bot thinking less often', () => {
  const world = createWorld([GROUND]);
  const nav = buildNavGraph(world, { area: area(40) });

  it('still turns on a target and hits it, about as soon', () => {
    const quick = firstHit(1, nav, world, [0, 0, 0], Math.PI / 2, [0, 0, -20]);
    const slow = firstHit(4, nav, world, [0, 0, 0], Math.PI / 2, [0, 0, -20]);
    expect(quick).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(slow!).toBeLessThan(quick! + ticks(1));
  });

  it('holds its last usercmd between thoughts', () => {
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'b', team: 1, position: [0, 0, 0], yaw: 0 });
    const bot = new Bot('b', botProfile('Kestrel'), nav, world);
    const cmds: UserCmd[] = [];
    let out = sim.output();
    for (let i = 0; i < 40; i++) {
      const self = out.players.find((p) => p.id === 'b')!;
      const cmd = bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events: [], isEnemy: () => false, thinkEvery: 4 });
      cmds.push(cmd);
      out = sim.step({ b: cmd });
    }
    const fresh = new Set(cmds).size;
    expect(fresh).toBeGreaterThanOrEqual(10);
    expect(fresh).toBeLessThanOrEqual(12);
  });
});

describe('the sticky fields', () => {
  it('reach a client as the server has them through a whole match of kills, an end and a vote', () => {
    const m = createNetworkedMatch({ solids: [GROUND], spawns: SPAWNS, mode: 'ffa', modes: { ffa: { killLimit: 3, timeLimit: null } }, latency: 0, bots: { nav: smallNav, perTeam: 3 } });
    const c = m.join('alice');
    const phases = new Set<string>();
    /** What the server had at each tick, for the snapshot of that tick to arrive against. */
    const history = new Map<number, { status: ReturnType<typeof m.server.matchStatus>; kills: number }>();
    let kills = 0;
    let checked = 0;
    for (let i = 0; i < ticks(40); i++) {
      m.step();
      kills += m.server.latest.events.filter((e) => e.type === 'kill').length;
      history.set(m.server.latest.tick, { status: m.server.matchStatus(), kills });
      const seen = c.client;
      const then = seen.snapshot ? history.get(seen.snapshot.tick) : undefined;
      if (!then) continue;
      expect(seen.match).toEqual(then.status);
      phases.add(then.status.phase);
      if (!phases.has('nuke')) expect(seen.scores.reduce((sum, s) => sum + s.kills, 0)).toBe(then.kills);
      checked += 1;
    }
    expect(kills).toBeGreaterThanOrEqual(3);
    expect(checked).toBeGreaterThan(ticks(30));
    expect([...phases]).toEqual(expect.arrayContaining(['playing', 'nuke']));
  });
});
