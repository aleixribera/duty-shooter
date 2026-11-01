import { describe, expect, it } from 'vitest';
import { TickCosts } from '../src/tick-costs';

describe('tick costs', () => {
  it('reads percentiles from what was recorded, to a quarter of a millisecond', () => {
    const costs = new TickCosts();
    for (let i = 0; i < 98; i++) costs.record(1.1);
    costs.record(9.1);
    costs.record(30);
    const taken = costs.take();
    expect(taken.ticks).toBe(100);
    expect(taken.p50).toBe(1.25);
    expect(taken.p99).toBe(9.25);
    expect(taken.slowest).toBe(30);
    expect(taken.average).toBeCloseTo((98 * 1.1 + 9.1 + 30) / 100, 6);
  });

  it('starts afresh after each take', () => {
    const costs = new TickCosts();
    costs.record(50);
    costs.take();
    expect(costs.take()).toMatchObject({ ticks: 0, average: 0, p50: 0, p99: 0, slowest: 0 });
  });

  it('merges windows into the distribution of the whole run', () => {
    const one = new TickCosts();
    const two = new TickCosts();
    for (let i = 0; i < 50; i++) one.record(1);
    for (let i = 0; i < 50; i++) two.record(11);
    const merged = TickCosts.merge([one.take(), two.take()]);
    expect(merged.ticks).toBe(100);
    expect(merged.p50).toBe(1);
    expect(merged.p99).toBe(11);
    expect(merged.average).toBe(6);
  });

  it('keeps a tick beyond the histogram as its top bucket and its true worst', () => {
    const costs = new TickCosts();
    costs.record(5000);
    expect(costs.take()).toMatchObject({ slowest: 5000, p99: 100 });
  });
});
