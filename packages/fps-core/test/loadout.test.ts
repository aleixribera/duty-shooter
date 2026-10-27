import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, STATS, Simulation, TICK_SECONDS, createWorld, parseLoadout, type Loadout, type WeaponId } from '@duty-shooter/fps-core';
import { createHeadlessMatch, createNetworkedMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { SHOOTER, TARGET, eventsOf, playerIn, shotTime, wallAt } from './support/combat';
import { FLOOR, measuredSpeed, ticks } from './support/movement';

const idle = usercmd();
const fire = usercmd({ buttons: ['Fire'] });
const swap = usercmd({ buttons: ['SwitchWeapon'] });
/** A fresh trigger press every other tick: semi-automatic, pump and bolt weapons fire once per press. */
const mash = (tick: number) => ({ [SHOOTER]: tick % 2 === 0 ? fire : idle });
const row = (id: WeaponId) => STATS.weapons[id];

/** A shooter on an empty range carrying `loadout`. */
function armed(loadout?: Loadout): HeadlessMatch {
  return createHeadlessMatch({ solids: [FLOOR, wallAt(-500)], players: [{ id: SHOOTER, team: 1, position: [0, 0, 0], ...(loadout ? { loadout } : {}) }] });
}

const weaponOf = (m: HeadlessMatch) => playerIn(m.latest, SHOOTER).weapon;

/** Steps until the weapon in hand has finished drawing. */
function raise(m: HeadlessMatch): void {
  for (let i = 0; i < ticks(3) && weaponOf(m).action !== 'ready'; i++) m.step({ [SHOOTER]: idle });
}

describe('loadouts', () => {
  it('spawns a player without a loadout carrying the M4A1, the pistol and one frag, the M4A1 in hand', () => {
    const m = armed();
    m.step();
    const me = playerIn(m.latest, SHOOTER);

    expect(me.loadout).toEqual(DEFAULT_LOADOUT);
    expect(DEFAULT_LOADOUT).toEqual({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag' });
    expect(me.weapon).toMatchObject({ id: 'm4a1', slot: 0, action: 'draw', ammo: STATS.weapon.magazineSize.value });
    expect(me.grenades).toBe(STATS.grenade.perLife.value);
  });

  it('spawns with the chosen primary in hand, its magazine full and its draw time before the first shot', () => {
    for (const primary of ['smg', 'shotgun', 'sniper'] as const) {
      const m = armed({ primary, secondary: 'pistol', grenade: null });
      const outputs = m.run(ticks(row(primary).handling.drawTime.value + 0.3), mash);
      const me = playerIn(outputs[0]!, SHOOTER);

      expect(me.weapon).toMatchObject({ id: primary, ammo: row(primary).handling.magazineSize.value });
      expect(me.grenades).toBe(0);
      const first = eventsOf(outputs, 'shot')[0]!;
      expect(shotTime(first)).toBeCloseTo(row(primary).handling.drawTime.value, 1);
      expect(first.weapon).toBe(primary);
    }
  });

  it('accepts only loadouts that put each weapon in its own slot', () => {
    expect(parseLoadout({ primary: 'smg', secondary: 'pistol', grenade: 'frag' })).toEqual({ primary: 'smg', secondary: 'pistol', grenade: 'frag' });
    expect(parseLoadout({ primary: 'sniper', secondary: 'pistol', grenade: null })).not.toBeNull();
    expect(parseLoadout({ primary: 'pistol', secondary: 'pistol', grenade: 'frag' })).toBeNull();
    expect(parseLoadout({ primary: 'm4a1', secondary: 'smg', grenade: 'frag' })).toBeNull();
    expect(parseLoadout({ primary: 'm4a1', secondary: 'pistol', grenade: 'smoke' })).toBeNull();
    expect(parseLoadout({ primary: 'bazooka', secondary: 'pistol', grenade: null })).toBeNull();
    expect(parseLoadout('m4a1')).toBeNull();
  });

  it('gives a respawn the new loadout, or the last one, with fresh weapons and the primary in hand', () => {
    const sim = new Simulation(createWorld([FLOOR]));
    sim.addPlayer({ id: SHOOTER, team: 1, position: [0, 0, 0] });
    sim.respawn(SHOOTER, [0, 0, 0], 0, { primary: 'shotgun', secondary: 'pistol', grenade: 'frag' });
    expect(sim.output().players[0]).toMatchObject({ loadout: { primary: 'shotgun' }, weapon: { id: 'shotgun', slot: 0, action: 'draw' } });
    sim.respawn(SHOOTER, [0, 0, 0], 0);
    expect(sim.output().players[0]).toMatchObject({ loadout: { primary: 'shotgun' }, weapon: { id: 'shotgun', ammo: row('shotgun').handling.magazineSize.value } });
  });
});

describe('switching weapons', () => {
  it('holsters the primary, then draws the secondary, and fires only once it is raised', () => {
    const m = armed();
    raise(m);
    const switched = m.step({ [SHOOTER]: swap });
    expect(eventsOf([switched], 'switch')).toEqual([expect.objectContaining({ from: 'm4a1', to: 'pistol' })]);
    expect(weaponOf(m)).toMatchObject({ id: 'm4a1', action: 'holster' });

    const start = m.latest.tick;
    const outputs = m.run(ticks(1.5), mash);
    const raisedAt = row('m4a1').handling.holsterTime.value + row('pistol').handling.drawTime.value;
    const first = eventsOf(outputs, 'shot')[0]!;

    expect(first.weapon).toBe('pistol');
    expect(shotTime(first) - (start - 1) * TICK_SECONDS).toBeCloseTo(raisedAt, 1);
    expect(shotTime(first) - (start - 1) * TICK_SECONDS).toBeGreaterThanOrEqual(raisedAt - 1e-9);
    expect(weaponOf(m)).toMatchObject({ id: 'pistol', slot: 1 });
  });

  it('switches from any primary to the pistol faster than that primary reloads', () => {
    for (const id of ['m4a1', 'smg', 'shotgun', 'sniper'] as const) {
      const h = row(id);
      const reload = 'tacticalAddAmmo' in h.reload ? h.reload.tacticalAddAmmo.value : h.reload.start.value + h.reload.perShell.value;
      expect(h.handling.holsterTime.value + row('pistol').handling.drawTime.value, id).toBeLessThan(reload);
    }
  });

  it('keeps each weapon\'s own magazine across switches', () => {
    const m = armed();
    raise(m);
    m.run(ticks(0.3), () => ({ [SHOOTER]: fire }));
    const rifleLeft = weaponOf(m).ammo;
    expect(rifleLeft).toBeLessThan(row('m4a1').handling.magazineSize.value);

    m.step({ [SHOOTER]: swap });
    raise(m);
    for (let i = 0; i < 3; i++) m.run(ticks(0.2), (t) => ({ [SHOOTER]: t % 12 === 1 ? fire : idle }));
    const pistolLeft = weaponOf(m).ammo;
    expect(weaponOf(m).id).toBe('pistol');
    expect(pistolLeft).toBeLessThan(row('pistol').handling.magazineSize.value);

    m.step({ [SHOOTER]: idle });
    m.step({ [SHOOTER]: swap });
    raise(m);
    expect(weaponOf(m)).toMatchObject({ id: 'm4a1', ammo: rifleLeft });
    m.step({ [SHOOTER]: idle });
    m.step({ [SHOOTER]: swap });
    raise(m);
    expect(weaponOf(m)).toMatchObject({ id: 'pistol', ammo: pistolLeft });
  });

  it('loses a reload switched away from before the magazine went in', () => {
    const m = armed();
    raise(m);
    m.run(ticks(0.3), () => ({ [SHOOTER]: fire }));
    const left = weaponOf(m).ammo;
    m.step({ [SHOOTER]: usercmd({ buttons: ['Reload'] }) });
    m.run(ticks(0.5), () => ({ [SHOOTER]: idle }));
    const out = m.step({ [SHOOTER]: swap });

    expect(eventsOf([out], 'reload')).toEqual([expect.objectContaining({ phase: 'cancel' })]);
    raise(m);
    m.step({ [SHOOTER]: idle });
    m.step({ [SHOOTER]: swap });
    raise(m);
    expect(weaponOf(m)).toMatchObject({ id: 'm4a1', ammo: left });
  });

  it('moves faster with the pistol out than with any primary', () => {
    const speedWith = (loadout: Loadout, secondary: boolean) => {
      const m = armed(loadout);
      if (secondary) {
        raise(m);
        m.step({ [SHOOTER]: swap });
      }
      return measuredSpeed(m.run(ticks(3), () => ({ [SHOOTER]: usercmd({ forward: 1 }) })).map((o) => playerIn(o, SHOOTER)));
    };
    const pistol = speedWith(DEFAULT_LOADOUT, true);
    for (const primary of ['m4a1', 'smg', 'shotgun', 'sniper'] as const) {
      const speed = speedWith({ primary, secondary: 'pistol', grenade: null }, false);
      expect(speed / STATS.movement.walkSpeed.value, primary).toBeCloseTo(row(primary).handling.moveSpeed.value, 2);
      expect(pistol, primary).toBeGreaterThan(speed);
    }
  });
});

describe('weapons in the events', () => {
  it('credits hits and kills to the weapon that made them', () => {
    const m = createHeadlessMatch({
      solids: [FLOOR],
      players: [
        { id: SHOOTER, team: 1, position: [0, 0, 0], loadout: { primary: 'smg', secondary: 'pistol', grenade: null } },
        { id: TARGET, team: 2, position: [0, 0, -8], yaw: Math.PI },
      ],
    });
    raise(m);
    const pitch = Math.atan2(1.3 - STATS.stance.standEyeHeight.value, 8);
    const outputs = m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Fire', 'Ads'], pitch }) }));

    expect(eventsOf(outputs, 'hit')[0]).toMatchObject({ weapon: 'smg', pellets: 1 });
    expect(eventsOf(outputs, 'kill')[0]).toMatchObject({ killer: SHOOTER, weapon: 'smg' });
  });
});

describe('loadouts over the network', () => {
  it('spawns a joiner with the loadout from the join, and a changed loadout from the next spawn', () => {
    const m = createNetworkedMatch({
      solids: [FLOOR],
      spawns: [{ position: [0, 0, 0], yaw: 0 }, { position: [10, 0, 0], yaw: 0 }],
      mode: 'ffa',
      modes: { ffa: { timeLimit: 2 } },
      intermission: { nuke: 0.2, vote: 0.2 },
    });
    const alice = m.join('alice', { loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag' } });
    m.run(ticks(0.5));
    const mine = () => m.server.latest.players.find((p) => p.id === alice.client.id)!;
    expect(mine().weapon.id).toBe('sniper');

    alice.client.setLoadout({ primary: 'shotgun', secondary: 'pistol', grenade: null });
    m.run(ticks(0.5));
    expect(mine().weapon.id).toBe('sniper');
    // The next match respawns everyone.
    m.run(ticks(1.6));
    expect(mine()).toMatchObject({ weapon: { id: 'shotgun' }, grenades: 0 });
  });
});
