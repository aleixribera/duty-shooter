import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, bulletDamage, isShellReload, shotsToKill, timeToKill, type TickOutput, type WeaponId } from '@duty-shooter/fps-core';
import { usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { holding, measuredKill, trigger } from './support/arsenal';
import { SHOOTER, eventsOf, playerIn, shotTime } from './support/combat';
import { ticks } from './support/movement';

/** The four guns that joined the first five: the light machine gun, the marksman rifle, the burst rifle and the revolver. */
const UNDER_TEST: readonly WeaponId[] = ['lmg', 'dmr', 'burst', 'revolver'];

const row = (id: WeaponId) => STATS.weapons[id];
const idle = usercmd();
const weaponOf = (m: HeadlessMatch) => playerIn(m.latest, SHOOTER).weapon;
const gaps = (shots: readonly { tick: number; fraction: number }[]) => shots.slice(1).map((s, i) => shotTime(s) - shotTime(shots[i]!));

/** Steps with `cmd` until `done` says so or `seconds` pass, and returns every tick's outputs. */
function until(m: HeadlessMatch, seconds: number, cmd: () => ReturnType<typeof usercmd>, done: (o: TickOutput) => boolean): TickOutput[] {
  const outputs: TickOutput[] = [];
  for (let i = 0; i < ticks(seconds); i++) {
    outputs.push(m.step({ [SHOOTER]: cmd() }));
    if (done(outputs.at(-1)!)) break;
  }
  return outputs;
}

describe.each(UNDER_TEST)('%s handling against its row', (id) => {
  const h = row(id).handling;

  it('holds its magazine, then reloads', () => {
    const m = holding(id);
    const outputs = until(m, 30, () => trigger(id), (o) => o.events.some((e) => e.type === 'reload'));
    expect(eventsOf(outputs, 'reload')[0]).toMatchObject({ phase: 'start', kind: 'empty' });
    expect(eventsOf(outputs, 'shot')).toHaveLength(h.magazineSize.value);
  });

  it('reloads on its row\'s timings', () => {
    const r = row(id).reload;
    if (isShellReload(r)) throw new Error(`${id} reloads a round at a time: this file expects one reload`);
    for (const [kind, shots, addAmmo, duration] of [
      ['tactical', 3, r.tacticalAddAmmo, r.tacticalDuration],
      ['empty', h.magazineSize.value, r.emptyAddAmmo, r.emptyDuration],
    ] as const) {
      const m = holding(id);
      for (let fired = 0; fired < shots; ) fired += eventsOf([m.step({ [SHOOTER]: trigger(id) })], 'shot').length;
      m.run(ticks(0.6), () => ({ [SHOOTER]: idle }));
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

  it('kills in the shots its damage bands say, at every range', () => {
    for (const distance of [8, 20, 40, 80]) {
      const { hits } = measuredKill(id, distance);
      expect(hits, `${id} at ${distance} m`).toBe(shotsToKill(id, distance));
    }
  });
});

describe('the burst rifle', () => {
  const h = row('burst').handling;
  const interval = 60 / h.fireRate.value;
  const rounds = h.burstRounds!.value;
  const delay = h.burstDelay!.value;
  const oneBurst = row('burst').damage.bands.close!.range!.value;

  it('fires its whole burst on one press, though the trigger is let go at once', () => {
    const m = holding('burst');
    const shots = eventsOf([m.step({ [SHOOTER]: usercmd({ firePresses: [0.5] }) }), ...m.run(ticks(1.5), () => ({ [SHOOTER]: idle }))], 'shot');
    expect(shots).toHaveLength(rounds);
    for (const gap of gaps(shots)) expect(gap).toBeCloseTo(interval, 2);
  });

  it('fires burst after burst while the trigger is held, waiting between them', () => {
    const m = holding('burst');
    const shots = eventsOf(m.run(ticks(4 * ((rounds - 1) * interval + delay)), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) })), 'shot');
    expect(shots.length).toBeGreaterThanOrEqual(rounds * 3);
    gaps(shots).forEach((gap, i) => {
      // The gap after a burst's last round is the wait; every other is the rate inside a burst.
      if ((i + 1) % rounds === 0) expect(gap, `after burst ${(i + 1) / rounds}`).toBeCloseTo(delay, 2);
      else expect(gap, `inside a burst, round ${i + 2}`).toBeCloseTo(interval, 2);
    });
    expect(delay).toBeGreaterThan(interval * 2);
  });

  it('gains nothing from hammering the trigger: a press every tick fires no sooner than a hold', () => {
    const count = (cmd: () => ReturnType<typeof usercmd>) => eventsOf(holding('burst').run(ticks(3), () => ({ [SHOOTER]: cmd() })), 'shot').map(shotTime);
    const held = count(() => usercmd({ buttons: ['Fire'] }));
    const hammered = count(() => usercmd({ firePresses: [0.5] }));
    expect(hammered.length).toBeLessThanOrEqual(held.length);
    hammered.forEach((t, i) => expect(t, `shot ${i + 1}`).toBeGreaterThanOrEqual(held[i]! - 1e-9));
  });

  it('ends its burst when the rifle leaves the ready: a reload cuts it short and nothing fires after', () => {
    const m = holding('burst');
    const first = m.step({ [SHOOTER]: usercmd({ firePresses: [0] }) });
    const rest = [m.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) }), ...m.run(ticks(4), () => ({ [SHOOTER]: idle }))];
    const fired = eventsOf([first, ...rest], 'shot').length;
    expect(fired).toBeGreaterThanOrEqual(1);
    expect(fired).toBeLessThan(rounds);
    expect(weaponOf(m)).toMatchObject({ action: 'ready', ammo: h.magazineSize.value });
  });

  it('ends its burst with the magazine: the last rounds leave and the rifle reloads', () => {
    const m = holding('burst');
    const outputs = until(m, 30, () => usercmd({ buttons: ['Fire'] }), (o) => o.events.some((e) => e.type === 'reload'));
    expect(eventsOf(outputs, 'shot')).toHaveLength(h.magazineSize.value);
    // Reloaded, with the trigger still down, it starts a whole burst again.
    const after = eventsOf(until(m, 6, () => usercmd({ buttons: ['Fire'] }), (o) => playerIn(o, SHOOTER).weapon.ammo === h.magazineSize.value - rounds), 'shot');
    expect(after).toHaveLength(rounds);
  });

  it('kills with one burst inside its band when all three land, in the time the burst takes', () => {
    for (const distance of [5, 15, oneBurst - 1]) {
      const { hits, time } = measuredKill('burst', distance);
      expect(hits, `${distance} m`).toBe(rounds);
      expect(time, `${distance} m`).toBeCloseTo((rounds - 1) * interval, 2);
    }
  });

  it('needs a second burst past its band, and pays the wait for it', () => {
    for (const distance of [oneBurst + 4, 60]) {
      const { hits, time } = measuredKill('burst', distance);
      expect(hits, `${distance} m`).toBeGreaterThan(rounds);
      expect(time, `${distance} m`).toBeGreaterThanOrEqual((rounds - 1) * interval + delay - 1e-6);
    }
  });

  it('out-kills the M4A1 with a whole burst inside its band and loses to it when the burst is not enough', () => {
    expect(timeToKill('burst', oneBurst - 1)).toBeLessThan(timeToKill('m4a1', oneBurst - 1));
    for (const distance of [oneBurst + 4, 60, 100]) expect(timeToKill('burst', distance), `${distance} m`).toBeGreaterThan(timeToKill('m4a1', distance));
    // Two of the three leave the target standing wherever they land on the body.
    for (const zone of ['upperTorso', 'lowerTorso', 'arm', 'leg'] as const) expect(bulletDamage(1, zone, 'burst') * (rounds - 1), zone).toBeLessThan(STATS.health.max.value);
  });

  it('plays the same burst from the same inputs', () => {
    const play = () => eventsOf(holding('burst', 20).run(ticks(2), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) })), 'shot').map((s) => [s.tick, s.fraction, ...s.direction]);
    expect(play()).toEqual(play());
  });
});

