import { describe, expect, it } from 'vitest';
import type { SimEvent, Vec3 } from '@duty-shooter/fps-core';
import { SquadPlanner, wallAt, type PlannedSeat, type SquadSituation } from '../src/bots/squad-plan';
import type { BattleRoyaleState } from '../src/modes/game-mode';

const state = (over: Partial<BattleRoyaleState> = {}): BattleRoyaleState => ({
  kind: 'battle-royale',
  squadSize: 2,
  stage: 1,
  circle: { x: 0, z: 0, radius: 500 },
  next: { x: 100, z: 0, radius: 300 },
  shrinkAt: 60,
  shrinkEnd: 130,
  damage: 1,
  alive: 60,
  squads: 30,
  ...over,
});

const seat = (id: string, team: number, x: number, z: number, over: Partial<PlannedSeat> = {}): PlannedSeat => ({ id, team, position: [x, 0, z], bot: true, downed: null, ...over });

const planner = () => new SquadPlanner((x, z): Vec3 => [x, 0, z], 7);
const situation = (seats: readonly PlannedSeat[], over: Partial<SquadSituation> = {}): SquadSituation => ({ time: 10, state: state(), seats, ...over });
const apart = (a: Vec3, b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[2] - b[1]);

describe('the wall', () => {
  it('holds, then closes on the next circle', () => {
    const s = state();
    expect(wallAt(s, 30)).toEqual(s.circle);
    expect(wallAt(s, 95)).toEqual({ x: 50, z: 0, radius: 400 });
    expect(wallAt(s, 500)).toEqual(s.next);
  });
});

describe('first rallies a few at a time', () => {
  it('gives each Squad the rally it would have had all at once, a few Squads a plan', () => {
    const seats = Array.from({ length: 9 }, (_, i) => seat(`s${i}`, i + 1, -300 + i * 70, (i % 3) * 90));
    const atOnce = planner().plan(situation(seats));
    const spread = planner();
    const given = [2, 4, 6, 8, 9].map((_, k) => [...spread.plan(situation(seats, { fresh: 2 })).keys()].length);
    expect(given).toEqual([2, 4, 6, 8, 9]);
    const last = spread.plan(situation(seats, { fresh: 2 }));
    for (const s of seats) expect(last.get(s.id)!.rally, s.id).toEqual(atOnce.get(s.id)!.rally);
  });
});

describe('a Squad on the move', () => {
  it('a Squad caught outside the next circle gets a place inside it in time', () => {
    const p = planner();
    // 370 m from the next circle's edge at most, with 110 s to go.
    const orders = p.plan(situation([seat('a', 1, -400, 0), seat('b', 1, -395, 4)], { time: 20 }));
    const rally = orders.get('a')!.rally;
    expect(apart(rally, [100, 0])).toBeLessThan(300);
    expect(orders.get('b')!.rally).toEqual(rally);
  });

  it('a Squad already well inside stays near where it is', () => {
    const orders = planner().plan(situation([seat('a', 1, 110, 10)], { time: 5 }));
    expect(apart(orders.get('a')!.rally, [110, 10])).toBeLessThan(40);
  });

  it('a seat outside the wall is told to hurry; one safe inside is not', () => {
    const orders = planner().plan(situation([seat('a', 1, 510, 0), seat('b', 2, 90, 0)], { time: 20 }));
    expect(orders.get('a')!.hurry).toBe(true);
    expect(orders.get('b')!.hurry).toBe(false);
  });

  it('a seat the wall is about to reach hurries before it is caught', () => {
    // The wall is closing at about 4 m/s from the left, and this seat stands 12 m inside it.
    const s = state();
    const wall = wallAt(s, 100);
    const orders = planner().plan(situation([seat('a', 1, wall.x - wall.radius + 12, 0)], { time: 100 }));
    expect(orders.get('a')!.hurry).toBe(true);
  });

  it('a bot well ahead of its squadmate waits for it, and both are headed for the same place', () => {
    const orders = planner().plan(situation([seat('a', 1, 120, 0), seat('b', 1, 40, 0)]));
    expect(orders.get('a')!.rally).toEqual(orders.get('b')!.rally);
    const [near, far] = apart(orders.get('a')!.rally, [120, 0]) < apart(orders.get('a')!.rally, [40, 0]) ? ['a', 'b'] : ['b', 'a'];
    expect(orders.get(near)!.wait).toBe(true);
    expect(orders.get(far)!.wait).toBe(false);
  });

  it('bots in a person’s Squad go with the person', () => {
    const orders = planner().plan(situation([seat('h', 1, 40, 40, { bot: false }), seat('b', 1, 10, 10)]));
    expect(orders.has('h')).toBe(false);
    expect(apart(orders.get('b')!.rally, [40, 40])).toBeLessThan(5);
  });

  it('no seat of a Squad going home to a person outside the Ring follows them out', () => {
    const orders = planner().plan(situation([seat('h', 1, 520, 0, { bot: false }), seat('b', 1, 400, 0)]));
    expect(apart(orders.get('b')!.rally, [100, 0])).toBeLessThan(300);
  });
});

