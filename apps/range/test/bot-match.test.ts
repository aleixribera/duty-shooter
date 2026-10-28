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

  it('ends as an online match does: the ending, the scoreboard, then the lobby with the result, and no vote or next match', () => {
    const map = buildMapById('survival-town');
    const driver = new BotMatchDriver({ map: map.id, solids: mapSolids(map), spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav!, mode: 'gungame', botsPerTeam: 1, name: 'You', timeLimit: 2 });
    try {
      const phases = new Set<string>();
      for (let i = 0; i < 40 * 60 && !driver.over; i++) {
        driver.tick(usercmd());
        if (driver.match) phases.add(driver.match.phase);
        if (driver.match?.phase !== 'lobby' && driver.match?.phase !== 'playing') expect(driver.match?.lobby).not.toBeNull();
      }
      expect(driver.over).toBe(true);
      // The lobby first for the moment until its Start goes through, then the match, its ending and the scoreboard.
      expect([...phases]).toEqual(['lobby', 'playing', 'nuke', 'vote']);
      expect(driver.match).toMatchObject({ mode: 'gungame', phase: 'lobby', result: { reason: 'timeLimit' } });
      // It stays in the lobby: the page takes over from here.
      for (let i = 0; i < 120; i++) driver.tick(usercmd());
      expect(driver.match?.phase).toBe('lobby');
    } finally {
      driver.dispose();
    }
  });
});