describe('the marksman rifle', () => {
  const near = row('dmr').damage.bands.close!.range!.value;

  it('fires once per click: a held trigger fires once', () => {
    const m = holding('dmr');
    expect(eventsOf(m.run(ticks(1.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) })), 'shot')).toHaveLength(1);
  });

  it('kills with any two hits to the body inside its near band', () => {
    for (const distance of [5, near - 2]) {
      for (const zone of ['upperTorso', 'lowerTorso', 'arm'] as const) expect(measuredKill('dmr', distance, zone).hits, `${zone} at ${distance} m`).toBe(2);
    }
  });

  it('kills with two at range only when one is the head, else three', () => {
    for (const distance of [near + 5, 70, 120]) {
      expect(measuredKill('dmr', distance).hits, `torso at ${distance} m`).toBe(3);
      expect(bulletDamage(distance, 'head', 'dmr') + bulletDamage(distance, 'upperTorso', 'dmr'), `head and torso at ${distance} m`).toBeGreaterThanOrEqual(STATS.health.max.value);
    }
  });

  it('never kills with one shot, the head included: that is the sniper\'s', () => {
    for (const distance of [1, near, 60, 150]) {
      expect(bulletDamage(distance, 'head', 'dmr'), `${distance} m`).toBeLessThan(STATS.health.max.value);
      expect(shotsToKill('sniper', distance), `${distance} m`).toBe(1);
    }
  });

  it('sits between the M4A1 and the sniper: slower than the carbine up close, quicker than it far out when one shot is the head', () => {
    expect(timeToKill('dmr', 10)).toBeGreaterThan(timeToKill('m4a1', 10));
    const interval = 60 / row('dmr').handling.fireRate.value;
    // Head then torso at range: two shots, one interval.
    expect(interval).toBeLessThan(timeToKill('m4a1', 80));
    // And it aims slower than the carbine and faster than the scope.
    const ads = (id: WeaponId) => row(id).handling.adsTime.value;
    expect(ads('dmr')).toBeGreaterThan(ads('m4a1'));
    expect(ads('dmr')).toBeLessThan(ads('sniper'));
    const zoom = (id: WeaponId) => row(id).handling.zoom.value;
    expect(zoom('dmr')).toBeGreaterThan(zoom('m4a1'));
    expect(zoom('dmr')).toBeLessThan(zoom('sniper'));
  });
});

