import { describe, expect, it } from 'vitest';
import { STATS, type Loadout } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { OfflineDriver } from '../src/session';

const FLOOR = box({ min: [-50, -1, -50], max: [50, 0, 50], material: 'concrete' });
const SNIPER: Loadout = { primary: 'sniper', secondary: 'pistol', grenade: 'frag' };
const idle = () => usercmd();

describe('offline play', () => {
  it('starts with the stored loadout', () => {
    const driver = new OfflineDriver({ solids: [FLOOR], spawn: { position: [0, 0, 0], yaw: 0 }, loadout: SNIPER });
    expect(driver.tick(idle()).self?.weapon.id).toBe('sniper');
  });

  it('equips a new loadout at once while alive, where the player stands', () => {
    const driver = new OfflineDriver({ solids: [FLOOR], spawn: { position: [0, 0, 0], yaw: 0 } });
    for (let i = 0; i < 20; i++) driver.tick(usercmd({ forward: 1 }));
    const before = driver.tick(idle()).self!;
    driver.setLoadout({ primary: 'shotgun', secondary: 'pistol', grenade: 'frag' });
    const after = driver.tick(idle()).self!;
    expect(after.weapon).toMatchObject({ id: 'shotgun', action: 'draw', ammo: STATS.weapons.shotgun.handling.magazineSize.value });
    expect(Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2])).toBeLessThan(0.2);
  });

  it('keeps a change made while dead for the respawn', () => {
    // Spawning 30 m up: the landing kills.
    const driver = new OfflineDriver({ solids: [FLOOR], spawn: { position: [0, 30, 0], yaw: 0 }, respawnDelay: 0.5 });
    let self = driver.tick(idle()).self!;
    for (let i = 0; i < 600 && self.alive; i++) self = driver.tick(idle()).self!;
    expect(self.alive).toBe(false);
    driver.setLoadout(SNIPER);
    expect(driver.tick(idle()).self).toMatchObject({ alive: false, weapon: { id: 'm4a1' } });
    for (let i = 0; i < 60 && !self.alive; i++) self = driver.tick(idle()).self!;
    expect(self).toMatchObject({ alive: true, weapon: { id: 'sniper' } });
  });
});
