import { describe, expect, it } from 'vitest';
import { BOT_NAMES, BOT_STYLES, Bot, Simulation, TICK_SECONDS, botName, botProfile, viewDirection, buildNavGraph, createWorld, findPath, raycastWorld, zoneCentre, type NavGraph, type PlayerOutput, type SimEvent, type TickOutput, type Vec3 } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

/** A 40 m square arena on the floor. */
const AREA: [number, number][] = [
  [-20, -20],
  [20, -20],
  [20, 20],
  [-20, 20],
];
const open = createWorld([FLOOR]);
const openNav = buildNavGraph(open, { area: AREA });

/** A wall across the arena at z = -5 (x from -20 to 20), with a 1.2 m doorway at x = 0..1.2, and a 1 m crate north of it. */
const wall = [
  box({ min: [-20, 0, -5.2], max: [0, 3, -5], material: 'brick' }),
  box({ min: [1.2, 0, -5.2], max: [20, 3, -5], material: 'brick' }),
  box({ min: [-8.5, 0, -12.5], max: [-5.5, 1, -9.5], material: 'wood' }),
];
const walled = createWorld([FLOOR, ...wall]);
const walledNav = buildNavGraph(walled, { area: AREA, hints: [[0.6, 0, -4], [0.6, 0, -6.2]] });

interface Duel {
  readonly sim: Simulation;
  readonly bot: Bot;
  /** Steps one tick: the bot thinks, the target does `target` (idle by default). */
  step(target?: ReturnType<typeof usercmd>): TickOutput;
  readonly outputs: TickOutput[];
}

/** A bot ('b', team 1) and a player ('t', team 2) on `world`. */
function duel(world: ReturnType<typeof createWorld>, nav: NavGraph, at: { bot: Vec3; botYaw?: number; target: Vec3; targetYaw?: number }, name = 'Kestrel'): Duel {
  const sim = new Simulation(world);
  sim.addPlayer({ id: 'b', team: 1, position: at.bot, yaw: at.botYaw ?? 0 });
  sim.addPlayer({ id: 't', team: 2, position: at.target, yaw: at.targetYaw ?? Math.PI });
  const bot = new Bot('b', botProfile(name), nav, world);
  const outputs: TickOutput[] = [];
  let out = sim.output();
  let events: readonly SimEvent[] = [];
  return {
    sim,
    bot,
    outputs,
    step(target = usercmd({ yaw: at.targetYaw ?? Math.PI })) {
      const self = out.players.find((p) => p.id === 'b')!;
      const cmd = bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events, isEnemy: (o: PlayerOutput) => o.team !== self.team });
      out = sim.step({ b: cmd, t: target });
      events = out.events;
      outputs.push(out);
      return out;
    },
  };
}

/** Puts the target `distance` m in front of where the bot is looking now, facing it. */
function stepInFront(d: Duel, distance: number): void {
  const b = d.outputs.at(-1)!.players.find((p) => p.id === 'b')!;
  const dir = viewDirection(b.yaw, 0);
  d.sim.respawn('t', [b.position[0] + dir[0] * distance, 0, b.position[2] + dir[2] * distance], b.yaw + Math.PI);
}

const shotsBy = (outputs: readonly TickOutput[], id: string) => outputs.flatMap((o) => o.events.filter((e) => e.type === 'shot' && e.shooter === id).map(() => o.tick));
const killed = (outputs: readonly TickOutput[], victim: string) => outputs.findIndex((o) => o.events.some((e) => e.type === 'kill' && e.victim === victim));

