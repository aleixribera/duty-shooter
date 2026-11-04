import { describe, expect, it } from 'vitest';
import {
  Bot,
  DEG,
  Simulation,
  SoundTraps,
  TRAP_HEARD,
  TRAP_REACH,
  TRAP_REST,
  angleDelta,
  botProfile,
  buildNavGraph,
  createWorld,
  type BotView,
  type PlayerOutput,
  type SoundTrap,
  type TrapEvent,
  type Vec3,
} from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { eventReach } from '../src/net/relevance';
import { FLOOR, ticks } from './support/movement';

const body = (id: string, at: Vec3, over: Partial<PlayerOutput> = {}): PlayerOutput =>
  ({ id, team: 1, kind: 'player', alive: true, downed: null, position: at, movement: 'sprint', landing: null, ...over }) as unknown as PlayerOutput;

const BIRDS: SoundTrap = { kind: 'birds', position: [0, 6, 0] };
const GRAVEL: SoundTrap = { kind: 'gravel', position: [50, 0.3, 0] };

describe('a sound trap', () => {
  it('goes off for a body running, sliding or landing within reach of it, once, at its own spot', () => {
    for (const over of [{ movement: 'sprint' }, { movement: 'tacticalSprint' }, { movement: 'slide' }, { movement: 'walk', landing: { at: 1 } }] as Partial<PlayerOutput>[]) {
      const traps = new SoundTraps([BIRDS, GRAVEL]);
      expect(traps.step([body('a', [TRAP_REACH - 1, 0, 0], over)], 5)).toEqual([{ type: 'trap', kind: 'birds', position: [0, 6, 0], player: 'a' }]);
    }
  });

  it('stays quiet for a walk, a crouch, a body out of reach, far below it, downed or out', () => {
    const traps = new SoundTraps([BIRDS]);
    expect(traps.step([body('a', [2, 0, 0], { movement: 'walk' })], 1)).toEqual([]);
    expect(traps.step([body('a', [2, 0, 0], { movement: 'walk', stance: 'crouch' })], 1)).toEqual([]);
    expect(traps.step([body('a', [TRAP_REACH + 0.5, 0, 0])], 1)).toEqual([]);
    expect(traps.step([body('a', [0, 6 + 12, 0])], 1)).toEqual([]);
    expect(traps.step([body('a', [1, 0, 0], { downed: {} as never })], 1)).toEqual([]);
    expect(traps.step([body('a', [1, 0, 0], { alive: false })], 1)).toEqual([]);
  });

  it('rests after going off, and is set again by a new match', () => {
    const traps = new SoundTraps([BIRDS]);
    const runner = [body('a', [1, 0, 0])];
    expect(traps.step(runner, 10)).toHaveLength(1);
    expect(traps.step(runner, 10 + TRAP_REST - 1)).toEqual([]);
    expect(traps.step(runner, 10 + TRAP_REST)).toHaveLength(1);
    expect(traps.step(runner, 10 + TRAP_REST + 1)).toEqual([]);
    traps.reset();
    expect(traps.step(runner, 0)).toHaveLength(1);
  });

  it('is heard by whoever is within the mid range of its spot, like a hit', () => {
    const e: TrapEvent = { type: 'trap', kind: 'metal', position: [10, 1, 20], player: 'a' };
    expect(eventReach(e, () => undefined)).toEqual({ seats: [], at: [10, 1, 20], loud: false });
  });
});

