import { describe, expect, it } from 'vitest';
import { DEG, STATS, TICK_SECONDS, isShellReload, viewDirection, type ShellReload } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { fightTo, holding, measuredKill, trigger } from './support/arsenal';
import { SHOOTER, TARGET, aimAt, angleBetween, eventsOf, playerIn } from './support/combat';
import { ticks } from './support/movement';

const S = STATS.weapons.shotgun;
const PELLETS = S.damage.pellets!.value;
const RELOAD = S.reload as ShellReload;
const idle = usercmd();

describe('the shotgun blast', () => {
  it('throws its pellets in a spread inside the cone, the same every time for the same shot', () => {
    const blast = () => {
      const m = holding('shotgun');
      const before = playerIn(m.latest, SHOOTER);
      const shot = eventsOf([m.step({ [SHOOTER]: trigger('shotgun') })], 'shot')[0]!;
      return { shot, view: viewDirection(before.yaw, before.pitch), cone: before.weapon.spread * DEG };
    };
    const { shot, view, cone } = blast();

    expect(shot.pellets).toHaveLength(PELLETS);
    const angles = shot.pellets!.map((p) => angleBetween(p, view));
    for (const a of angles) expect(a).toBeLessThanOrEqual(cone + 1e-9);
    // A visible spread: pellets reach well out into the cone and don't stack.
    expect(Math.max(...angles)).toBeGreaterThan(cone * 0.5);
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBe(PELLETS);
    expect(blast().shot.pellets).toEqual(shot.pellets);
  });

  it('merges the pellets that hit one player into one hit, with the summed damage', () => {
    const m = holding('shotgun', 12);
    const outputs = fightTo(m, 'shotgun', 'upperTorso', { seconds: TICK_SECONDS * 3 });
    const hits = eventsOf(outputs, 'hit').filter((h) => h.victim === TARGET);

    expect(hits).toHaveLength(1);
    expect(hits[0]!.pellets).toBeGreaterThan(1);
    expect(hits[0]!.weapon).toBe('shotgun');
    expect(100 - playerIn(m.latest, TARGET).health).toBeCloseTo(hits[0]!.damage, 6);
  });
});

describe('shotgun kills', () => {
  it('kills in one blast from the hip within 5 m', () => {
    for (const distance of [2.5, 4, 5]) {
      for (const zone of ['upperTorso', 'lowerTorso'] as const) {
        expect(measuredKill('shotgun', distance, zone, { hip: true }).hits, `${zone} at ${distance} m`).toBe(1);
      }
    }
  });

  it('kills in two aimed blasts or fewer within 12 m', () => {
    for (const distance of [7, 10, 12]) expect(measuredKill('shotgun', distance).hits, `${distance} m`).toBeLessThanOrEqual(2);
  });

  it('has no reliable kill past 18 m: two aimed blasts leave the target standing', () => {
    for (const distance of [20, 30]) {
      const m = holding('shotgun', distance);
      fightTo(m, 'shotgun', 'upperTorso', { seconds: S.handling.cycleTime!.value * 1.5 });
      expect(eventsOf(m.history, 'shot').length, `${distance} m`).toBe(2);
      expect(playerIn(m.latest, TARGET).alive, `${distance} m`).toBe(true);
    }
  });
});

describe('the pump', () => {
  it('works the pump after every shot', () => {
    const m = holding('shotgun');
    m.step({ [SHOOTER]: trigger('shotgun') });
    expect(playerIn(m.latest, SHOOTER).weapon.action).toBe('cycle');
    const cycling = m.run(ticks(S.handling.cycleTime!.value), () => ({ [SHOOTER]: idle })).map((o) => playerIn(o, SHOOTER).weapon.action);
    expect((cycling.indexOf('ready') + 2) * TICK_SECONDS).toBeCloseTo(S.handling.cycleTime!.value, 1);
  });
});

