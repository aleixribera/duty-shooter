import { describe, expect, it } from 'vitest';
import { Bot, DEG, Simulation, angleDelta, botProfile, buildNavGraph, createWorld, type BotView, type NavGraph, type PlayerOutput, type SimEvent, type TickOutput, type Vec3 } from '@duty-shooter/fps-core';
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

/** A wall across the arena at z = -5 (x from -20 to 20), with a 1.2 m doorway at x = 0..1.2. */
const walled = createWorld([FLOOR, box({ min: [-20, 0, -5.2], max: [0, 3, -5], material: 'brick' }), box({ min: [1.2, 0, -5.2], max: [20, 3, -5], material: 'brick' })]);
const walledNav = buildNavGraph(walled, { area: AREA, hints: [[0.6, 0, -4], [0.6, 0, -6.2]] });

type Cmd = ReturnType<typeof usercmd>;

/** An objective that keeps a bot about where it stands (so it neither wanders off nor turns to see). */
const STAY = (at: Vec3) => ({ position: at, radius: 1.5 });

/** A match of one bot ('b', team 1) and scripted players; `extra` adds to each view (the mode's say). */
function match(world: ReturnType<typeof createWorld>, nav: NavGraph, players: { id: string; team: number; at: Vec3; yaw?: number }[], name: string, extra: Partial<BotView> = {}) {
  const sim = new Simulation(world);
  for (const p of players) sim.addPlayer({ id: p.id, team: p.team, position: p.at, yaw: p.yaw ?? 0 });
  const bot = new Bot('b', botProfile(name), nav, world);
  const outputs: TickOutput[] = [];
  let out = sim.output();
  let events: readonly SimEvent[] = [];
  const self = () => out.players.find((p) => p.id === 'b')!;
  return {
    sim,
    bot,
    outputs,
    self,
    /** Steps one tick: the bot thinks, the others do what `cmds` says (nothing by default); `inject` adds events to what the bot hears. */
    step(cmds: Record<string, Cmd> = {}, inject: SimEvent[] = []) {
      const me = self();
      const cmd = bot.think({ tick: out.tick, time: sim.time, self: me, players: out.players, events: [...events, ...inject], isEnemy: (o: PlayerOutput) => o.team !== me.team, ...extra });
      out = sim.step({ ...cmds, b: cmd });
      events = out.events;
      outputs.push(out);
      return out;
    },
  };
}

/** How far (rad) the bot's view is from facing `p`. */
const offFrom = (self: PlayerOutput, p: Vec3) => Math.abs(angleDelta(self.yaw, Math.atan2(-(p[0] - self.position[0]), -(p[2] - self.position[2]))));

describe('a bot listening', () => {
  it('hears a sprinting enemy beyond a wall and turns to look; walking or standing there it goes unheard', () => {
    // The bot faces away from the wall; the enemy is 10 m off beyond it, crossing toward -x.
    const run = (cmd: Cmd) => {
      const m = match(walled, walledNav, [{ id: 'b', team: 1, at: [8, 0, 0], yaw: Math.PI }, { id: 't', team: 2, at: [12, 0, -10], yaw: Math.PI / 2 }], 'Vandal', { objective: STAY([8, 0, 0]) });
      // Weapons out, everyone still.
      for (let i = 0; i < ticks(0.5); i++) m.step();
      let turned = false;
      for (let i = 0; i < ticks(1.2); i++) {
        const out = m.step({ t: cmd });
        const t = out.players.find((p) => p.id === 't')!;
        if (offFrom(m.self(), t.position) < 35 * DEG) turned = true;
      }
      return { heard: m.bot.believedPosition('t') !== null, turned };
    };
    expect(run(usercmd({ yaw: Math.PI / 2, forward: 1, buttons: ['Sprint'] }))).toEqual({ heard: true, turned: true });
    expect(run(usercmd({ yaw: Math.PI / 2, forward: 1 }))).toEqual({ heard: false, turned: false });
    expect(run(usercmd({ yaw: Math.PI / 2 }))).toEqual({ heard: false, turned: false });
  });

  it('hears footsteps in the open by gait: a walk 8 m behind, but not a crouch-walk', () => {
    const run = (cmd: Cmd) => {
      const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 't', team: 2, at: [2, 0, 8], yaw: Math.PI / 2 }], 'Vandal', { objective: STAY([0, 0, 0]) });
      for (let i = 0; i < ticks(0.5); i++) m.step();
      for (let i = 0; i < ticks(0.4); i++) m.step({ t: cmd });
      return m.bot.believedPosition('t') !== null;
    };
    expect(run(usercmd({ yaw: Math.PI / 2, forward: 1 }))).toBe(true);
    expect(run(usercmd({ yaw: Math.PI / 2, forward: 1, buttons: ['Crouch'] }))).toBe(false);
  });

  it('chases a target that slipped out of sight to where it vanished, then searches the way it was heading', () => {
    // A roamer walks about alone; then the target crosses 12 m in front of it, left to right, and is gone (as if round a corner).
    const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 't', team: 2, at: [150, 0, 150] }], 'Pike');
    for (let i = 0; i < ticks(1); i++) m.step();
    const b = m.self();
    const forward: Vec3 = [-Math.sin(b.yaw), 0, -Math.cos(b.yaw)];
    const right: Vec3 = [Math.cos(b.yaw), 0, -Math.sin(b.yaw)];
    m.sim.respawn('t', [b.position[0] + forward[0] * 12 - right[0] * 3, 0, b.position[2] + forward[2] * 12 - right[2] * 3], b.yaw - Math.PI / 2);
    for (let i = 0; i < ticks(0.4); i++) m.step({ t: usercmd({ yaw: b.yaw - Math.PI / 2, forward: 1 }) });
    const vanished = m.outputs.at(-1)!.players.find((p) => p.id === 't')!.position;
    expect(m.bot.believedPosition('t'), 'seen').not.toBeNull();
    m.sim.respawn('t', [150, 0, 150], 0);
    let searchedAt: Vec3 | null = null;
    let searching = 0;
    let lookedOn = false;
    const heading = b.yaw - Math.PI / 2;
    for (let i = 0; i < ticks(8); i++) {
      m.step();
      if (m.bot.activity === 'search') {
        searchedAt ??= m.self().position;
        searching += 1;
        if (Math.abs(angleDelta(m.self().yaw, heading)) < 25 * DEG) lookedOn = true;
      } else if (searchedAt) break;
    }
    expect(searchedAt, 'searched').not.toBeNull();
    // At the corner, looking on the way it was going.
    expect(Math.hypot(searchedAt![0] - vanished[0], searchedAt![2] - vanished[2])).toBeLessThan(3.5);
    expect(lookedOn).toBe(true);
    expect(searching * (1 / 60)).toBeGreaterThanOrEqual(1.4);
    expect(m.bot.activity).not.toBe('search');
  });
});
