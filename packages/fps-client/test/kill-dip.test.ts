import { describe, expect, it } from 'vitest';
import { DIP_BACK, DIP_DOWN, DIP_HOLD, KillDip, dipAt } from '../src/viewmodel/kill-dip';

const run = (dip: KillDip, seconds: number, dt = 1 / 60): number => {
  let v = dip.value;
  for (let t = 0; t < seconds - 1e-9; t += dt) v = dip.update(Math.min(dt, seconds - t));
  return v;
};

describe('the kill dip (PLAN 9f)', () => {
  it('rests at zero until a kill', () => {
    const dip = new KillDip();
    expect(run(dip, 1)).toBe(0);
  });

  it('drops fast, holds about 150 ms at the bottom, and is back within 700 ms', () => {
    expect(dipAt(0)).toBe(0);
    expect(dipAt(DIP_DOWN)).toBe(1);
    expect(dipAt(DIP_HOLD)).toBe(1);
    expect(dipAt(DIP_HOLD + DIP_BACK)).toBe(0);
    expect(DIP_HOLD - DIP_DOWN).toBeCloseTo(0.14);
    expect(DIP_HOLD + DIP_BACK).toBeLessThanOrEqual(0.7);
    // The way back never jumps: no step over a twentieth between 10 ms samples.
    for (let t = DIP_HOLD; t < 0.7; t += 0.01) expect(Math.abs(dipAt(t + 0.01) - dipAt(t))).toBeLessThan(0.05);
  });

  it('is well down at the 250 ms frame, still a third down at 500 ms, and done by 700 ms', () => {
    const dip = new KillDip();
    dip.kill();
    expect(run(dip, 0.25)).toBeGreaterThan(0.9);
    expect(run(dip, 0.25)).toBeGreaterThan(0.3);
    expect(run(dip, 0.2)).toBe(0);
  });

  it('a second kill while coming back carries on down from where it is', () => {
    const dip = new KillDip();
    dip.kill();
    const before = run(dip, 0.4);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    dip.kill();
    expect(dip.update(1 / 240)).toBeGreaterThanOrEqual(before);
    expect(run(dip, 0.1)).toBe(1);
  });

  it('a second kill at the bottom holds it there afresh', () => {
    const dip = new KillDip();
    dip.kill();
    expect(run(dip, 0.1)).toBe(1);
    dip.kill();
    expect(run(dip, DIP_HOLD - DIP_DOWN - 0.01)).toBe(1);
    expect(run(dip, DIP_BACK + 0.02)).toBe(0);
  });
});
