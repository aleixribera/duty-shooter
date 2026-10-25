import { describe, expect, it } from 'vitest';
import { applyLook, cmPer360, verticalFov } from '../src/input/look';

const deg = (d: number) => (d * Math.PI) / 180;

describe('mouse look on the MW2019 sensitivity scale', () => {
  it('turns 0.0066 degrees per count per sensitivity unit', () => {
    // 1000 counts to the right at sensitivity 5 = 33 degrees to the right (yaw is positive to the left).
    const view = applyLook({ yaw: 0, pitch: 0 }, { x: 1000, y: 0 }, 5);

    expect(view.yaw).toBeCloseTo(deg(-33), 9);
    expect(view.pitch).toBe(0);
  });

  it('looks down when the mouse moves down (not inverted)', () => {
    const view = applyLook({ yaw: 0, pitch: 0 }, { x: 0, y: 100 }, 1);

    expect(view.pitch).toBeCloseTo(deg(-0.66), 9);
  });

  it('stops pitch at the view limit', () => {
    expect(applyLook({ yaw: 0, pitch: 0 }, { x: 0, y: -1e6 }, 1).pitch).toBeCloseTo(deg(85), 9);
    expect(applyLook({ yaw: 0, pitch: 0 }, { x: 0, y: 1e6 }, 1).pitch).toBeCloseTo(deg(-85), 9);
  });

  it('gives the same cm/360 as MW2019 for a sensitivity and DPI', () => {
    // 360 / (0.0066 * 5 * 800) inches = 34.64 cm.
    expect(cmPer360(5, 800)).toBeCloseTo(34.636, 2);
  });
});

describe('field of view', () => {
  it.each([
    { horizontal: 80, vertical: 50.53 },
    { horizontal: 60, vertical: 35.98 },
    { horizontal: 120, vertical: 88.5 },
  ])('treats $horizontal degrees as horizontal at 16:9 ($vertical vertical, Hor+)', ({ horizontal, vertical }) => {
    expect(verticalFov(horizontal)).toBeCloseTo(vertical, 1);
  });
});
