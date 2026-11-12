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

  it("plays its bots at the setup's skill: Hard bots react faster and aim tighter than the same bots at Normal", () => {
    const map = buildMapById('survival-town');
    const play = (skill: 'normal' | 'hard') => {
      const driver = new BotMatchDriver({ map: map.id, solids: mapSolids(map), spawns: map.spawns, nav: map.nav!, mode: 'tdm', botsPerTeam: 2, skill, name: 'You' });
      try {
        for (let i = 0; i < 30; i++) driver.tick(usercmd());
        return driver.botProfiles;
      } finally {
        driver.dispose();
      }
    };
    const normal = play('normal');
    const hard = play('hard');
    expect(normal.size).toBe(3);
    expect([...hard.keys()].sort()).toEqual([...normal.keys()].sort());
    for (const [name, p] of hard) {
      expect(p.reaction).toBeLessThan(normal.get(name)!.reaction);
      expect(p.aimError).toBeLessThan(normal.get(name)!.aimError);
    }
  });
});