describe('the light machine gun', () => {
  const lmg = row('lmg');
  const m4 = row('m4a1');

  it('fires through three M4A1 magazines without a reload', () => {
    expect(lmg.handling.magazineSize.value).toBeGreaterThanOrEqual(m4.handling.magazineSize.value * 3);
  });

  it('settles as it fires: the view climbs less over rounds twenty to thirty than over the first ten, and the M4A1\'s does not', () => {
    const climbs = (id: WeaponId) => {
      const m = holding(id);
      const pitch = () => playerIn(m.latest, SHOOTER).pitch;
      const marks: number[] = [pitch()];
      let fired = 0;
      for (let i = 0; i < ticks(6) && fired < 30; i++) {
        const before = fired;
        fired += eventsOf([m.step({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) })], 'shot').length;
        if (Math.floor(fired / 10) > Math.floor(before / 10)) marks.push(pitch());
      }
      return [marks[1]! - marks[0]!, marks[3]! - marks[2]!] as const;
    };
    const [lmgEarly, lmgLate] = climbs('lmg');
    const [m4Early, m4Late] = climbs('m4a1');
    expect(lmgEarly).toBeGreaterThan(0);
    expect(lmgLate).toBeLessThan(lmgEarly * 0.7);
    expect(m4Late).toBeGreaterThan(m4Early * 0.7);
  });

  it('pays for the belt everywhere else: slower to aim, to raise, to reload and to carry than the M4A1', () => {
    expect(lmg.handling.adsTime.value).toBeGreaterThan(m4.handling.adsTime.value);
    expect(lmg.handling.drawTime.value).toBeGreaterThan(m4.handling.drawTime.value);
    expect(lmg.handling.sprintToFire.value).toBeGreaterThan(m4.handling.sprintToFire.value);
    expect(lmg.handling.moveSpeed.value).toBeLessThan(m4.handling.moveSpeed.value);
    if (isShellReload(lmg.reload) || isShellReload(m4.reload)) throw new Error('both reload whole');
    expect(lmg.reload.tacticalDuration.value).toBeGreaterThan(m4.reload.tacticalDuration.value * 2);
  });

  it('kills no faster than the M4A1 up close and keeps its damage further out', () => {
    for (const distance of [5, 15, 25]) expect(timeToKill('lmg', distance), `${distance} m`).toBeGreaterThanOrEqual(timeToKill('m4a1', distance));
    for (const distance of [60, 100, 150]) expect(shotsToKill('lmg', distance), `${distance} m`).toBeLessThanOrEqual(shotsToKill('m4a1', distance));
  });
});

describe('the revolver', () => {
  const revolver = row('revolver');
  const pistol = row('pistol');

  it('fires once per click: a held trigger fires once', () => {
    const m = holding('revolver');
    expect(eventsOf(m.run(ticks(1.5), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire'] }) })), 'shot')).toHaveLength(1);
  });

  it('kills up close with two to the body or one to the head', () => {
    expect(measuredKill('revolver', 8).hits).toBe(2);
    expect(measuredKill('revolver', 8, 'head').hits).toBe(1);
  });

  it('hits harder than the pistol at every range, with fewer rounds and a slower trigger', () => {
    for (const distance of [3, 15, 40, 90]) expect(bulletDamage(distance, 'upperTorso', 'revolver'), `${distance} m`).toBeGreaterThan(bulletDamage(distance, 'upperTorso', 'pistol'));
    expect(revolver.handling.magazineSize.value).toBeLessThan(pistol.handling.magazineSize.value);
    expect(revolver.handling.fireRate.value).toBeLessThan(pistol.handling.fireRate.value);
  });

  it('beats the pistol when both shots land and loses a magazine-long fight: six rounds against the pistol\'s', () => {
    expect(timeToKill('revolver', 8)).toBeLessThan(timeToKill('pistol', 8));
    // Kills a full cylinder buys against kills a full pistol magazine buys, at arm's length.
    expect(Math.floor(revolver.handling.magazineSize.value / shotsToKill('revolver', 8))).toBeLessThanOrEqual(Math.floor(pistol.handling.magazineSize.value / shotsToKill('pistol', 8)));
  });

  it('reloads the whole cylinder the same way whatever was left in it', () => {
    if (isShellReload(revolver.reload)) throw new Error('the cylinder is loaded whole');
    expect(revolver.reload.emptyDuration.value).toBe(revolver.reload.tacticalDuration.value);
    expect(revolver.reload.emptyAddAmmo.value).toBe(revolver.reload.tacticalAddAmmo.value);
  });
});
