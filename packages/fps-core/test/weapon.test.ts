import { describe, expect, it } from 'vitest';
import { DEG, STATS, TICK_SECONDS, viewDirection } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { SHOOTER, SHOT_INTERVAL, angleBetween, drawn, eventsOf, lane, playerIn, shotTime, wallAt } from './support/combat';
import { FLOOR, expectStat, ticks } from './support/movement';

const W = STATS.weapon;
const A = STATS.accuracy;

const fire = usercmd({ buttons: ['Fire'] });
const idle = usercmd();
const weaponOf = (match: HeadlessMatch) => playerIn(match.latest, SHOOTER).weapon;

/** An empty range with a far wall and no target. */
function range() {
  return createHeadlessMatch({ boxes: [FLOOR, wallAt(-500)], players: [{ id: SHOOTER, team: 1, position: [0, 0, 0] }] });
}

describe('draw', () => {
  it('draws the weapon on spawn and cannot fire until the draw time has passed', () => {
    const match = range();

    const outputs = match.run(ticks(W.drawTime.value + 0.5), () => ({ [SHOOTER]: fire }));

    expect(playerIn(outputs[0]!, SHOOTER).weapon.action).toBe('draw');
    const first = eventsOf(outputs, 'shot')[0]!;
    expectStat(shotTime(first), W.drawTime, 'first shot after spawn');
  });
});

describe('fire rate', () => {
  it('fires full-auto at the stats-file rate while fire is held', () => {
    const match = range();
    drawn(match);

    const shots = eventsOf(match.run(ticks(1.5), () => ({ [SHOOTER]: fire })), 'shot');

    const intervals = shots.slice(1).map((s, i) => shotTime(s) - shotTime(shots[i]!));
    for (const interval of intervals) expect(interval).toBeCloseTo(SHOT_INTERVAL, 9);
    const rpm = (60 * (shots.length - 1)) / (shotTime(shots.at(-1)!) - shotTime(shots[0]!));
    expectStat(rpm, W.fireRate, 'measured fire rate');
  });

  it('fires a press at its sub-tick time, not at the tick boundary', () => {
    const match = range();
    drawn(match);

    const out = match.step({ [SHOOTER]: usercmd({ buttons: ['Fire'], firePresses: [0.6] }) });

    expect(eventsOf([out], 'shot')[0]?.fraction).toBeCloseTo(0.6, 9);
  });

  it('fires one shot for a tap shorter than a tick', () => {
    const match = range();
    drawn(match);

    const outputs = [match.step({ [SHOOTER]: usercmd({ firePresses: [0.3] }) }), ...match.run(10, () => ({ [SHOOTER]: idle }))];

    expect(eventsOf(outputs, 'shot')).toHaveLength(1);
  });

  it('empties the 30-round magazine, then stops', () => {
    const match = range();
    drawn(match);

    const outputs = match.run(ticks(SHOT_INTERVAL * W.magazineSize.value + 0.5), () => ({ [SHOOTER]: fire }));

    expect(eventsOf(outputs, 'shot')).toHaveLength(W.magazineSize.value);
    expect(playerIn(outputs.at(-1)!, SHOOTER).weapon).toMatchObject({ ammo: 0, action: 'reload', reload: 'empty' });
  });
});

