import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, type Stat, type UserCmd } from '@duty-shooter/fps-core';
import { box, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, expectStat, hold, horizontalSpeed, measuredSpeed, me, soloMatch, ticks } from './support/movement';

const { movement, stance } = STATS;

const stand = usercmd();
const crouch = usercmd({ buttons: ['Crouch'] });
const prone = usercmd({ buttons: ['Prone'] });

/** Seconds from the first tick of `cmd` until the reported eye height settles on `eye`. */
function transitionTime(match: HeadlessMatch, cmd: UserCmd, eye: Stat): number {
  const outputs = hold(match, ticks(3), cmd);
  const index = outputs.findIndex((p) => Math.abs(p.eyeHeight - eye.value) < 1e-9);
  if (index < 0) throw new Error(`eye height never reached ${eye.value}`);
  return (index + 1) * TICK_SECONDS;
}

describe('crouch', () => {
  it('lowers the eye from standing to crouching height in the stand-crouch time, and back', () => {
    const match = soloMatch();
    expect(me(match.step({ p: stand })).eyeHeight).toBe(stance.standEyeHeight.value);

    expectStat(transitionTime(match, crouch, stance.crouchEyeHeight), stance.standCrouchTime, 'stand to crouch');
    expect(me(match.latest).stance).toBe('crouch');

    expectStat(transitionTime(match, stand, stance.standEyeHeight), stance.standCrouchTime, 'crouch to stand');
    expect(me(match.latest).stance).toBe('stand');
  });

  it('walks crouched slower than standing, by the crouch multiplier', () => {
    const walk = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: 1 })));
    const crouched = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: 1, buttons: ['Crouch'] })));

    expectStat(crouched / walk, movement.crouchMultiplier, 'crouch speed ratio');
  });

  it('cannot sprint while crouched', () => {
    const outputs = hold(soloMatch(), ticks(1), usercmd({ forward: 1, buttons: ['Crouch', 'Sprint'] }));

    expect(outputs.at(-1)).toMatchObject({ stance: 'crouch', movement: 'walk' });
  });

  it('stays crouched under a ceiling too low to stand in', () => {
    const ceilingY = (stance.crouchHullHeight.value + stance.standHullHeight.value) / 2;
    const ceiling = box({ min: [-2, ceilingY, -2], max: [2, ceilingY + 0.5, 2], material: 'concrete' });
    const match = soloMatch({ boxes: [FLOOR, ceiling] });
    hold(match, ticks(1), crouch);

    const outputs = hold(match, ticks(1), stand);

    expect(outputs.at(-1)).toMatchObject({ stance: 'crouch', eyeHeight: stance.crouchEyeHeight.value });
  });
});

describe('prone', () => {
  it('goes prone in the to-prone time, without moving until down', () => {
    const match = soloMatch();
    const crawl = usercmd({ forward: 1, buttons: ['Prone'] });

    const outputs = hold(match, ticks(3), crawl);
    const down = outputs.findIndex((p) => Math.abs(p.eyeHeight - stance.proneEyeHeight.value) < 1e-9);

    expect(outputs[0]?.stance).toBe('prone');
    expectStat((down + 1) * TICK_SECONDS, stance.toProneTime, 'stand to prone');
    const beforeDown = outputs.slice(0, down);
    expect(Math.max(...beforeDown.map(horizontalSpeed))).toBe(0);
  });

  it('crawls slower than walking, by the prone multiplier', () => {
    const walk = measuredSpeed(hold(soloMatch(), ticks(3), usercmd({ forward: 1 })));
    const crawl = measuredSpeed(hold(soloMatch(), ticks(3), usercmd({ forward: 1, buttons: ['Prone'] })));

    expectStat(crawl / walk, movement.proneMultiplier, 'prone speed ratio');
  });

  it('gets up to standing in the prone-to-stand time', () => {
    const match = soloMatch();
    hold(match, ticks(2), prone);

    expectStat(transitionTime(match, stand, stance.standEyeHeight), stance.proneToStandTime, 'prone to stand');
    expect(me(match.latest).stance).toBe('stand');
  });

  it('gets up to crouching in the prone-to-crouch time', () => {
    const match = soloMatch();
    hold(match, ticks(2), prone);

    expectStat(transitionTime(match, crouch, stance.crouchEyeHeight), stance.proneToCrouchTime, 'prone to crouch');
    expect(me(match.latest).stance).toBe('crouch');
  });

  it('goes prone from crouching in the to-prone time', () => {
    const match = soloMatch();
    hold(match, ticks(1), crouch);

    expectStat(transitionTime(match, prone, stance.proneEyeHeight), stance.toProneTime, 'crouch to prone');
  });
});
