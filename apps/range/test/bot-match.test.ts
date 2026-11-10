import { describe, expect, it } from 'vitest';
import { usercmd } from '@duty-shooter/fps-core';
import { BotMatchDriver } from '@duty-shooter/fps-client/session';
import { buildMapById, mapSolids } from '../src/map/maps';

describe('Bot Match', () => {
  it('plays on Switchyard, humans vs bots: you on Blue against four bots', () => {
    const map = buildMapById('switchyard');
    const driver = new BotMatchDriver({ map: map.id, solids: mapSolids(map), spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav!, mode: 'outposts', botsPerTeam: 3, hvb: true, name: 'You' });
    try {
      for (let i = 0; i < 120; i++) driver.tick(usercmd());
      expect(driver.match).toMatchObject({ map: 'switchyard', mode: 'outposts', phase: 'playing' });
      expect(driver.scores.filter((s) => s.bot).map((s) => s.team)).toEqual([2, 2, 2, 2]);
      expect(driver.scores.filter((s) => !s.bot).map((s) => s.team)).toEqual([1]);
    } finally {
      driver.dispose();
    }
  });
});