describe('ADS', () => {
  it('aims in over the ADS time and out over the same time', () => {
    const match = range();
    drawn(match);

    const aimIn = match.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) })).map((o) => playerIn(o, SHOOTER).weapon.ads);
    const aimOut = match.run(ticks(1), () => ({ [SHOOTER]: idle })).map((o) => playerIn(o, SHOOTER).weapon.ads);

    expectStat((aimIn.findIndex((a) => a === 1) + 1) * TICK_SECONDS, W.adsTime, 'ADS-in time');
    expectStat((aimOut.findIndex((a) => a === 0) + 1) * TICK_SECONDS, W.adsTime, 'ADS-out time');
  });

  it('has no spread when fully aimed: every shot leaves along the view', () => {
    const match = range();
    drawn(match);
    match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }));

    const outputs = [match.latest, ...match.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'] }) }))];

    expect(playerIn(match.latest, SHOOTER).weapon.spread).toBe(0);
    for (let i = 1; i < outputs.length; i++) {
      for (const shot of eventsOf([outputs[i]!], 'shot')) {
        const view = playerIn(outputs[i - 1]!, SHOOTER);
        expect(angleBetween(shot.direction, viewDirection(view.yaw, view.pitch))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('sprint-to-fire', () => {
  for (const [label, buttons, stat] of [
    ['sprint', ['Sprint'], W.sprintToFire],
    ['tactical sprint', ['Sprint', 'TacticalSprint'], W.tacticalSprintToFire],
  ] as const) {
    it(`cannot fire out of a ${label} until the ${label}-to-fire time has passed`, () => {
      const match = range();
      drawn(match);
      match.run(ticks(1), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons }) }));
      expect(playerIn(match.latest, SHOOTER).movement).toBe(label === 'sprint' ? 'sprint' : 'tacticalSprint');
      const sprintEnd = match.latest.tick * TICK_SECONDS;

      // Pressing fire while sprinting stops the sprint; the shot waits out the lock.
      const outputs = match.run(ticks(1), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons: [...buttons, 'Fire'] }) }));

      expect(playerIn(outputs[0]!, SHOOTER).movement).toBe('walk');
      expectStat(shotTime(eventsOf(outputs, 'shot')[0]!) - sprintEnd, stat, `${label}-to-fire`);
    });
  }
});

