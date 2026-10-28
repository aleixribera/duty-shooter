import { describe, expect, it } from 'vitest';
import { Bot, DEG, Simulation, angleDelta, botProfile, buildNavGraph, createWorld, raycastWorld, type BotView, type NavGraph, type PlayerOutput, type SimEvent, type TickOutput, type Vec3 } from '@duty-shooter/fps-core';
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
    // A flanker walks about alone; then the target crosses 12 m in front of it, left to right, and is gone (as if round a corner).
    const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 't', team: 2, at: [150, 0, 150] }], 'Moss');
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

/** A kill event: `killer` shot `victim`. */
const kill = (killer: string, victim: string): SimEvent => ({ type: 'kill', killer, victim, cause: 'bullet', zone: 'upperTorso', weapon: 'm4a1' });

describe('a bot remembering deaths', () => {
  it('marks roughly where a teammate was killed from, exactly where it was killed from itself, and keeps that through a respawn', () => {
    // A teammate 20 m off is shot by an enemy farther on.
    const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 'm', team: 1, at: [0, 0, -20] }, { id: 't', team: 2, at: [10, 0, -30] }], 'Vandal', { objective: STAY([0, 0, 0]) });
    for (let i = 0; i < ticks(0.5); i++) m.step();
    m.step({}, [kill('t', 'm')]);
    expect(m.bot.dangers).toHaveLength(1);
    const off = Math.hypot(m.bot.dangers[0]![0] - 10, m.bot.dangers[0]![2] + 30);
    expect(off).toBeGreaterThan(0.5);
    expect(off).toBeLessThan(4);
    // Then the same enemy kills the bot: the spot is exact now, and still in mind after the respawn.
    m.step({}, [kill('t', 'b')]);
    m.sim.respawn('b', [-15, 0, 15], 0);
    for (let i = 0; i < ticks(0.5); i++) m.step();
    expect(m.bot.dangers).toHaveLength(1);
    expect(Math.hypot(m.bot.dangers[0]![0] - 10, m.bot.dangers[0]![2] + 30)).toBeLessThan(0.01);
    // And the enemy's own death clears it.
    m.step({}, [kill('m', 't')]);
    expect(m.bot.dangers).toEqual([]);
  });

  it('forgets nothing of a free-for-all death: there are no teammates to mourn', () => {
    const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 'x', team: 2, at: [0, 0, -10] }, { id: 't', team: 3, at: [10, 0, -20] }], 'Vandal', { objective: STAY([0, 0, 0]) });
    m.step({}, [kill('t', 'x')]);
    expect(m.bot.dangers).toEqual([]);
  });

  it('goes to trade a teammate killed near it if it plays boldly, and watches that way if not', () => {
    // The killer is out of sight beyond the wall.
    const run = (name: string) => {
      const m = match(walled, walledNav, [{ id: 'b', team: 1, at: [8, 0, 2] }, { id: 'm', team: 1, at: [4, 0, -2] }, { id: 't', team: 2, at: [-10, 0, -12] }], name);
      for (let i = 0; i < ticks(0.5); i++) m.step();
      m.step({}, [kill('t', 'm')]);
      m.step();
      return m.bot.activity;
    };
    // A rusher, then an anchor.
    expect(run('Kestrel')).toBe('chase');
    expect(run('Vandal')).toBe('hold');
  });
});

