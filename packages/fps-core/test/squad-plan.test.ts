import { describe, expect, it } from 'vitest';
import { STATS, type SimEvent, type Vec3 } from '@duty-shooter/fps-core';
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

describe('Supply Drops (ticket 71)', () => {
  const crate: Vec3 = [140, 0, 20];
  const announced = (over: Partial<BattleRoyaleState['drops'] & object>[number] | object = {}) => state({ drops: [{ stage: 2, position: crate, lands: 30, ...over }] });

  it('bold, healthy bots near one go for it, and work it once it has landed; the careful far away mostly leave it', () => {
    let went = 0;
    let far = 0;
    for (let i = 0; i < 40; i++) {
      const p = new SquadPlanner((x, z): Vec3 => [x, 0, z], i);
      p.plan(situation([seat('a', 1, 100, 0, { bold: 0.9 }), seat('b', 2, -150, 0, { bold: 0.1 })], { time: 5, state: state() }));
      const orders = p.plan(situation([seat('a', 1, 100, 0, { bold: 0.9 }), seat('b', 2, -150, 0, { bold: 0.1 })], { time: 10, state: announced() }));
      if (apart(orders.get('a')!.rally, [crate[0], crate[2]]) < 1) went += 1;
      if (apart(orders.get('b')!.rally, [crate[0], crate[2]]) < 1) far += 1;
    }
    expect(went).toBeGreaterThan(20);
    expect(far).toBeLessThan(went / 3);
  });

  it('one that went holds use at it once it has landed and it is near, and lets it go once it is opened', () => {
    for (let i = 0; i < 40; i++) {
      const p = new SquadPlanner((x, z): Vec3 => [x, 0, z], i);
      const a = (x: number, z: number) => seat('a', 1, x, z, { bold: 1 });
      p.plan(situation([a(100, 0)], { time: 5 }));
      if (apart(p.plan(situation([a(100, 0)], { time: 10, state: announced() })).get('a')!.rally, [crate[0], crate[2]]) > 1) continue;
      expect(p.plan(situation([a(138, 20)], { time: 20, state: announced() })).get('a')!.use).toBeUndefined();
      expect(p.plan(situation([a(138, 20)], { time: 31, state: announced() })).get('a')!.use).toEqual(crate);
      const after = p.plan(situation([a(138, 20)], { time: 34, state: announced({ opened: 'x' }) })).get('a')!;
      expect(after.use).toBeUndefined();
      return;
    }
    throw new Error('no bot went for the crate');
  });

  it('a bot with the sniper already leaves it to others', () => {
    for (let i = 0; i < 20; i++) {
      const p = new SquadPlanner((x, z): Vec3 => [x, 0, z], i);
      p.plan(situation([seat('a', 1, 120, 0, { bold: 1, sniper: true })], { time: 5 }));
      expect(apart(p.plan(situation([seat('a', 1, 120, 0, { bold: 1, sniper: true })], { time: 10, state: announced() })).get('a')!.rally, [crate[0], crate[2]])).toBeGreaterThan(1);
    }
  });

  it('squadmates who join a run to it work it too', () => {
    for (let i = 0; i < 40; i++) {
      const p = new SquadPlanner((x, z): Vec3 => [x, 0, z], i);
      const squad = [seat('a', 1, 120, 0, { bold: 1 }), seat('b', 1, 124, 2, { bold: 0 })];
      p.plan(situation(squad, { time: 5 }));
      const o = p.plan(situation(squad, { time: 10, state: announced() }));
      if (apart(o.get('a')!.rally, [crate[0], crate[2]]) > 1) continue;
      expect(o.get('b')!.rally).toEqual(crate);
      const later = p.plan(situation([seat('a', 1, 120, 0, { bold: 1 }), seat('b', 1, 139, 20, { bold: 0 })], { time: 31, state: announced() }));
      expect(later.get('b')!.rally).toEqual(crate);
      expect(later.get('b')!.use).toEqual(crate);
      return;
    }
    throw new Error('no bot went for the crate');
  });
});

