import { describe, expect, it } from 'vitest';
import { hitboxes, STATS } from '../src/index';

// The hit zones are gameplay: the soldier's look may change, these may not.
// The snapshot holds every stance's boxes as they were before the soldier rework.
describe('hitboxes', () => {
  const stance = STATS.stance;
  for (const [name, pose] of [
    ['standing', { stance: 'stand', eyeHeight: stance.standEyeHeight.value }],
    ['crouching', { stance: 'crouch', eyeHeight: stance.crouchEyeHeight.value }],
    ['halfway down to a crouch', { stance: 'crouch', eyeHeight: (stance.standEyeHeight.value + stance.crouchEyeHeight.value) / 2 }],
    ['prone', { stance: 'prone', eyeHeight: stance.proneEyeHeight.value }],
  ] as const) {
    it(`keeps every part's size and position ${name}`, () => {
      const boxes = hitboxes({ position: [0, 0, 0], yaw: 0, ...pose }).map((b) => ({ zone: b.zone, min: b.min.map((v) => +v.toFixed(4)), max: b.max.map((v) => +v.toFixed(4)) }));
      expect(boxes).toMatchSnapshot();
    });
  }
});
