import { describe, expect, it } from 'vitest';
import { Bot, NoiseGrid, Simulation, SquadIntel, botProfile, box, buildNavGraph, createWorld, usercmd, type BotView, type PlayerOutput, type SimEvent, type TickOutput, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import type { BattleRoyaleState } from '../src/modes/game-mode';
import type { GroundOrder } from '../src/bots/squad-plan';
import { ticks } from './support/movement';

/** A 140 m floor; a wall across it at z = -20 hides whoever stands beyond it. */
const AREA: [number, number][] = [
  [-70, -70],
  [70, -70],
  [70, 70],
  [-70, 70],
];
const FLOOR = box({ min: [-70, -1, -70], max: [70, 0, 70], material: 'concrete' });
const WALL = box({ min: [-70, 0, -21], max: [70, 4, -20], material: 'brick' });
const world = createWorld([FLOOR, WALL]);
const nav = buildNavGraph(world, { area: AREA });

const ring: BattleRoyaleState = {
  kind: 'battle-royale',
  squadSize: 3,
  stage: 1,
  circle: { x: 0, z: 0, radius: 500 },
  next: { x: 0, z: 0, radius: 400 },
  shrinkAt: 1000,
  shrinkEnd: 1100,
  damage: 1,
  alive: 6,
  squads: 2,
};

interface Seat {
  readonly id: string;
  readonly team: number;
  readonly at: Vec3;
  readonly yaw?: number;
  /** A bot of this profile; otherwise it stands as it is told by `cmd`. */
  readonly bot?: string;
  readonly downed?: boolean;
  readonly cmd?: UserCmd;
}

/** A Battle Royale scene played tick by tick: bots think with a ground of their own and one shared Squad intel per team. */
function scene(seats: readonly Seat[], options: { canDamage?: boolean } = {}) {
  const sim = new Simulation(world, { canDamage: (a, v) => (options.canDamage ?? true) && a.team !== v.team, downs: () => true });
  for (const s of seats) sim.addPlayer({ id: s.id, team: s.team, position: s.at, yaw: s.yaw ?? 0 });
  for (const s of seats) if (s.downed) sim.setPlayerState({ ...sim.playerState(s.id)!, health: 1, downed: { since: 0, by: null, revive: null } });
  const intel = new Map<number, SquadIntel>();
  const noise = new NoiseGrid();
  const bots = new Map(seats.filter((s) => s.bot).map((s) => [s.id, new Bot(s.id, botProfile(s.bot!), nav, world)]));
  for (const s of seats) if (!intel.has(s.team)) intel.set(s.team, new SquadIntel());
  // A seat going Down puts its Squad on its guard, as the server's planner hears it.
  for (const s of seats) if (s.downed) intel.get(s.team)!.contact = 0;
  let out: TickOutput = sim.output();
  let events: readonly SimEvent[] = [];
  const ground = (me: PlayerOutput, mates: number): GroundOrder => ({ rally: me.position, radius: 30, hurry: false, hunt: false, wait: false, slot: 0, mates, ring, intel: intel.get(me.team)!, noise });
  /** One tick; `heard` joins the events the bots take in, as if the tick before had them. */
  const step = (heard: readonly SimEvent[] = []) => {
    const cmds: Record<string, UserCmd> = {};
    for (const s of seats) {
      const me = out.players.find((p) => p.id === s.id)!;
      const bot = bots.get(s.id);
      if (bot) {
        const view: BotView = { tick: out.tick, time: sim.time, self: me, players: out.players, events: heard.length ? [...events, ...heard] : events, isEnemy: (o: PlayerOutput) => o.team !== me.team, ground: ground(me, seats.filter((x) => x.team === s.team && x.id !== s.id).length) };
        cmds[s.id] = bot.think(view);
      } else if (s.cmd) cmds[s.id] = s.cmd;
    }
    out = sim.step(cmds);
    events = out.events;
    return out;
  };
  return { sim, bots, intel, step, player: (id: string) => out.players.find((p) => p.id === id)! };
}

const crouch = usercmd({ forward: 0, right: 0, yaw: 0, pitch: 0, buttons: ['Crouch'] });

describe('a bot revives only when it is sensible (ticket 64)', () => {
  it('not while an enemy it knows of stands in view of it and the Downed squadmate', () => {
    // The enemy can't be hurt, so the fight can't be won: no Revive should ever start.
    const s = scene([{ id: 'b', team: 1, at: [3, 0, 0], yaw: Math.PI, bot: 'Moss' }, { id: 'd', team: 1, at: [0, 0, 6], downed: true }, { id: 'e', team: 2, at: [0, 0, 30] }], { canDamage: false });
    let started = false;
    for (let i = 0; i < ticks(12); i++) if ((s.step().players.find((p) => p.id === 'd')!.downed?.revive ?? 0) > 0) started = true;
    expect(s.bots.get('b')!.recall('e')?.seen).toBe(true);
    expect(started).toBe(false);
  });

  it('once the Squad has had a quiet moment, with the enemy it knows of behind a wall', () => {
    const s = scene([{ id: 'b', team: 1, at: [3, 0, 0], bot: 'Moss' }, { id: 'd', team: 1, at: [0, 0, 4], downed: true }, { id: 'e', team: 2, at: [0, 0, -40] }], { canDamage: false });
    // A squadmate called the enemy out just as the seat went Down.
    s.intel.get(1)!.report('e', { position: [0, 0, -40], time: 0, seen: true, velocity: [0, 0, 0], by: 'd' });
    let start: number | null = null;
    for (let i = 0; i < ticks(15) && start === null; i++) if ((s.step().players.find((p) => p.id === 'd')!.downed?.revive ?? 0) > 0) start = s.sim.time;
    expect(s.bots.get('b')!.recall('e')).not.toBeNull();
    expect(start).not.toBeNull();
    // Not the moment it could: it lets things settle first.
    expect(start!).toBeGreaterThan(2);
  });

  it('one squadmate goes for a Downed seat, not every one of them', () => {
    const s = scene([
      { id: 'a', team: 1, at: [4, 0, 0], bot: 'Moss' },
      { id: 'c', team: 1, at: [-4, 0, 0], bot: 'Briar' },
      { id: 'd', team: 1, at: [0, 0, 3], downed: true },
    ]);
    let both = false;
    for (let i = 0; i < ticks(10); i++) {
      s.step();
      if (s.bots.get('a')!.activity === 'use' && s.bots.get('c')!.activity === 'use') both = true;
    }
    expect(both).toBe(false);
    expect(s.intel.get(1)!.reviver('d') ?? 'revived').not.toBeNull();
  });
});

describe('squadmates share what they see (ticket 64)', () => {
  it('a bot behind the wall knows of the enemy its squadmate sees, roughly, as told', () => {
    const s = scene([
      { id: 'a', team: 1, at: [0, 0, 0], yaw: Math.PI, bot: 'Moss' },
      { id: 'c', team: 1, at: [10, 0, -35], yaw: Math.PI, bot: 'Briar' },
      { id: 'e', team: 2, at: [0, 0, 25] },
    ], { canDamage: false });
    for (let i = 0; i < ticks(3); i++) s.step();
    expect(s.bots.get('a')!.recall('e')?.seen).toBe(true);
    const told = s.bots.get('c')!.recall('e');
    expect(told).not.toBeNull();
    expect(told!.seen).toBe(false);
    expect(Math.hypot(told!.position[0], told!.position[2] - 25)).toBeLessThan(8);
  });

  it('nobody knows of an enemy no squadmate could see or hear', () => {
    const s = scene([
      { id: 'a', team: 1, at: [0, 0, 0], bot: 'Moss' },
      { id: 'c', team: 1, at: [10, 0, 5], bot: 'Briar' },
      { id: 'e', team: 2, at: [0, 0, -50], cmd: crouch },
    ], { canDamage: false });
    for (let i = 0; i < ticks(3); i++) s.step();
    expect(s.bots.get('a')!.recall('e')).toBeNull();
    expect(s.bots.get('c')!.recall('e')).toBeNull();
  });
});

describe('noticing someone takes a moment (ticket 64)', () => {
  const noticed = (at: Vec3, cmd?: UserCmd, seconds = 8) => {
    const s = scene([{ id: 'b', team: 1, at: [0, 0, 0], yaw: Math.PI, bot: 'Moss' }, { id: 'e', team: 2, at, ...(cmd ? { cmd } : {}) }], { canDamage: false });
    for (let i = 0; i < ticks(seconds); i++) {
      s.step();
      // Noticed, whether or not it means to open fire from there.
      if (s.bots.get('b')!.recall('e')?.seen) return s.sim.time;
    }
    return Infinity;
  };

  it('longer for someone crouched still far off than for someone standing near', () => {
    const near = noticed([0, 0, 12]);
    const far = noticed([0, 0, 60], crouch);
    expect(near).toBeLessThan(1);
    expect(far).toBeGreaterThan(Math.max(1.5, near * 2));
    expect(far).toBeLessThan(8);
  });

  it('far off to one side, someone goes unseen', () => {
    // 60 m off and 40 degrees aside: inside the cone, outside the box.
    const a = 40 * (Math.PI / 180);
    expect(noticed([Math.sin(a) * 60, 0, Math.cos(a) * 60], undefined, 1.5)).toBe(Infinity);
  });
});

const reviveStarted = (s: ReturnType<typeof scene>, seconds: number, first: readonly SimEvent[] = []): boolean => {
  for (let i = 0; i < ticks(seconds); i++) if ((s.step(i === 0 ? first : []).players.find((p) => p.id === 'd')!.downed?.revive ?? 0) > 0) return true;
  return false;
};

describe('a bot knows only what its Squad perceived (ticket 74)', () => {
  // A squadmate saw the enemy, standing in view of the Downed seat, a moment ago; the enemy is truly elsewhere now, Downed where nobody saw (its own squadmate, out of sight too, keeps its Squad in it).
  const setup = () => {
    const s = scene([{ id: 'b', team: 1, at: [3, 0, 0], bot: 'Moss' }, { id: 'd', team: 1, at: [0, 0, 4], downed: true }, { id: 'e', team: 2, at: [0, 0, -40], downed: true }, { id: 'f', team: 2, at: [40, 0, -60], cmd: crouch }], { canDamage: false });
    s.intel.get(1)!.report('e', { position: [0, 0, 30], time: 0, seen: true, velocity: [0, 0, 0], by: 'd' });
    return s;
  };

  it('a Revive weighs an enemy as last seen, not as truly is: no Revive under a seen enemy nobody saw go Down', () => {
    expect(reviveStarted(setup(), 8)).toBe(false);
  });

  it('a Down in the feed, which everyone sees, lets it go', () => {
    const down: SimEvent = { type: 'down', attacker: null, victim: 'e', cause: 'bullet', zone: null, weapon: null };
    expect(reviveStarted(setup(), 8, [down])).toBe(true);
  });

  const hit = (shooter: string, victim: string): SimEvent => ({ type: 'hit', shooter, victim, damage: 10, zone: 'upperTorso', point: [0, 1, 0], weapon: 'm4a1', kind: 'bullet' }) as unknown as SimEvent;
  const felt = (enemy: Vec3, bots: number) =>
    Array.from({ length: bots }, (_, k) => {
      const s = scene([{ id: `b${k}`, team: 1, at: [0, 0, 0], bot: 'Moss' }, { id: 'e', team: 2, at: enemy }], { canDamage: false });
      s.step();
      s.step([hit('e', `b${k}`)]);
      const m = s.bots.get(`b${k}`)!.recall('e')!;
      const told = [...s.intel.get(1)!.callouts(s.sim.time)].find(([id]) => id === 'e')![1];
      const bearing = (p: Vec3) => Math.atan2(p[0], p[2]);
      const turn = Math.abs(((bearing(m.position) - bearing(enemy) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return { error: Math.hypot(m.position[0] - enemy[0], m.position[2] - enemy[2]), turn, told: Math.hypot(told.position[0] - enemy[0], told.position[2] - enemy[2]) };
    });

  it('a hit from far off and out of sight gives a direction, not a place', () => {
    // 65 m off, behind the wall.
    const far = felt([8, 0, -65], 10);
    expect(Math.max(...far.map((f) => f.error))).toBeGreaterThan(8);
    expect(Math.max(...far.map((f) => f.told))).toBeGreaterThan(8);
    for (const f of far) expect(f.turn).toBeLessThan(0.3);
  });

  it('a hit from near and in sight is placed about where it came from', () => {
    for (const f of felt([4, 0, 15], 10)) expect(f.error).toBeLessThan(5);
  });
});

describe('pings (ticket 66)', () => {
  const yawTo = (a: Vec3, b: Vec3) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
  const off = (yaw: number, want: number) => Math.abs(Math.atan2(Math.sin(yaw - want), Math.cos(yaw - want)));
  const pinged = (s: ReturnType<typeof scene>, by: string, foe: string, team = 1) => {
    const e = s.player(foe);
    s.intel.get(team)!.heard({ type: 'ping', id: 1, kind: 'enemy', player: by, team, position: e.position, target: foe, until: s.sim.time + 6 }, e.velocity, s.sim.time);
  };

  /** Bot a's yaw a second on, with and without a squadmate's ping of e. */
  const turned = (seats: Parameters<typeof scene>[0]) => {
    const run = (ping: boolean) => {
      const s = scene(seats, { canDamage: false });
      s.step();
      if (ping) pinged(s, 'p', 'e');
      for (let i = 0; i < ticks(1); i++) s.step();
      return { yaw: s.player('a').yaw, knows: s.bots.get('a')!.recall('e') !== null };
    };
    return { pinged: run(true), quiet: run(false) };
  };

  it('a bot with nothing on turns to an enemy a squadmate pinged behind it, and knows where they are', () => {
    const r = turned([
      { id: 'a', team: 1, at: [0, 0, 0], yaw: 0, bot: 'Moss' },
      { id: 'p', team: 1, at: [-15, 0, -15] },
      { id: 'e', team: 2, at: [35, 0, 5], cmd: crouch },
    ]);
    const want = yawTo([0, 0, 0], [35, 0, 5]);
    expect(r.pinged.knows).toBe(true);
    expect(r.quiet.knows).toBe(false);
    expect(off(r.pinged.yaw, want)).toBeLessThan(0.6);
    expect(off(r.quiet.yaw, want)).toBeGreaterThan(1);
  });

  it('a bot too far off only remembers: it keeps to what it was doing', () => {
    const r = turned([
      { id: 'a', team: 1, at: [-65, 0, 65], yaw: 0, bot: 'Moss' },
      { id: 'p', team: 1, at: [50, 0, -60] },
      { id: 'e', team: 2, at: [60, 0, -65], cmd: crouch },
    ]);
    expect(r.pinged.knows).toBe(true);
    expect(r.pinged.yaw).toBeCloseTo(r.quiet.yaw, 5);
  });

  it('a bot pings an enemy it spots for its Squad, once in a while, and not one a squadmate just pinged', () => {
    const s = scene([
      { id: 'a', team: 1, at: [0, 0, 0], yaw: Math.PI, bot: 'Moss' },
      { id: 'e', team: 2, at: [0, 0, 25] },
      { id: 'f', team: 2, at: [6, 0, 25] },
    ], { canDamage: false });
    const asked: string[] = [];
    for (let i = 0; i < ticks(3); i++) {
      s.step();
      const ping = s.bots.get('a')!.takePing();
      if (ping) asked.push(`${ping.kind} ${ping.target}`);
    }
    // One of the two, not both: the next waits.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^enemy [ef]$/);

    const t = scene([
      { id: 'a', team: 1, at: [0, 0, 0], yaw: Math.PI, bot: 'Moss' },
      { id: 'p', team: 1, at: [10, 0, 0] },
      { id: 'e', team: 2, at: [0, 0, 25] },
    ], { canDamage: false });
    pinged(t, 'p', 'e');
    let again = 0;
    for (let i = 0; i < ticks(3); i++) {
      t.step();
      if (t.bots.get('a')!.takePing()) again += 1;
    }
    expect(again).toBe(0);
  });
});