describe('nav graph', () => {
  it('finds the shortest way through a small graph, and none to a node out of reach', () => {
    const node = (x: number, z: number) => ({ position: [x, 0, z] as Vec3, indoor: false, precise: false, sightline: 0, sightYaw: 0 });
    const graph: NavGraph = {
      nodes: [node(0, 0), node(10, 0), node(10, 10), node(0, 10), node(50, 50)],
      links: [
        [{ to: 1, kind: 'walk', cost: 10 }, { to: 3, kind: 'walk', cost: 10 }],
        [{ to: 2, kind: 'walk', cost: 10 }],
        [],
        [{ to: 2, kind: 'climb', cost: 25 }],
        [],
      ],
    };
    expect(findPath(graph, 0, 2)).toEqual([0, 1, 2]);
    expect(findPath(graph, 0, 4)).toBeNull();
    expect(findPath(graph, 2, 0)).toBeNull();
  });

  it('covers open ground on a grid, every node linked both ways to its neighbours', () => {
    expect(openNav.nodes.length).toBeGreaterThan(300);
    for (const [i, links] of openNav.links.entries()) {
      expect(links.length, `node ${i}`).toBeGreaterThanOrEqual(3);
      for (const l of links) expect(openNav.links[l.to]!.some((back) => back.to === i)).toBe(true);
    }
  });

  it('goes round walls through the doorway, and mantles onto a crate', () => {
    // No node inside the wall, and every link that crosses its line goes through the doorway.
    for (const [i, links] of walledNav.links.entries()) {
      const a = walledNav.nodes[i]!.position;
      for (const l of links) {
        const b = walledNav.nodes[l.to]!.position;
        if ((a[2] + 5.1) * (b[2] + 5.1) >= 0) continue;
        const t = (-5.1 - a[2]) / (b[2] - a[2]);
        const x = a[0] + (b[0] - a[0]) * t;
        expect(x, `link ${a} -> ${b}`).toBeGreaterThan(0);
        expect(x).toBeLessThan(1.2);
      }
    }
    const onCrate = walledNav.nodes.findIndex((n) => Math.abs(n.position[1] - 1) < 0.01);
    expect(onCrate).toBeGreaterThanOrEqual(0);
    expect(walledNav.links.some((ls) => ls.some((l) => l.to === onCrate && l.kind === 'climb'))).toBe(true);
  });
});