describe('the shell reload', () => {
  it('is a shell reload', () => {
    expect(isShellReload(S.reload)).toBe(true);
  });

  /** Fires `n` blasts, lets the pump finish, and presses reload; returns each tick's outputs from the press. */
  function reloadAfter(n: number, seconds: number, then = idle) {
    const m = holding('shotgun');
    for (let fired = 0; fired < n; ) fired += eventsOf([m.step({ [SHOOTER]: trigger('shotgun') })], 'shot').length;
    m.run(ticks(S.handling.cycleTime!.value + 0.1), () => ({ [SHOOTER]: idle }));
    return { m, outputs: [m.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) }), ...m.run(ticks(seconds), () => ({ [SHOOTER]: then }))] };
  }

  it('loads one shell at a time until the tube is full', () => {
    const { outputs } = reloadAfter(3, 3);
    const shells = eventsOf(outputs, 'reload').filter((e) => e.phase === 'addAmmo');
    const start = outputs[0]!.tick;

    expect(shells).toHaveLength(3);
    shells.forEach((e, k) => expect((e.tick - start + 1) * TICK_SECONDS, `shell ${k + 1}`).toBeCloseTo(RELOAD.start.value + k * RELOAD.perShell.value, 1));
    const ready = outputs.findIndex((o) => playerIn(o, SHOOTER).weapon.action === 'ready');
    expect((ready + 1) * TICK_SECONDS).toBeCloseTo(RELOAD.start.value + 2 * RELOAD.perShell.value + RELOAD.end.value, 1);
    expect(playerIn(outputs.at(-1)!, SHOOTER).weapon.ammo).toBe(S.handling.magazineSize.value);
  });

  it('chambers a round at the end when it started empty', () => {
    const n = S.handling.magazineSize.value;
    const { outputs } = reloadAfter(n, 5);
    const ready = outputs.findIndex((o) => playerIn(o, SHOOTER).weapon.action === 'ready');
    expect(playerIn(outputs[0]!, SHOOTER).weapon.reload).toBe('empty');
    expect((ready + 1) * TICK_SECONDS).toBeCloseTo(RELOAD.start.value + (n - 1) * RELOAD.perShell.value + RELOAD.chamber.value + RELOAD.end.value, 1);
  });

  it('stops when fired once a shell is in, and fires', () => {
    const { m, outputs } = reloadAfter(4, RELOAD.start.value + 0.1);
    expect(playerIn(m.latest, SHOOTER).weapon).toMatchObject({ action: 'reload', ammo: 3 });
    const fired = m.step({ [SHOOTER]: trigger('shotgun') });

    expect(eventsOf([fired], 'shot')).toHaveLength(1);
    expect(playerIn(fired, SHOOTER).weapon).toMatchObject({ action: 'cycle', ammo: 2 });
    expect(eventsOf(outputs, 'reload').filter((e) => e.phase === 'cancel')).toHaveLength(0);
  });
});

describe('shotgun penetration', () => {
  it('stops pellets at two wooden walls that a rifle round goes through', () => {
    const walls = [box({ min: [-10, 0, -3.2], max: [10, 4, -3], material: 'wood' }), box({ min: [-10, 0, -4.2], max: [10, 4, -4], material: 'wood' })];
    const through = (id: 'shotgun' | 'm4a1') => {
      const m = holding(id, 7, walls);
      m.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'], ...aimAt(m, 'upperTorso') }) }));
      const outputs = [m.step({ [SHOOTER]: trigger(id, 1 << 1, aimAt(m, 'upperTorso')) }), ...m.run(ticks(0.2), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) }))];
      return eventsOf(outputs, 'hit').filter((h) => h.victim === TARGET);
    };

    expect(S.damage.penetration.value).toBeLessThan(STATS.weapons.m4a1.damage.penetration.value);
    expect(through('m4a1').length).toBeGreaterThan(0);
    expect(through('shotgun')).toHaveLength(0);
  });
});
