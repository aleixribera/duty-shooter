import { describe, expect, it } from 'vitest';
import { STATS, type Vec3 } from '@duty-shooter/fps-core';
import { SquadPlanner, expectedShare, wallAt, type PlannedSeat, type SquadSituation } from '../src/bots/squad-plan';
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
const situation = (seats: readonly PlannedSeat[], over: Partial<SquadSituation> = {}): SquadSituation => ({ time: 10, played: 0.02, state: state(), seats, ...over });
const apart = (a: Vec3, b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[2] - b[1]);

describe('the wall', () => {
  it('holds, then closes on the next circle', () => {
    const s = state();
    expect(wallAt(s, 30)).toEqual(s.circle);
    expect(wallAt(s, 95)).toEqual({ x: 50, z: 0, radius: 400 });
    expect(wallAt(s, 500)).toEqual(s.next);
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

  it('a straggler is sent to its leader, and the leader waits for it', () => {
    const orders = planner().plan(situation([seat('a', 1, 0, 0), seat('b', 1, 60, 0)]));
    expect(apart(orders.get('b')!.rally, [0, 0])).toBeLessThan(5);
    expect(orders.get('a')!.wait).toBe(true);
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

describe('a Revive with judgement', () => {
  const down = (bleedOut: number, x = 3) => seat('d', 1, x, 0, { downed: { bleedOut, revive: 0 } });

  it('the nearest mate on its feet goes', () => {
    const orders = planner().plan(situation([seat('a', 1, 0, 0), seat('c', 1, 30, 0), down(25)]));
    expect(orders.get('a')!.revive).toEqual([3, 0, 0]);
    expect(orders.get('c')!.revive).toBeNull();
  });

  it('not when the Bleed-out would beat it there', () => {
    const orders = planner().plan(situation([seat('a', 1, 0, 0), down(4)]));
    expect(orders.get('a')!.revive).toBeNull();
  });

  it('not when the wall will have passed the seat before it is done', () => {
    // A seat 5 m inside a wall closing at 4 m/s, a 5 s Revive away from being outside it.
    const wall = wallAt(state(), 100);
    const x = wall.x - wall.radius + 5;
    const orders = planner().plan(situation([seat('a', 1, x + 2, 0), seat('d', 1, x, 0, { downed: { bleedOut: 25, revive: 0 } })], { time: 100 }));
    expect(orders.get('a')!.revive).toBeNull();
  });

  it('a person isn’t ordered, and a Downed bot gets no walking orders', () => {
    const orders = planner().plan(situation([seat('h', 1, 0, 0, { bot: false }), seat('d', 1, 2, 0, { downed: { bleedOut: 20, revive: 0 } })]));
    expect(orders.has('h')).toBe(false);
    expect(orders.get('d')!.revive).toBeNull();
  });
});

describe('the pace of a match', () => {
  it('expects the field to thin steadily, and a few to reach the last Stage', () => {
    const rows = [0, 0.25, 0.5, 0.75, 0.9].map(expectedShare);
    for (const [i, share] of rows.entries()) if (i > 0) expect(share).toBeLessThan(rows[i - 1]!);
    expect(expectedShare(0)).toBe(1);
    expect(expectedShare(0.85)).toBeGreaterThan(2 / 30);
  });

  const field = (left: number) => Array.from({ length: left }, (_, i) => seat(`s${i}`, i + 1, 20 * i, 0));

  it('a field dying too fast cools every bot off', () => {
    const cold = planner().plan(situation(field(6), { time: 300, played: 0.5, state: state({ squads: 30, squadSize: 2 }) }));
    const hot = planner().plan(situation(field(29), { time: 300, played: 0.5, state: state({ squads: 30, squadSize: 2 }) }));
    expect(cold.get('s0')!.engage).toBeLessThan(hot.get('s0')!.engage);
    const hunters = (o: typeof cold) => [...o.values()].filter((x) => x.hunt).length;
    expect(hunters(cold)).toBe(0);
    expect(hunters(hot)).toBeGreaterThan(0);
  });

  it('hunters go for the nearest other Squad, whoever is in it', () => {
    const seats = [seat('a', 1, 0, 0), seat('h', 2, 60, 0, { bot: false }), seat('c', 3, -300, 0), ...Array.from({ length: 27 }, (_, i) => seat(`s${i}`, i + 4, 100 + 5 * i, 300))];
    const p = planner();
    let hunted = false;
    for (let t = 300; t < 400 && !hunted; t += 10) {
      const order = p.plan(situation(seats, { time: t, played: 0.5, state: state({ squads: 30, squadSize: 1 }) })).get('a')!;
      if (order.hunt) {
        hunted = true;
        expect(apart(order.rally, [60, 0])).toBeLessThan(STATS.royale.reviveReach.value * 15);
      }
    }
    expect(hunted).toBe(true);
  });
});