describe('reload', () => {
  /** Fires exactly `n` shots and lets go of the trigger. */
  function fired(n: number) {
    const match = range();
    drawn(match);
    match.run(Math.floor(((n - 1) * SHOT_INTERVAL) / TICK_SECONDS) + 1, () => ({ [SHOOTER]: fire }));
    match.run(ticks(0.2), () => ({ [SHOOTER]: idle }));
    return match;
  }

  /** Presses reload and returns each tick's weapon outputs. */
  function reload(match: HeadlessMatch, seconds: number, after = idle) {
    const first = match.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) });
    return [first, ...match.run(ticks(seconds), () => ({ [SHOOTER]: after }))].map((o) => playerIn(o, SHOOTER).weapon);
  }

  /** Seconds from the reload press (tick 1 of `outputs`) until `predicate` first holds. */
  const timeUntil = (outputs: { ammo: number; action: string }[], predicate: (w: { ammo: number; action: string }) => boolean) =>
    (outputs.findIndex(predicate) + 1) * TICK_SECONDS;

  it('tactical reload: adds the rounds at the add-ammo point and finishes at the end of the animation', () => {
    const match = fired(5);
    const before = weaponOf(match);
    expect(before.ammo).toBe(W.magazineSize.value - 5);

    const outputs = reload(match, 3);

    expect(outputs[0]).toMatchObject({ action: 'reload', reload: 'tactical' });
    expectStat(timeUntil(outputs, (w) => w.ammo === W.magazineSize.value), W.tacticalReloadAddAmmo, 'tactical add-ammo point');
    expectStat(timeUntil(outputs, (w) => w.action === 'ready'), W.tacticalReloadDuration, 'tactical reload duration');
    expect(outputs.at(-1)?.reserve).toBe(before.reserve - 5);
  });

  it('empty reload (bolt release) takes the longer empty timings', () => {
    const match = fired(W.magazineSize.value);
    expect(weaponOf(match).ammo).toBe(0);

    const outputs = reload(match, 4);

    expect(outputs[0]).toMatchObject({ action: 'reload', reload: 'empty' });
    expectStat(timeUntil(outputs, (w) => w.ammo === W.magazineSize.value), W.emptyReloadAddAmmo, 'empty add-ammo point');
    expectStat(timeUntil(outputs, (w) => w.action === 'ready'), W.emptyReloadDuration, 'empty reload duration');
  });

  it('pulling the trigger on an empty magazine starts an empty reload', () => {
    const match = fired(W.magazineSize.value);

    const out = playerIn(match.step({ [SHOOTER]: fire }), SHOOTER).weapon;

    expect(out).toMatchObject({ action: 'reload', reload: 'empty' });
  });

  it('sprinting before the add-ammo point cancels the reload with no rounds added', () => {
    const match = fired(5);
    reload(match, W.tacticalReloadAddAmmo.value - 0.3);

    const outputs = match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons: ['Sprint'] }) }));

    const w = playerIn(outputs.at(-1)!, SHOOTER).weapon;
    expect(w).toMatchObject({ action: 'ready', ammo: W.magazineSize.value - 5 });
    expect(eventsOf(outputs, 'reload').map((e) => e.phase)).toEqual(['cancel']);
  });

  it('sprinting after the add-ammo point ends the reload and keeps the rounds', () => {
    const match = fired(5);
    reload(match, W.tacticalReloadAddAmmo.value + 0.1);

    const w = playerIn(match.run(ticks(0.2), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons: ['Sprint'] }) })).at(-1)!, SHOOTER).weapon;

    expect(w).toMatchObject({ action: 'ready', ammo: W.magazineSize.value });
  });

  it('cannot fire before the add-ammo point; firing after it skips the rest of the animation', () => {
    const match = fired(5);
    const early = reload(match, W.tacticalReloadAddAmmo.value - 0.3, fire);
    expect(early.at(-1)?.action).toBe('reload');

    const outputs = match.run(ticks(0.5), () => ({ [SHOOTER]: fire }));

    const shot = eventsOf(outputs, 'shot')[0]!;
    expect(shot.tick * TICK_SECONDS).toBeLessThan((outputs[0]!.tick - 1) * TICK_SECONDS + 0.5);
    expect(playerIn(outputs.at(-1)!, SHOOTER).weapon.action).toBe('ready');
  });

  it('melee cancels a reload', () => {
    const match = fired(5);
    reload(match, 0.3);

    const out = playerIn(match.step({ [SHOOTER]: usercmd({ buttons: ['Melee'] }) }), SHOOTER).weapon;

    expect(out).toMatchObject({ action: 'melee', ammo: W.magazineSize.value - 5 });
  });
});

describe('inspect', () => {
  it('holding reload with a full magazine inspects; a tap does nothing', () => {
    const match = range();
    drawn(match);

    match.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) });
    expect(playerIn(match.run(5, () => ({ [SHOOTER]: idle })).at(-1)!, SHOOTER).weapon.action).toBe('ready');

    const held = match.run(ticks(W.inspectHoldTime.value) + 1, () => ({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) }));
    expect(playerIn(held.at(-1)!, SHOOTER).weapon.action).toBe('inspect');

    // Any action ends it.
    expect(playerIn(match.step({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }), SHOOTER).weapon.action).toBe('ready');
  });
});

