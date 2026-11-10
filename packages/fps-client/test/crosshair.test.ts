import { describe, expect, it } from 'vitest';
import { DEFAULT_CROSSHAIR, crosshairGap, crosshairLayout, type CrosshairOptions } from '../src/hud/crosshair';

const having = (patch: Partial<CrosshairOptions>): CrosshairOptions => ({ ...DEFAULT_CROSSHAIR, ...patch });

describe('the crosshair', () => {
  it('is by default the one the game always had: 9 px arms 2 px thick with a dot, opening with the spread from 4 px', () => {
    const still = crosshairLayout(DEFAULT_CROSSHAIR, 1);
    expect(still.arms[0]).toEqual({ x: -13, y: -1, w: 9, h: 2 });
    expect(still.arms[1]).toEqual({ x: 4, y: -1, w: 9, h: 2 });
    expect(still.arms[2]).toEqual({ x: -1, y: -13, w: 2, h: 9 });
    expect(still.arms[3]).toEqual({ x: -1, y: 4, w: 2, h: 9 });
    expect(still.dot).toEqual({ x: -1, y: -1, w: 2, h: 2 });
    expect(still.ring).toBeNull();
    expect(crosshairLayout(DEFAULT_CROSSHAIR, 22.3).arms[1]!.x).toBe(22.5);
  });

  it('stands still when it is told not to spread with movement', () => {
    const fixed = having({ dynamic: false, gap: 6 });
    expect(crosshairGap(fixed, 2)).toBe(6);
    expect(crosshairGap(fixed, 40)).toBe(6);
    expect(crosshairLayout(fixed, 40)).toEqual(crosshairLayout(fixed, 0));
  });

  it('never closes past its gap while it spreads', () => {
    expect(crosshairGap(having({ gap: 10 }), 3)).toBe(10);
    expect(crosshairGap(having({ gap: 10 }), 14)).toBe(14);
  });

  it('takes its size, gap and thickness', () => {
    const l = crosshairLayout(having({ size: 16, gap: 8, thickness: 4, dynamic: false }), 0);
    expect(l.arms[0]).toEqual({ x: -24, y: -2, w: 16, h: 4 });
    expect(l.arms[3]).toEqual({ x: -2, y: 8, w: 4, h: 16 });
    expect(l.dot).toEqual({ x: -2, y: -2, w: 4, h: 4 });
  });

  it('drops the top arm as a T, the arms as a circle, and everything but the dot as a dot', () => {
    const tee = crosshairLayout(having({ shape: 'tee' }), 0);
    expect(tee.arms[2]).toBeNull();
    expect(tee.arms.filter(Boolean)).toHaveLength(3);
    const circle = crosshairLayout(having({ shape: 'circle', dot: false, gap: 8, dynamic: false }), 0);
    expect(circle.arms.every((a) => a === null)).toBe(true);
    expect(circle.dot).toBeNull();
    expect(circle.ring).toEqual({ x: -10, y: -10, w: 20, h: 20, line: 2 });
    const dot = crosshairLayout(having({ shape: 'dot', dot: false, thickness: 3 }), 30);
    expect(dot.arms.every((a) => a === null)).toBe(true);
    expect(dot.ring).toBeNull();
    expect(dot.dot).toEqual({ x: -3, y: -3, w: 6, h: 6 });
  });

  it('has no dot when the dot is off', () => {
    expect(crosshairLayout(having({ dot: false }), 0).dot).toBeNull();
  });

  it('opens its circle with the spread', () => {
    const narrow = crosshairLayout(having({ shape: 'circle' }), 4).ring!;
    const wide = crosshairLayout(having({ shape: 'circle' }), 30).ring!;
    expect(wide.w).toBeGreaterThan(narrow.w);
  });
});
