import { describe, expect, it } from 'vitest';
import { DISTANCE_HOLD, RangeStats } from '../src/range-stats';

const TICK = 1 / 60;

describe('the Practice Range panel', () => {
  it("counts a fast gun's shot that left before its first hit landed (review 2026-11-14b: the Wasp's 5 shots, 6 hits)", () => {
    // The Wasp at the 25 m dummy: 950 rpm fires every ~4 ticks, and its round flies 25 / 375 s, also ~4 ticks. A tick
    // fires before it moves bullets, so shot 2 leaves in the tick shot 1 lands.
    const stats = new RangeStats(TICK);
    const travel = 25 / 375;
    const shots = [0, 4, 8, 12].map((k) => k * TICK);
    const lands = shots.map((t) => t + Math.ceil(travel / TICK) * TICK);
    let last = { ttk: null as number | null, shots: 0, hits: 0 };
    const events = [...shots.map((t) => ({ t, kind: 'shot' as const })), ...lands.map((t) => ({ t, kind: 'hit' as const }))].sort((a, b) => a.t - b.t || (a.kind === 'shot' ? -1 : 1));
    for (const e of events) {
      if (e.kind === 'shot') stats.shot(e.t);
      else last = stats.hit('dummy-25', e.t, travel, false);
      expect(last.shots).toBeGreaterThanOrEqual(last.hits);
    }
    expect(last).toEqual({ ttk: null, shots: 4, hits: 4 });
  });

  it('starts the count at the shot that hit, not at a miss before it', () => {
    const stats = new RangeStats(TICK);
    stats.shot(0);
    stats.shot(10 * TICK);
    expect(stats.hit('dummy-10', 12 * TICK, 2 * TICK, false)).toEqual({ ttk: null, shots: 1, hits: 1 });
    stats.shot(20 * TICK);
    const kill = stats.hit('dummy-10', 22 * TICK, 2 * TICK, true);
    expect(kill).toMatchObject({ shots: 2, hits: 2 });
    expect(kill.ttk).toBeCloseTo(12 * TICK, 9);
  });

  it('forgets every engagement when cleared, so a new gun starts its own', () => {
    const stats = new RangeStats(TICK);
    stats.shot(0);
    stats.hit('dummy-25', 4 * TICK, 4 * TICK, false);
    stats.shot(30 * TICK);
    stats.clear();
    stats.shot(60 * TICK);
    const kill = stats.hit('dummy-25', 64 * TICK, 4 * TICK, true);
    expect(kill).toMatchObject({ shots: 1, hits: 1 });
    expect(kill.ttk).toBeCloseTo(4 * TICK, 9);
  });

  it("keeps the Distance a burst began on through its kick, then reads live again (the sniper's 64.1 m)", () => {
    const stats = new RangeStats(TICK);
    expect(stats.distance(0, () => 25)).toBe(25);
    stats.shot(TICK);
    expect(stats.distance(2 * TICK, () => 64.1)).toBe(25);
    stats.shot(10 * TICK);
    expect(stats.distance(10 * TICK + DISTANCE_HOLD - TICK, () => 64.1)).toBe(25);
    expect(stats.distance(10 * TICK + DISTANCE_HOLD, () => 30)).toBe(30);
  });
});