describe('a bot weighing the mode and its situation', () => {
  /** A bot that has seen the target cross 12 m in front of it, and then lost it (gone round a corner): what it does next. */
  const lose = (name: string, lives: 'round' | 'respawn') => {
    const m = match(open, openNav, [{ id: 'b', team: 1, at: [0, 0, 0] }, { id: 't', team: 2, at: [150, 0, 150] }], name, { lives });
    for (let i = 0; i < ticks(1); i++) m.step();
    const b = m.self();
    const forward: Vec3 = [-Math.sin(b.yaw), 0, -Math.cos(b.yaw)];
    const right: Vec3 = [Math.cos(b.yaw), 0, -Math.sin(b.yaw)];
    m.sim.respawn('t', [b.position[0] + forward[0] * 12 - right[0] * 3, 0, b.position[2] + forward[2] * 12 - right[2] * 3], b.yaw - Math.PI / 2);
    for (let i = 0; i < ticks(0.5); i++) m.step({ t: usercmd({ yaw: b.yaw - Math.PI / 2, forward: 1 }) });
    m.sim.respawn('t', [150, 0, 150], 0);
    for (let i = 0; i < ticks(1); i++) m.step();
    return m.bot.activity;
  };

  it('losing a target, holds the angle when careful in Charge, and chases as a rusher in team deathmatch', () => {
    // An anchor and a support, where a death is for the round.
    expect(lose('Vandal', 'round')).toBe('hold');
    expect(lose('Juniper', 'round')).toBe('hold');
    // A rusher, where it's back in seconds.
    expect(lose('Kestrel', 'respawn')).toBe('chase');
  });

  it('hurt and losing a fight, breaks off to cover out of the enemy\'s sight and stays there until healed', () => {
    // The enemy stands 15 m off in the open, south of the wall; the bot, a step from the doorway and facing it, has 30 health left.
    const m = match(walled, walledNav, [{ id: 'b', team: 1, at: [1.5, 0, -3], yaw: Math.PI }, { id: 't', team: 2, at: [1.5, 0, 12], yaw: 0 }], 'Juniper', { lives: 'round' });
    const hurt = m.sim.playerState('b')!;
    m.sim.setPlayerState({ ...hurt, health: 30, lastDamage: 0 });
    const covered: number[] = [];
    for (let i = 0; i < ticks(10); i++) {
      const out = m.step({ t: usercmd({ yaw: 0 }) });
      const b = m.self();
      if (m.bot.activity === 'cover') {
        const t = out.players.find((p) => p.id === 't')!;
        const chest: Vec3 = [b.position[0], b.position[1] + 1.2, b.position[2]];
        const eye: Vec3 = [t.position[0], t.position[1] + t.eyeHeight, t.position[2]];
        covered.push(raycastWorld(walled, eye, chest) !== null ? i : -1);
      }
    }
    expect(covered.length, 'broke off').toBeGreaterThan(0);
    // Out of sight within 3.5 s of breaking off (turning round, through the doorway), and from then on.
    const hiddenFrom = covered.findIndex((c) => c >= 0);
    expect(hiddenFrom).toBeGreaterThanOrEqual(0);
    expect(hiddenFrom * (1 / 60)).toBeLessThan(3.5);
    expect(covered.slice(hiddenFrom).every((c) => c >= 0)).toBe(true);
    // It stayed until healed, then got back to it.
    expect(m.self().health).toBeGreaterThanOrEqual(95);
    expect(m.bot.activity).not.toBe('cover');
  });

  it('goes quietly near an enemy it has heard when careful, and sprints its long legs otherwise', () => {
    const sprints = (heard: boolean) => {
      // An anchor in Charge; the enemy beyond the wall fires once into the floor (or doesn't).
      const m = match(walled, walledNav, [{ id: 'b', team: 1, at: [8, 0, 6] }, { id: 't', team: 2, at: [-4, 0, -10] }], 'Vandal', { lives: 'round' });
      let n = 0;
      for (let i = 0; i < ticks(6); i++) {
        m.step({ t: usercmd(heard && i >= 60 && i < 64 ? { pitch: -1.2, buttons: ['Fire'] } : {}) });
        const b = m.self();
        if (i > 64 && (b.movement === 'sprint' || b.movement === 'tacticalSprint')) n += 1;
      }
      return n;
    };
    expect(sprints(true)).toBe(0);
    expect(sprints(false)).toBeGreaterThan(0);
  });
});
