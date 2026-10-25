import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { expectStat, hold, me, measuredSpeed, soloMatch, ticks } from './support/movement';

const { movement } = STATS;

describe('ground movement speeds', () => {
  it('walks forward at the walk speed, along the view direction', () => {
    const match = soloMatch();

    const outputs = hold(match, ticks(2), usercmd({ forward: 1 }));

    expectStat(measuredSpeed(outputs), movement.walkSpeed, 'walk speed');
    const last = me(match.latest);
    expect(last.position[2]).toBeLessThan(0); // yaw 0 looks down -Z
    expect(Math.abs(last.position[0])).toBeLessThan(1e-9);
    expect(last.position[1]).toBe(0);
  });

  it('strafes and backpedals slower than forward by the stats-file ratios', () => {
    const forward = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: 1 })));
    const strafe = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ right: 1 })));
    const back = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: -1 })));

    expectStat(strafe / forward, movement.strafeMultiplier, 'strafe ratio');
    expectStat(back / forward, movement.backpedalMultiplier, 'backpedal ratio');
  });

  it('walks slower while aiming down sights, by the ADS move multiplier', () => {
    const hip = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: 1 })));
    const ads = measuredSpeed(hold(soloMatch(), ticks(2), usercmd({ forward: 1, buttons: ['Ads'] })));

    expectStat(ads / hip, movement.adsMoveMultiplier, 'ADS speed ratio');
  });

  it('accelerates from standing and stops again when input is released', () => {
    const match = soloMatch();
    hold(match, ticks(2), usercmd({ forward: 1 }));
    const stopping = hold(match, ticks(1), usercmd());

    expect(stopping.at(-1)?.velocity).toEqual([0, 0, 0]);
  });
});
