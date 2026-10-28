import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, hold, soloMatch, ticks } from './support/movement';

const { movement, stance } = STATS;

/** Half the width of a map door (1.15 m, as Survival Town and Switchyard build them). */
const DOOR_HALF = 0.575;
/** A wall across the player's path (they look down -Z) from z = -2.2 to -2, with a door centred on x = 0. */
const WALL = [
  box({ min: [-10, 0, -2.2], max: [-DOOR_HALF, 3, -2], material: 'wood' }),
  box({ min: [DOOR_HALF, 0, -2.2], max: [10, 3, -2], material: 'wood' }),
  box({ min: [-DOOR_HALF, 2.15, -2.2], max: [DOOR_HALF, 3, -2], material: 'wood' }),
];
/** How far off the door's centre the hull starts to catch the frame. */
const SNAG = DOOR_HALF - stance.hullHalfWidth.value;

function walkAtDoor(x: number, solids = [FLOOR, ...WALL]) {
  return hold(soloMatch({ solids, position: [x, 0, 0] }), ticks(2), usercmd({ forward: 1 })).at(-1)!;
}

describe('door assist', () => {
  it('slips a player who catches the frame through the door', () => {
    for (const x of [SNAG + 0.05, SNAG + movement.doorAssistReach.value - 0.02, -(SNAG + 0.1)]) {
      const end = walkAtDoor(x);
      expect(end.position[2], `starting ${x.toFixed(2)} m off centre`).toBeLessThan(-3);
      expect(Math.abs(end.position[0])).toBeLessThanOrEqual(SNAG + 1e-6);
    }
  });

  it('does not pull a player through the wall from further out than its reach', () => {
    const x = SNAG + movement.doorAssistReach.value + 0.05;
    const end = walkAtDoor(x);
    expect(end.position[2]).toBeGreaterThan(-2);
    expect(end.position[0]).toBeCloseTo(x, 9);
  });

  it('leaves a player walking into a plain wall where they are', () => {
    const wall = box({ min: [-10, 0, -2.2], max: [10, 3, -2], material: 'wood' });
    const end = walkAtDoor(0.3, [FLOOR, wall]);
    expect(end.position[0]).toBeCloseTo(0.3, 9);
    expect(end.position[2]).toBeGreaterThan(-2);
  });
});