describe('a sound trap on the server', () => {
  const NAV = buildNavGraph(createWorld([FLOOR]), { area: [[-20, -20], [20, -20], [20, 20], [-20, 20]], spacing: 4 });

  it('reaches every client in earshot when someone sprints past, and the runner too', () => {
    const spawns = [[0, 0], [6, 0]].map(([x, z]) => ({ position: [x, 0, z] as Vec3, yaw: 0 }));
    const m = createNetworkedMatch({ solids: [FLOOR], spawns, mode: 'tdm', bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 }, latency: 0.03, traps: [{ kind: 'metal', position: [0, 0, -12] }] });
    const [a, b] = [m.join('a'), m.join('b')];
    m.run(ticks(1));
    const heard = (c: typeof a) => c.frames.flatMap((f) => f.server).filter((e): e is TrapEvent => e.type === 'trap');
    // Walking up to it sets nothing off.
    m.run(ticks(1), () => ({ a: usercmd({ yaw: 0, forward: 1 }), b: usercmd({ yaw: 0, forward: 1 }) }));
    expect(heard(a)).toEqual([]);
    m.run(ticks(2), () => ({ a: usercmd({ yaw: 0, forward: 1, buttons: ['Sprint'] }), b: usercmd({ yaw: 0, forward: 1, buttons: ['Sprint'] }) }));
    for (const c of [a, b]) {
      expect(heard(c)).toHaveLength(1);
      expect(heard(c)[0]).toMatchObject({ kind: 'metal', position: [0, 0, -12] });
    }
    expect([a.client.id, b.client.id]).toContain(heard(a)[0]!.player);
  });
});

describe('a bot hearing a sound trap', () => {
  const world = createWorld([FLOOR]);
  const nav = buildNavGraph(world, { area: [[-40, -40], [40, -40], [40, 40], [-40, 40]] });

  /** A bot facing −z and an enemy standing still 30 m behind it; a trap goes off by the enemy at tick 30 if `sounds` says so. */
  const listen = (sounds: (t: TrapEvent) => TrapEvent | null, at = 30, thinkEvery = 1) => {
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'b', team: 1, position: [0, 0, 0], yaw: 0 });
    sim.addPlayer({ id: 't', team: 2, position: [0, 0, 30], yaw: 0 });
    sim.addPlayer({ id: 'm', team: 1, position: [4, 0, 0], yaw: 0 });
    const bot = new Bot('b', botProfile('Vandal'), nav, world);
    let out = sim.output();
    let turned = false;
    for (let i = 0; i < ticks(1.5); i++) {
      const me = out.players.find((p) => p.id === 'b')!;
      const trap = i === at ? sounds({ type: 'trap', kind: 'birds', position: [1, 6, 29], player: 't' }) : null;
      const view: BotView = { tick: out.tick, time: sim.time, self: me, players: out.players, events: out.events, isEnemy: (o) => o.team !== me.team, objective: { position: [0, 0, 0], radius: 1.5 }, ...(thinkEvery > 1 ? { thinkEvery } : {}), ...(trap ? { sounds: [trap] } : {}) };
      out = sim.step({ b: bot.think(view) });
      const self = out.players.find((p) => p.id === 'b')!;
      if (Math.abs(angleDelta(self.yaw, Math.atan2(-(0 - self.position[0]), -(30 - self.position[2])))) < 40 * DEG) turned = true;
    }
    return { heard: bot.believedPosition('t'), turned };
  };

  it('learns about where the runner is and turns that way', () => {
    const { heard, turned } = listen((t) => t);
    expect(heard).not.toBeNull();
    expect(Math.hypot(heard![0] - 1, heard![2] - 29)).toBeLessThan(10);
    expect(turned).toBe(true);
  });

  it('hears one that went off while it was not thinking, on its next thought', () => {
    for (const at of [30, 31, 32, 33]) expect(listen((t) => t, at, 4).heard, `tick ${at}`).not.toBeNull();
  });

  it('pays no mind to its own side, or to a trap beyond its hearing', () => {
    expect(listen(() => null)).toEqual({ heard: null, turned: false });
    expect(listen((t) => ({ ...t, player: 'm' }))).toEqual({ heard: null, turned: false });
    expect(listen((t) => ({ ...t, position: [0, 6, TRAP_HEARD + 5] }))).toEqual({ heard: null, turned: false });
  });
});