const shot = (x: number, z: number): SimEvent => ({ type: 'shot', shooter: 'x', weapon: 'm4a1', origin: [x, 1.5, z], direction: [1, 0, 0], index: 0, fraction: 0 }) as SimEvent;
const nobody = () => undefined;

describe('each bot decides for itself (ticket 64)', () => {
  it('no seat leads: squadmates join where one of them said it is going', () => {
    const p = planner();
    const orders = p.plan(situation([seat('a', 1, 110, 10), seat('b', 1, 130, -10), seat('c', 1, 120, 20)]));
    expect(orders.get('b')!.rally).toEqual(orders.get('a')!.rally);
    expect(orders.get('c')!.rally).toEqual(orders.get('a')!.rally);
    expect(p.intel(1).heading('a')?.point).toEqual(orders.get('a')!.rally);
  });

  it('nothing in it follows the pace of the match: a field thinning fast or slow gets the same ground', () => {
    const field = (left: number) => Array.from({ length: left }, (_, i) => seat(`s${i}`, i + 1, 20 * i, 0));
    const fast = planner().plan(situation(field(6), { time: 300, state: state({ squads: 6 }) })).get('s0')!;
    const slow = planner().plan(situation(field(29), { time: 300, state: state({ squads: 29 }) })).get('s0')!;
    expect([fast.rally, fast.hunt, fast.hurry, fast.wait]).toEqual([slow.rally, slow.hunt, slow.hurry, slow.wait]);
  });

  it('a bold bot goes after a fight it hears, never after a Squad that makes no sound', () => {
    const p = planner();
    // A silent enemy 60 m off, and a fight 200 m off: only the fight can be known.
    const seats = [seat('a', 1, 0, 0, { bold: 1 }), seat('h', 2, 60, 0, { bot: false })];
    let rally: Vec3 | null = null;
    for (let t = 10; t < 200 && !rally; t += 1) {
      if (t % 2 === 0) p.hear([shot(200, 0), shot(201, 1)], nobody, t);
      const order = p.plan(situation(seats, { time: t })).get('a')!;
      if (order.hunt) rally = order.rally;
    }
    expect(rally).not.toBeNull();
    expect(apart(rally!, [212.5, 12.5])).toBeLessThan(20);
  });

  it('gunfire beyond earshot draws nobody, and a careful bot lets the fights it hears go by', () => {
    const far = planner();
    const careful = planner();
    let hunts = 0;
    for (let t = 10; t < 200; t += 1) {
      if (t % 2 === 0) {
        far.hear([shot(-260, 0)], nobody, t);
        careful.hear([shot(200, 0)], nobody, t);
      }
      if (far.plan(situation([seat('a', 1, 160, 0, { bold: 1 })], { time: t })).get('a')!.hunt) hunts += 1;
      if (careful.plan(situation([seat('a', 1, 0, 0, { bold: 0 })], { time: t })).get('a')!.hunt) hunts += 1;
    }
    expect(hunts).toBe(0);
  });

  it('a Squad hit or Downed is on its guard, and the kill feed clears the dead from every Squad', () => {
    const p = planner();
    const where = (id: string) => ({ a: { team: 1, position: [0, 0, 0] as Vec3 }, e: { team: 2, position: [20, 0, 0] as Vec3 } })[id];
    p.intel(1).report('e', { position: [20, 0, 0], time: 4, seen: true, velocity: [0, 0, 0], by: 'a' });
    p.hear([{ type: 'down', attacker: 'e', victim: 'a', cause: 'bullet', zone: 'head', weapon: 'm4a1' } as SimEvent], where, 5);
    expect(p.intel(1).contact).toBe(5);
    p.hear([{ type: 'kill', killer: 'a', victim: 'e', cause: 'bullet' } as unknown as SimEvent], where, 6);
    expect([...p.intel(1).callouts(6)]).toEqual([]);
  });
});


