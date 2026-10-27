import { describe, expect, it } from 'vitest';
import { Button, STATS, TICK_SECONDS, isShellReload, recoilKick, shotsToKill, timeToKill, type WeaponId } from '@duty-shooter/fps-core';
import { usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { holding, measuredKill, trigger } from './support/arsenal';
import { SHOOTER, eventsOf, playerIn, shotTime } from './support/combat';
import { ticks } from './support/movement';

/** The weapons whose handling this file checks against their rows (the M4A1 has its own file). */
const UNDER_TEST: readonly WeaponId[] = ['smg', 'pistol', 'shotgun', 'sniper'];

const row = (id: WeaponId) => STATS.weapons[id];
const idle = usercmd();
const weaponOf = (m: HeadlessMatch) => playerIn(m.latest, SHOOTER).weapon;

describe.each(UNDER_TEST)('%s handling against its row', (id) => {
  const h = row(id).handling;
  const interval = Math.max(60 / h.fireRate.value, h.cycleTime?.value ?? 0);

  it('fires at its rate, no faster however fast the trigger goes', () => {
    const m = holding(id);
    const shots = eventsOf(m.run(ticks(interval * 4 + 0.1), () => ({ [SHOOTER]: trigger(id) })), 'shot');
    expect(shots.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < shots.length; i++) expect(shotTime(shots[i]!) - shotTime(shots[i - 1]!)).toBeCloseTo(interval, 1);
    for (let i = 1; i < shots.length; i++) expect(shotTime(shots[i]!) - shotTime(shots[i - 1]!)).toBeGreaterThanOrEqual(interval - TICK_SECONDS - 1e-9);
  });

  it('holds its magazine, then reloads', () => {
    const m = holding(id);
    const outputs = m.run(ticks(interval * h.magazineSize.value + 0.3), () => ({ [SHOOTER]: trigger(id) }));
    const reload = eventsOf(outputs, 'reload')[0]!;
    expect(reload).toMatchObject({ phase: 'start', kind: 'empty' });
    expect(eventsOf(outputs, 'shot').filter((s) => s.tick <= reload.tick)).toHaveLength(h.magazineSize.value);
  });

  it('reloads on its row\'s timings', () => {
    const r = row(id).reload;
    if (isShellReload(r)) return;
    for (const [kind, shots, addAmmo, duration] of [
      ['tactical', 3, r.tacticalAddAmmo, r.tacticalDuration],
      ['empty', h.magazineSize.value, r.emptyAddAmmo, r.emptyDuration],
    ] as const) {
      const m = holding(id);
      for (let fired = 0; fired < shots; ) {
        fired += eventsOf([m.step({ [SHOOTER]: trigger(id) })], 'shot').length;
      }
      m.run(ticks(interval + 0.1), () => ({ [SHOOTER]: idle }));
      const outputs = [m.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) }), ...m.run(ticks(duration.value + 0.3), () => ({ [SHOOTER]: idle }))];
      const weapons = outputs.map((o) => playerIn(o, SHOOTER).weapon);
      expect(weapons[0]).toMatchObject({ action: 'reload', reload: kind });
      expect((weapons.findIndex((w) => w.ammo === h.magazineSize.value) + 1) * TICK_SECONDS, `${kind} add-ammo`).toBeCloseTo(addAmmo.value, 1);
      expect((weapons.findIndex((w) => w.action === 'ready') + 1) * TICK_SECONDS, `${kind} duration`).toBeCloseTo(duration.value, 1);
    }
  });

  it('aims down sights over its ADS time', () => {
    const m = holding(id);
    const ads = m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'] }) })).map((o) => playerIn(o, SHOOTER).weapon.ads);
    expect((ads.findIndex((a) => a === 1) + 1) * TICK_SECONDS).toBeCloseTo(h.adsTime.value, 1);
  });

  it('comes out of a sprint after its sprint-to-fire time', () => {
    const m = holding(id);
    m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ forward: 1, buttons: ['Sprint'] }) }));
    const sprintEnd = m.latest.tick * TICK_SECONDS;
    // Pulling the trigger mid-sprint stops the sprint; the shot waits out the lock.
    const shots = eventsOf(m.run(ticks(1), () => ({ [SHOOTER]: { ...trigger(id, Button.Sprint), forward: 1 } })), 'shot');
    expect(shotTime(shots[0]!) - sprintEnd).toBeCloseTo(h.sprintToFire.value, 1);
  });

  it('kills in the shots its damage bands say, at every range', () => {
    // Pellets don't all land past a few metres: the shotgun's file checks its kills.
    if (row(id).damage.pellets) return;
    for (const distance of [8, 20, 40]) {
      const { hits } = measuredKill(id, distance);
      expect(hits, `${id} at ${distance} m`).toBe(shotsToKill(id, distance));
    }
  });
});

