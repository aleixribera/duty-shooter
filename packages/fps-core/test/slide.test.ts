import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { durationWhile, expectStat, hold, holdUntil, horizontalDistance, me, soloMatch, ticks, tolerance } from './support/movement';

const { movement, slide } = STATS;

const sprint = usercmd({ forward: 1, buttons: ['Sprint'] });
const slideCmd = usercmd({ forward: 1, buttons: ['Sprint', 'Crouch'] });
const isSliding = (p: { movement: string }) => p.movement === 'slide';

/** A match whose player is sprinting at full speed. */
function sprinting() {
  const match = soloMatch();
  hold(match, ticks(1.5), sprint);
  return match;
}

describe('slide', () => {
  it('slides from a sprint for the slide duration and distance, crouched', () => {
    const match = sprinting();
    const before = me(match.latest);

    const outputs = hold(match, ticks(slide.duration.value + 1), slideCmd);

    expect(outputs[0]).toMatchObject({ movement: 'slide', stance: 'crouch' });
    const seconds = durationWhile(outputs, 0, isSliding);
    expectStat(seconds, slide.duration, 'slide duration');
    const end = outputs[ticks(seconds) - 1]!;
    expectStat(horizontalDistance(before, end), slide.distance, 'slide distance');
    expect(outputs.at(-1)).toMatchObject({ movement: 'walk', stance: 'crouch' });
  });

  it('only slides out of a sprint; crouching from a walk just crouches', () => {
    const match = soloMatch();
    hold(match, ticks(1), usercmd({ forward: 1 }));

    const outputs = hold(match, ticks(0.5), usercmd({ forward: 1, buttons: ['Crouch'] }));

    expect(outputs.some(isSliding)).toBe(false);
    expect(outputs.at(-1)?.stance).toBe('crouch');
  });

  it('stands up at the end of the slide when crouch was let go', () => {
    const match = sprinting();
    hold(match, 1, slideCmd);

    const outputs = holdUntil(match, usercmd({ forward: 1 }), (p) => !isSliding(p));

    expect(outputs.at(-1)?.stance).toBe('stand');
  });
});

describe('slide-cancel', () => {
  const open = slide.cancelWindowOpen.value;
  const tol = tolerance(slide.cancelWindowOpen);

  it('cancels into a standing sprint when crouch is released once the window is open', () => {
    const match = sprinting();
    hold(match, ticks(open + tol), slideCmd);

    const after = me(match.step({ p: sprint }));

    expect(after).toMatchObject({ movement: 'sprint', stance: 'stand' });
  });

  it('ignores a release before the window opens: the slide runs its full duration', () => {
    const match = sprinting();
    const early = hold(match, ticks(open - tol), slideCmd);

    const rest = hold(match, ticks(slide.duration.value), sprint);

    expect(rest[0]?.movement).toBe('slide');
    expectStat(durationWhile([...early, ...rest], 0, isSliding), slide.duration, 'slide duration after an early release');
  });

  it('cancels into a jump when jump is pressed once the window is open', () => {
    const match = sprinting();
    hold(match, ticks(open + tol), slideCmd);

    const after = me(match.step({ p: usercmd({ forward: 1, buttons: ['Sprint', 'Crouch', 'Jump'] }) }));

    expect(after).toMatchObject({ movement: 'airborne', stance: 'stand' });
    expect(after.velocity[1]).toBeGreaterThan(0);
  });

  it('refreshes tactical sprint, as slide-cancelling did in MW2019', () => {
    const tac = usercmd({ forward: 1, buttons: ['Sprint', 'TacticalSprint'] });
    const match = sprinting();
    holdUntil(match, tac, (p) => p.movement === 'sprint');
    hold(match, ticks(open + tol), usercmd({ forward: 1, buttons: ['Sprint', 'TacticalSprint', 'Crouch'] }));

    const outputs = hold(match, ticks(movement.tacticalSprintDuration.value + 1), tac);

    expect(outputs[0]?.movement).toBe('tacticalSprint');
    expectStat(durationWhile(outputs, 0, (p) => p.movement === 'tacticalSprint'), movement.tacticalSprintDuration, 'refreshed tactical sprint');
  });
});