describe('a person is a squadmate like any other (ticket 74)', () => {
  it('the person’s moves are news to the Squad: a Heading with the time they were made', () => {
    const p = planner();
    p.plan(situation([seat('h', 1, 40, 40, { bot: false }), seat('b', 1, 10, 10)], { time: 10 }));
    p.plan(situation([seat('h', 1, 150, -60, { bot: false }), seat('b', 1, 12, 10)], { time: 30 }));
    expect(p.intel(1).heading('h')).toMatchObject({ point: [150, 0, -60], time: 30 });
  });

  it('a bot weighs the person’s Heading as it weighs a bot squadmate’s: its own newer choice stands', () => {
    // The person stands still all along; the bot's own shifts about are its own to make, as with a bot squadmate who said nothing new.
    const p = planner();
    let own = 0;
    for (let t = 10; t < 200; t += 1) {
      const order = p.plan(situation([seat('h', 1, 40, 40, { bot: false }), seat('b', 1, 12, 10, { bold: 1 })], { time: t })).get('b')!;
      if (apart(order.rally, [40, 40]) > 5) own += 1;
    }
    expect(own).toBeGreaterThan(0);
  });

  it('when the person moves on, a bot that went its own way joins where the person went', () => {
    const p = planner();
    for (let t = 10; t < 200; t += 1) p.plan(situation([seat('h', 1, 40, 40, { bot: false }), seat('b', 1, 12, 10, { bold: 1 })], { time: t }));
    const order = p.plan(situation([seat('h', 1, 180, 30, { bot: false }), seat('b', 1, 12, 10, { bold: 1 })], { time: 200 })).get('b')!;
    expect(apart(order.rally, [180, 30])).toBeLessThan(5);
  });
});

describe('the island hears only what made a sound (ticket 74)', () => {
  const where = (id: string) => (id === 'v' ? { team: 2, position: [50, 0, 0] as Vec3 } : undefined);
  const kill = (cause: string): SimEvent => ({ type: 'kill', killer: cause === 'bullet' ? 'k' : null, victim: 'v', cause, zone: null, weapon: null }) as unknown as SimEvent;

  it('a death to the Ring or a Bleed-out makes no noise on the grid', () => {
    for (const cause of ['ring', 'bleedOut', 'wipe', 'fall']) {
      const p = planner();
      p.hear([kill(cause)], where, 10);
      expect(p.noise.heat([50, 0, 0], 10), cause).toBe(0);
    }
  });

  it('a kill by gunfire or a blast does', () => {
    for (const cause of ['bullet', 'grenade']) {
      const p = planner();
      p.hear([kill(cause)], where, 10);
      expect(p.noise.heat([50, 0, 0], 10), cause).toBeGreaterThan(0);
    }
  });
});