describe('the SMG', () => {
  it('kills in about 170 ms within 12 m and about 330 ms at 25 m, and slower than the M4A1 past 25 m', () => {
    const close = measuredKill('smg', 10);
    const medium = measuredKill('smg', 24);
    expect(close.time).toBeGreaterThan(0.17 * 0.85);
    expect(close.time).toBeLessThan(0.17 * 1.15);
    expect(medium.time).toBeGreaterThan(0.33 * 0.85);
    expect(medium.time).toBeLessThan(0.33 * 1.15);
    for (const distance of [30, 45, 60]) expect(timeToKill('smg', distance), `${distance} m`).toBeGreaterThan(timeToKill('m4a1', distance));
  });

  it('beats every other primary up close, but for the shotgun at point-blank range', () => {
    // From raising the sights to the killing shot: the sniper one-shots, but aims slowly.
    const aimedKill = (id: WeaponId, distance: number) => row(id).handling.adsTime.value + timeToKill(id, distance);
    for (const other of ['m4a1', 'sniper'] as const) expect(aimedKill('smg', 10), other).toBeLessThan(aimedKill(other, 10));
    expect(aimedKill('shotgun', 4)).toBeLessThan(aimedKill('smg', 4));
  });

  it('aims and comes out of a sprint faster than the M4A1', () => {
    const smg = row('smg').handling;
    const m4 = row('m4a1').handling;
    expect(smg.adsTime.value).toBeLessThan(m4.adsTime.value);
    expect(smg.sprintToFire.value).toBeLessThan(m4.sprintToFire.value);
    expect(smg.tacticalSprintToFire.value).toBeLessThan(m4.tacticalSprintToFire.value);
  });

  it('bounces: each later shot climbs alternately more and less than the steady kick', () => {
    const kicks = [1, 2, 3, 4].map((i) => recoilKick(i, 'smg').pitch);
    const steady = row('smg').accuracy.verticalKick.value;
    expect(kicks[0]).toBeGreaterThan(steady);
    expect(kicks[1]).toBeLessThan(steady);
    expect(kicks[2]).toBeGreaterThan(steady);
    expect(kicks[3]).toBeLessThan(steady);
    // Still a climb, never a dip.
    for (const k of kicks) expect(k).toBeGreaterThan(0);
  });
});

describe('the pistol', () => {
  it('fires once per click: a held trigger fires once', () => {
    const m = holding('pistol');
    const outputs = m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) }));
    expect(eventsOf(outputs, 'shot')).toHaveLength(1);
  });

  it('kills in about 450 ms within 10 m', () => {
    const { time } = measuredKill('pistol', 8);
    expect(time).toBeCloseTo(0.45, 1);
  });

  it('beats a primary that has to reload first, and loses to one that is ready', () => {
    for (const primary of ['m4a1', 'smg'] as const) {
      const r = row(primary).reload;
      const reloadFirst = isShellReload(r) ? 0 : r.emptyAddAmmo.value;
      expect(timeToKill('pistol', 10)).toBeLessThan(reloadFirst + timeToKill(primary, 10));
      expect(timeToKill(primary, 10)).toBeLessThan(timeToKill('pistol', 10));
    }
  });
});