describe('a bot', () => {
  it('walks through the doorway and climbs onto the crate when sent there', () => {
    const d = duel(walled, walledNav, { bot: [10, 0, 10], target: [19, 0, 19] });
    d.bot.goTo([-7, 1, -11]);
    let at: PlayerOutput | undefined;
    for (let i = 0; i < ticks(25); i++) {
      at = d.step().players.find((p) => p.id === 'b');
      if (at && Math.abs(at.position[1] - 1) < 0.05 && Math.hypot(at.position[0] + 7, at.position[2] + 11) < 1.2) break;
    }
    expect(at!.position[1]).toBeCloseTo(1, 1);
  });

  it('spots a player in the open and kills them', () => {
    const d = duel(open, openNav, { bot: [0, 0, 0], target: [0, 0, -15] });
    for (let i = 0; i < ticks(6) && killed(d.outputs, 't') < 0; i++) d.step();
    expect(killed(d.outputs, 't')).toBeGreaterThan(0);
  });

  it('never shoots at a player behind a wall', () => {
    const d = duel(walled, walledNav, { bot: [8, 0, 0], target: [8, 0, -10] });
    // The bot may come round through the doorway and fight, but it fires only with some of the target in clear view.
    for (let i = 0; i < ticks(5); i++) d.step();
    const zones = ['head', 'upperTorso', 'lowerTorso'] as const;
    const blind = d.outputs.flatMap((o) => {
      const t = o.players.find((p) => p.id === 't')!;
      return o.events.filter((e) => e.type === 'shot' && e.shooter === 'b' && zones.every((z) => raycastWorld(walled, e.origin, zoneCentre(t, z)) !== null));
    });
    expect(blind.map((e) => JSON.stringify(e))).toEqual([]);
  });

  it('takes a human moment to react to someone stepping into view', () => {
    // The target appears 15 m in front of a bot that has long finished drawing.
    for (const name of ['Kestrel', 'Moss', 'Vandal', 'Pike']) {
      // Out of sight range until it steps in.
      const d = duel(open, openNav, { bot: [0, 0, 0], target: [150, 0, 150] }, name);
      for (let i = 0; i < ticks(2); i++) d.step(usercmd());
      stepInFront(d, 15);
      const appeared = d.sim.tick;
      for (let i = 0; i < ticks(3); i++) d.step();
      const first = shotsBy(d.outputs, 'b')[0];
      expect(first, name).toBeDefined();
      expect((first! - appeared) * TICK_SECONDS, name).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('is a moderate shot: a strafing player at 20 m goes down in 1 to 3 s', () => {
    const times: number[] = [];
    for (const name of ['Kestrel', 'Moss', 'Vandal', 'Pike', 'Juniper', 'Rook', 'Tango']) {
      // The bot draws and walks about with nobody near; then the target appears in front of it, strafing.
      const d = duel(open, openNav, { bot: [0, 0, 0], target: [150, 0, 150] }, name);
      for (let i = 0; i < ticks(2); i++) d.step();
      stepInFront(d, 20);
      const facing = d.sim.playerState('t')!.cmdYaw;
      const start = d.sim.tick;
      for (let i = 0; i < ticks(8) && killed(d.outputs, 't') < 0; i++) {
        const side = Math.floor((i * TICK_SECONDS) / 0.6) % 2 === 0 ? 1 : -1;
        d.step(usercmd({ yaw: facing, right: side }));
      }
      const k = killed(d.outputs, 't');
      expect(k, name).toBeGreaterThan(0);
      times.push((d.outputs[k]!.tick - start) * TICK_SECONDS);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(1);
    expect(median).toBeLessThanOrEqual(3);
  });

  it('hears gunfire through a wall only roughly, and gunfire in the open exactly', () => {
    const heard = (world: ReturnType<typeof createWorld>, nav: NavGraph) => {
      // The bot faces away; the target, 10 m behind it (beyond a wall, in the walled arena), fires once into the floor.
      const d = duel(world, nav, { bot: [8, 0, 0], botYaw: Math.PI, target: [8, 0, -10] });
      for (let i = 0; i < ticks(1); i++) d.step(usercmd({ yaw: Math.PI }));
      d.step(usercmd({ yaw: Math.PI, pitch: -1.2, buttons: ['Fire'] }));
      d.step(usercmd({ yaw: Math.PI }));
      const at = d.bot.believedPosition('t');
      expect(at).not.toBeNull();
      return Math.hypot(at![0] - 8, at![2] + 10);
    };
    expect(heard(open, openNav)).toBeLessThan(0.1);
    expect(heard(walled, walledNav)).toBeGreaterThan(0.5);
  });

  it('comes in different styles, and no two bots play quite alike', () => {
    const profiles = BOT_NAMES.map((n) => botProfile(n));
    for (const style of BOT_STYLES) expect(profiles.filter((p) => p.style === style).length, style).toBeGreaterThanOrEqual(4);
    // A lobby's bots, named one after another, are a mix: the first five are five different styles.
    for (let seed = 0; seed < 20; seed++) {
      const taken = new Set<string>(['alice']);
      for (let i = 0; i < 5; i++) taken.add(botName(taken, seed * 31 + i));
      expect(new Set([...taken].filter((n) => n !== 'alice').map((n) => botProfile(n).style)).size, `seed ${seed}`).toBe(5);
    }
    const mean = (style: string, key: 'fightRange' | 'hold') => {
      const of = profiles.filter((p) => p.style === style);
      return of.reduce((n, p) => n + p[key], 0) / of.length;
    };
    expect(mean('rusher', 'fightRange')).toBeLessThan(mean('anchor', 'fightRange') - 8);
    expect(mean('anchor', 'hold')).toBeGreaterThan(mean('rusher', 'hold') + 0.4);
    expect(new Set(profiles.map((p) => `${p.reaction.toFixed(3)}:${p.aimError.toFixed(4)}:${p.wobbleRate.toFixed(3)}`)).size).toBe(profiles.length);
    // Hunches about where enemies are stay rare.
    for (const p of profiles) expect(p.hunch).toBeLessThanOrEqual(0.25);
  });

  it('plays the same way every time', () => {
    const run = () => {
      const d = duel(walled, walledNav, { bot: [5, 0, 5], target: [-5, 0, -15] });
      for (let i = 0; i < ticks(6); i++) d.step();
      return d.outputs.map((o) => o.players.map((p) => p.position.join(',')).join(';'));
    };
    expect(run()).toEqual(run());
  });
});
