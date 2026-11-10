import { describe, expect, it } from 'vitest';
import { DEG, recoilKick, STATS, TICK_SECONDS, viewDirection } from '@duty-shooter/fps-core';
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
  return createHeadlessMatch({ solids: [FLOOR, wallAt(-500)], players: [{ id: SHOOTER, team: 1, position: [0, 0, 0] }] });
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
  for (const [label, buttons, stat] of [['sprint', ['Sprint'], W.sprintToFire]] as const) {
    it(`cannot fire out of a ${label} until the ${label}-to-fire time has passed`, () => {
      const match = range();
      drawn(match);
      match.run(ticks(1), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons }) }));
      expect(playerIn(match.latest, SHOOTER).movement).toBe('sprint');
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
  });

  it('the reserve is unlimited: every reload fills the magazine, however many came before', () => {
    const match = range();
    drawn(match);
    for (let mag = 0; mag < 6; mag++) {
      match.run(Math.floor(((W.magazineSize.value - 1) * SHOT_INTERVAL) / TICK_SECONDS) + 1, () => ({ [SHOOTER]: fire }));
      expect(weaponOf(match).ammo, `magazine ${mag + 1} emptied`).toBe(0);
      match.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) });
      match.run(ticks(W.emptyReloadDuration.value + 0.2), () => ({ [SHOOTER]: idle }));
      expect(weaponOf(match), `magazine ${mag + 1} reloaded`).toMatchObject({ action: 'ready', ammo: W.magazineSize.value });
    }
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

  it('sprinting does not cancel a reload: it carries on and adds the rounds', () => {
    const match = fired(5);
    reload(match, W.tacticalReloadAddAmmo.value - 0.3);

    const sprint = usercmd({ forward: 1, buttons: ['Sprint'] });
    const during = match.run(ticks(0.1), () => ({ [SHOOTER]: sprint }));
    expect(playerIn(during.at(-1)!, SHOOTER).movement).toBe('sprint');
    expect(playerIn(during.at(-1)!, SHOOTER).weapon.action).toBe('reload');

    const outputs = match.run(ticks(W.tacticalReloadDuration.value), () => ({ [SHOOTER]: sprint }));
    const w = playerIn(outputs.at(-1)!, SHOOTER).weapon;
    expect(w).toMatchObject({ action: 'ready', ammo: W.magazineSize.value });
    expect(eventsOf([...during, ...outputs], 'reload').map((e) => e.phase)).toEqual(['addAmmo']);
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
    let worst = 0;
    let count = 0;
    for (let i = 0; i < ticks(seconds); i++) {
      const out = match.step({ [SHOOTER]: cmdFor(i) });
      for (const shot of eventsOf([out], 'shot')) {
        // The view the shot left from: this tick's, less the shot's own kick (recoil comes back before the shot, the kick lands after).
        const view = playerIn(out, SHOOTER);
        const kick = recoilKick(shot.index);
        worst = Math.max(worst, angleBetween(shot.direction, viewDirection(view.yaw - kick.yaw * DEG, view.pitch - kick.pitch * DEG)));
        count++;
      }
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
    const pitches = outputs.map((o) => playerIn(o, SHOOTER).pitch);
    return { shots: eventsOf(outputs, 'shot').map((s) => s.direction), last: playerIn(outputs.at(-1)!, SHOOTER), peak: Math.max(...pitches), match };
  }

  it('repeats exactly: the same burst always follows the same pattern', () => {
    expect(dump().shots).toEqual(dump().shots);
  });

  it('climbs: the view rises over the burst, with a bigger first-shot kick', () => {
    const { peak, shots } = dump();

    expect(peak).toBeGreaterThan(W.magazineSize.value * A.verticalKick.value * DEG * 0.9);
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

describe('recoil that returns (next-level ticket 09)', () => {
  const aimed = (pitch = 0) => usercmd({ pitch, buttons: ['Ads'] });
  const pitchOf = (match: HeadlessMatch) => playerIn(match.latest, SHOOTER).pitch;

  /** Five rounds of automatic fire from a level aim; the match the tick after the last, and how high the view got. */
  function burst() {
    const match = range();
    drawn(match);
    match.run(ticks(0.5), () => ({ [SHOOTER]: aimed() }));
    const outputs = match.run(ticks(SHOT_INTERVAL * 4.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'] }) }));
    expect(eventsOf(outputs, 'shot')).toHaveLength(5);
    const kicked = (A.firstShotKick.value + 4 * A.verticalKick.value) * DEG;
    expect(pitchOf(match)).toBeCloseTo(kicked, 9);
    return { match, kicked };
  }

  it('brings most of a burst back once the gun is quiet, and leaves the rest', () => {
    const { match, kicked } = burst();

    const outputs = match.run(ticks(1.5), () => ({ [SHOOTER]: aimed() }));

    expect(pitchOf(match)).toBeCloseTo(kicked * (1 - A.recoilReturn.value), 6);
    // Nothing moves before the delay; after it the view only ever comes down.
    const pitches = outputs.map((o) => playerIn(o, SHOOTER).pitch);
    const held = ticks(A.recoilReturnDelay.value - SHOT_INTERVAL / 2) - 2;
    for (let i = 0; i < held; i++) expect(pitches[i]).toBeCloseTo(kicked, 9);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]!).toBeLessThanOrEqual(pitches[i - 1]! + 1e-12);
    // Most of the way back within twice its time.
    const soon = pitches[ticks(A.recoilReturnDelay.value + 2 * A.recoilReturnTime.value)]!;
    expect(kicked - soon).toBeGreaterThan(kicked * A.recoilReturn.value * 0.8);
  });

  it('gives nothing back in the middle of a spray', () => {
    const match = range();
    drawn(match);
    match.run(ticks(0.5), () => ({ [SHOOTER]: aimed() }));

    const outputs = match.run(ticks(SHOT_INTERVAL * 20), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads', 'Fire'] }) }));

    const pitches = outputs.map((o) => playerIn(o, SHOOTER).pitch);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]!).toBeGreaterThanOrEqual(pitches[i - 1]!);
  });

  it('does not bring back what the player has already pulled down', () => {
    const { match, kicked } = burst();

    // The whole climb pulled down by hand: the view is level again, and stays there.
    match.run(ticks(1.5), () => ({ [SHOOTER]: aimed(-kicked) }));

    expect(pitchOf(match)).toBeCloseTo(0, 9);
  });

  it('brings back only what is still owed after half a pull', () => {
    const { match, kicked } = burst();

    match.run(ticks(1.5), () => ({ [SHOOTER]: aimed(-kicked / 2) }));

    // Half pulled by hand, and of the 70 % owed the other 20 % came back by itself.
    expect(pitchOf(match)).toBeCloseTo(kicked * (1 - 0.5 - (A.recoilReturn.value - 0.5)), 6);
  });

  it('is not paid by a pull the same way as the kick', () => {
    const { match, kicked } = burst();

    match.run(ticks(1.5), () => ({ [SHOOTER]: aimed(kicked) }));

    expect(pitchOf(match)).toBeCloseTo(kicked + kicked * (1 - A.recoilReturn.value), 6);
  });

  it('repeats exactly: the same burst and the same pull end in the same state', () => {
    const run = () => {
      const { match, kicked } = burst();
      match.run(ticks(0.4), (t) => ({ [SHOOTER]: aimed(-kicked * 0.3 * Math.sin(t)) }));
      return match.latest;
    };

    expect(run()).toEqual(run());
  });
});

describe('projectiles', () => {
  it('travel at the muzzle velocity and drop under gravity', () => {
    const distance = 100;
    const match = lane(400, { solids: [FLOOR, wallAt(-distance)] });
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
