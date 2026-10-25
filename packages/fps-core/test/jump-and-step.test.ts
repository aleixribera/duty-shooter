import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, expectStat, hold, horizontalSpeed, me, soloMatch, ticks, tolerance } from './support/movement';

const { movement, stance } = STATS;

const jump = usercmd({ buttons: ['Jump'] });

/** A box in front of the spawn (the player looks down -Z) whose near face is 1 m away. */
function stepAhead(height: number) {
  return box({ min: [-2, 0, -30], max: [2, height, -1], material: 'wood' });
}

describe('jump', () => {
  it('rises to the jump height, is airborne, and lands back on the floor', () => {
    const match = soloMatch();

    const outputs = hold(match, ticks(1.5), jump);

    const peak = Math.max(...outputs.map((p) => p.position[1]));
    expectStat(peak, movement.jumpHeight, 'jump height');
    expect(outputs[0]?.movement).toBe('airborne');
    expect(outputs.at(-1)).toMatchObject({ movement: 'walk', position: [0, 0, 0], velocity: [0, 0, 0] });
  });

  it('needs a fresh press to jump again', () => {
    const match = soloMatch();
    hold(match, ticks(1.5), jump);

    const stillHeld = hold(match, ticks(0.5), jump);

    expect(stillHeld.every((p) => p.position[1] === 0)).toBe(true);
  });

  it('steers far less in the air than on the ground', () => {
    const strafe = usercmd({ right: 1 });
    const ground = hold(soloMatch(), ticks(0.3), strafe).at(-1);

    const air = soloMatch();
    air.step({ p: jump });
    const airborne = hold(air, ticks(0.3), strafe).at(-1);

    expect(airborne?.movement).toBe('airborne');
    expect(horizontalSpeed(airborne!)).toBeLessThan(horizontalSpeed(ground!) / 2);
  });

  it('cannot jump while crouched or prone', () => {
    for (const buttons of [['Crouch'], ['Prone']] as const) {
      const match = soloMatch();
      hold(match, ticks(1), usercmd({ buttons: [...buttons] }));

      const outputs = hold(match, ticks(0.5), usercmd({ buttons: [...buttons, 'Jump'] }));

      expect(outputs.every((p) => p.position[1] === 0)).toBe(true);
    }
  });
});

describe('step-up and ground snapping', () => {
  it('walks up onto a ledge no higher than the step height', () => {
    const height = movement.stepHeight.value - tolerance(movement.stepHeight);
    const match = soloMatch({ boxes: [FLOOR, stepAhead(height)] });

    const outputs = hold(match, ticks(1.5), usercmd({ forward: 1 }));

    const last = me(match.latest);
    expect(last.position[1]).toBeCloseTo(height, 9);
    expect(last.position[2]).toBeLessThan(-1.5);
    expect(outputs.some((p) => p.movement === 'airborne')).toBe(false);
  });

  it('is stopped by a ledge above the step height when not jumping', () => {
    const height = movement.stepHeight.value + tolerance(movement.stepHeight);
    const match = soloMatch({ boxes: [FLOOR, stepAhead(height)] });

    hold(match, ticks(1.5), usercmd({ forward: 1 }));

    const last = me(match.latest);
    expect(last.position[1]).toBe(0);
    expect(last.position[2]).toBeCloseTo(-1 + stance.hullHalfWidth.value, 9);
    expect(last.velocity).toEqual([0, 0, 0]);
  });

  it('stays on the ground walking down a step, but falls off a higher drop', () => {
    const step = movement.stepHeight.value - tolerance(movement.stepHeight);
    const drop = movement.stepHeight.value * 3;
    const platform = (h: number) => box({ min: [-2, 0, -1], max: [2, h, 1], material: 'wood' });

    const down = soloMatch({ boxes: [FLOOR, platform(step)], position: [0, step, 0] });
    const downOutputs = hold(down, ticks(1), usercmd({ forward: 1 }));
    expect(downOutputs.some((p) => p.movement === 'airborne')).toBe(false);
    expect(me(down.latest).position[1]).toBe(0);

    const off = soloMatch({ boxes: [FLOOR, platform(drop)], position: [0, drop, 0] });
    const offOutputs = hold(off, ticks(1), usercmd({ forward: 1 }));
    expect(offOutputs.some((p) => p.movement === 'airborne')).toBe(true);
    expect(me(off.latest).position[1]).toBe(0);
  });
});