describe('hipfire spread', () => {
  /** Largest angle between a shot and the view it was fired from, over a burst with `cmd`. */
  function spreadOver(setup: (m: HeadlessMatch) => void, cmdFor: (tick: number) => ReturnType<typeof usercmd>, seconds: number) {
    const match = range();
    drawn(match);
    setup(match);
    let prev = match.latest;
    let worst = 0;
    let count = 0;
    for (let i = 0; i < ticks(seconds); i++) {
      const out = match.step({ [SHOOTER]: cmdFor(i) });
      for (const shot of eventsOf([out], 'shot')) {
        const view = playerIn(prev, SHOOTER);
        worst = Math.max(worst, angleBetween(shot.direction, viewDirection(view.yaw, view.pitch)));
        count++;
      }
      prev = out;
    }
    return { worst: worst / DEG, count };
  }

  it('standing still, every shot lands inside the still spread cone, and the cone is used', () => {
    // Tap-fire so recoil resets do not matter; spread is about the cone only.
    const { worst, count } = spreadOver(() => {}, (i) => usercmd({ buttons: i % 6 === 0 ? ['Fire'] : [] }), 8);

    expect(count).toBeGreaterThan(20);
    expect(worst).toBeLessThanOrEqual(A.hipSpreadStill.value + 1e-9);
    expect(worst).toBeGreaterThan(A.hipSpreadStill.value * 0.7);
  });

  it('grows while moving and is largest airborne', () => {
    const walking = spreadOver(
      (m) => m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ right: 1 }) })),
      (i) => usercmd({ right: 1, buttons: i % 6 === 0 ? ['Fire'] : [] }),
      4,
    );
    const airborne = spreadOver(
      () => {},
      (i) => usercmd({ buttons: i % 50 === 0 ? ['Jump'] : i % 50 === 20 ? ['Fire'] : [] }),
      8,
    );

    expect(walking.worst).toBeGreaterThan(A.hipSpreadStill.value);
    expect(walking.worst).toBeLessThanOrEqual(A.hipSpreadMoving.value + 1e-9);
    expect(airborne.worst).toBeGreaterThan(A.hipSpreadMoving.value);
    expect(airborne.worst).toBeLessThanOrEqual(A.hipSpreadAirborne.value + 1e-9);
  });
});

describe('recoil', () => {
  /** Shot directions of a full ADS magazine dump with fixed usercmd angles. */
  function dump() {
    const match = range();
    drawn(match);
    match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }));
    const outputs = match.run(ticks(3), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'] }) }));
    return { shots: eventsOf(outputs, 'shot').map((s) => s.direction), last: playerIn(outputs.at(-1)!, SHOOTER), match };
  }

  it('repeats exactly: the same burst always follows the same pattern', () => {
    expect(dump().shots).toEqual(dump().shots);
  });

  it('climbs: the view rises over the burst, with a bigger first-shot kick', () => {
    const { last, shots } = dump();

    expect(last.pitch).toBeGreaterThan(W.magazineSize.value * A.verticalKick.value * DEG * 0.9);
    const rise = shots.map((d) => Math.asin(d[1]));
    expect(rise[1]! - rise[0]!).toBeCloseTo(A.firstShotKick.value * DEG, 9);
    expect(rise[2]! - rise[1]!).toBeCloseTo(A.verticalKick.value * DEG, 9);
  });

  it('restarts the pattern after a pause in fire', () => {
    const match = range();
    drawn(match);
    match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }));
    const burst = () => {
      const outs = match.run(ticks(SHOT_INTERVAL * 5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'] }) }));
      match.run(ticks(W.recoilResetTime.value) + 2, () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }));
      return eventsOf(outs, 'shot').map((s) => s.index);
    };

    expect(burst()[0]).toBe(0);
    expect(burst()[0]).toBe(0);
  });
});

describe('projectiles', () => {
  it('travel at the muzzle velocity and drop under gravity', () => {
    const distance = 100;
    const match = lane(400, { boxes: [FLOOR, wallAt(-distance)] });
    drawn(match);

    match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }));

    const outputs = [match.step({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'], firePresses: [0] }) }), ...match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }))];

    const shot = eventsOf(outputs, 'shot')[0]!;
    const impact = eventsOf(outputs, 'impact')[0]!;
    const flight = distance / W.muzzleVelocity.value;
    // The impact is reported on the tick the bullet arrives.
    expect(impact.tick).toBe(shot.tick + Math.ceil(flight / TICK_SECONDS - 1e-9) - 1);
    const drop = shot.origin[1] - impact.point[1];
    expect(drop).toBeCloseTo(0.5 * W.projectileGravity.value * flight * flight, 3);
    expect(impact.material).toBe('concrete');
    expect(impact.normal).toEqual([0, 0, 1]);
  });
});
