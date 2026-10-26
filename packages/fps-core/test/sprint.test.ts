import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { durationWhile, expectStat, hold, holdUntil, measuredSpeed, soloMatch, ticks, tolerance } from './support/movement';

const { movement } = STATS;

const sprint = usercmd({ forward: 1, buttons: ['Sprint'] });
/** The client sets TacticalSprint (with Sprint) after a double-tap of the sprint key. */
const tacSprint = usercmd({ forward: 1, buttons: ['Sprint', 'TacticalSprint'] });

const isTac = (p: { movement: string }) => p.movement === 'tacticalSprint';

describe('sprint', () => {
  it('sprints forward at the sprint speed', () => {
    const outputs = hold(soloMatch(), ticks(2), sprint);

    expectStat(measuredSpeed(outputs), movement.sprintSpeed, 'sprint speed');
    expect(outputs.at(-1)?.movement).toBe('sprint');
  });

  it('does not sprint while aiming down sights or moving backwards', () => {
    const ads = hold(soloMatch(), ticks(1), usercmd({ forward: 1, buttons: ['Sprint', 'Ads'] }));
    const back = hold(soloMatch(), ticks(1), usercmd({ forward: -1, buttons: ['Sprint'] }));

    expect(ads.at(-1)?.movement).toBe('walk');
    expect(back.at(-1)?.movement).toBe('walk');
  });
});

describe('tactical sprint', () => {
  it('runs at the tactical sprint speed for its duration, then drops to a normal sprint', () => {
    const match = soloMatch();
    hold(match, ticks(1), sprint);

    const outputs = hold(match, ticks(movement.tacticalSprintDuration.value + 1), tacSprint);

    expect(outputs[0]?.movement).toBe('tacticalSprint');
    expectStat(durationWhile(outputs, 0, isTac), movement.tacticalSprintDuration, 'tactical sprint duration');
    expectStat(measuredSpeed(outputs.slice(0, ticks(movement.tacticalSprintDuration.value))), movement.tacticalSprintSpeed, 'tactical sprint speed');
    expect(outputs.at(-1)?.movement).toBe('sprint');
  });

  it('recharges fully after the recharge time, and only partly before it', () => {
    const exhaust = (match: ReturnType<typeof soloMatch>) => {
      hold(match, ticks(1), sprint);
      holdUntil(match, tacSprint, (p) => !isTac(p));
    };
    const tacDurationAfterRest = (restSeconds: number) => {
      const match = soloMatch();
      exhaust(match);
      hold(match, ticks(restSeconds), sprint);
      const outputs = hold(match, ticks(movement.tacticalSprintDuration.value + 1), tacSprint);
      return durationWhile(outputs, 0, isTac);
    };

    const recharge = movement.tacticalSprintRecharge.value + tolerance(movement.tacticalSprintRecharge);
    expectStat(tacDurationAfterRest(recharge), movement.tacticalSprintDuration, 'tactical sprint duration after full recharge');

    const partial = tacDurationAfterRest(movement.tacticalSprintRecharge.value / 2);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(movement.tacticalSprintDuration.value - tolerance(movement.tacticalSprintDuration));
  });

  it('needs a fresh double-tap to start again after running out', () => {
    const match = soloMatch();
    hold(match, ticks(1), sprint);
    hold(match, ticks(movement.tacticalSprintDuration.value + 1), tacSprint);

    // Keep holding: stamina recharges, but tactical sprint does not restart by itself.
    const held = hold(match, ticks(movement.tacticalSprintRecharge.value + tolerance(movement.tacticalSprintRecharge)), tacSprint);

    expect(held.some(isTac)).toBe(false);
  });
});