describe('a Reboot Card out of reach', () => {
  const lying = (at: Vec3) => state({ reboot: true, cards: [{ owner: 'a', team: 1, position: at, until: 100 }] });

  it('sends a bot to a Card it can reach, and none to one lying where no route goes (the sea, a roof)', () => {
    const card: Vec3 = [60, 0, 0];
    const seats = [seat('b', 1, 40, 0)];
    const asked: Vec3[] = [];
    const reachable = new SquadPlanner((x, z): Vec3 => [x, 0, z], 7, { area: () => 0, spot: (_from, to) => (asked.push(to), to) });
    expect(reachable.plan(situation(seats, { state: lying(card) })).get('b')!.use).toEqual(card);
    const out = new SquadPlanner((x, z): Vec3 => [x, 0, z], 7, { area: () => 0, spot: (_from, to) => (asked.push(to), null) });
    const order = out.plan(situation(seats, { state: lying(card) })).get('b')!;
    expect(order.use).toBeUndefined();
    expect(order.rally).not.toEqual(card);
    // Asked once a Card, not every plan.
    out.plan(situation(seats, { state: lying(card), time: 11 }));
    expect(asked).toHaveLength(2);
  });

  it('asks again for a bot in another part of the nav, and sends it by the nav spot to within reach of the Card (review, ticket 70)', () => {
    const card: Vec3 = [60, 0, 0];
    // The nav stands 3 m off the Card; only the part of the nav east of x = 50 has a route to it.
    const asked: number[] = [];
    const planner = new SquadPlanner((x, z): Vec3 => [x, 0, z], 7, {
      area: (at) => (at[0] > 50 ? 1 : 0),
      spot: (from) => (asked.push(from[0] > 50 ? 1 : 0), from[0] > 50 ? [60, 0, 3] : null),
    });
    // The nearest bot is cut off: nobody goes.
    expect(planner.plan(situation([seat('b', 1, 45, 0), seat('c', 1, 90, 0)], { state: lying(card) })).get('b')!.use).toBeUndefined();
    // Once the bot that can get there is the nearest, it is asked for, and goes.
    const order = planner.plan(situation([seat('b', 1, 20, 0), seat('c', 1, 70, 0)], { state: lying(card), time: 11 })).get('c')!;
    expect(asked).toEqual([0, 1]);
    expect(order.use).toBeDefined();
    const stand = order.use!;
    expect(Math.hypot(stand[0] - card[0], stand[2] - card[2])).toBeLessThanOrEqual(STATS.royale.reboot.cardReach.value / 2 + 1e-9);
    expect(stand[2]).toBeGreaterThan(0);
  });
});

describe('a person’s pings are what they said (ticket 66)', () => {
  const ping = (kind: 'go' | 'help', at: Vec3, time: number) => ({ type: 'ping' as const, id: 1, kind, player: 'h', team: 1, position: at, target: null, until: time + 20 });
  /** Bot b's rally once person h, standing at 40,40 all along, pings `kind` at `at`. */
  const after = (kind: 'go' | 'help', at: Vec3, b: PlannedSeat) => {
    const p = planner();
    for (let t = 10; t < 200; t += 1) p.plan(situation([seat('h', 1, 40, 40, { bot: false }), b], { time: t }));
    p.intel(1).heard(ping(kind, at, 200), [0, 0, 0], 200);
    const first = p.plan(situation([seat('h', 1, 40, 40, { bot: false }), b], { time: 200 })).get('b')!.rally;
    // The person hasn't moved: their feet don't take the ping back.
    const later = p.plan(situation([seat('h', 1, 40, 40, { bot: false }), b], { time: 205 })).get('b')!.rally;
    return { first, later, heading: p.intel(1).heading('h') };
  };

  it('"Going here": a bot joins where the person pinged, and the Heading stands while they make their way', () => {
    const r = after('go', [180, 0, 30], seat('b', 1, 12, 10, { bold: 0.5 }));
    expect(apart(r.first, [180, 30])).toBeLessThan(5);
    expect(apart(r.later, [180, 30])).toBeLessThan(5);
    expect(r.heading).toMatchObject({ point: [180, 0, 30], ping: 'go' });
  });

  it('"Need help": answered by a bot near enough for its boldness; a careful one far off keeps to its own', () => {
    const help: Vec3 = [250, 0, 0];
    expect(apart(after('help', help, seat('b', 1, 60, 0, { bold: 1 })).first, [250, 0])).toBeLessThan(5);
    expect(apart(after('help', help, seat('b', 1, 200, 0, { bold: 0 })).first, [250, 0])).toBeLessThan(5);
    expect(apart(after('help', help, seat('b', 1, 100, 0, { bold: 0 })).first, [250, 0])).toBeGreaterThan(5);
  });
});
