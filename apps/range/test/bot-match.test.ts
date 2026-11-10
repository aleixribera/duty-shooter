import { afterEach, describe, expect, it, vi } from 'vitest';
import { usercmd, type ModeId } from '@duty-shooter/fps-core';
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

  describe('where you appear (ticket 31: always the same spot)', () => {
    afterEach(() => vi.restoreAllMocks());

    /** Your place (x, z, to the decimetre) at the start of each of `matches` Bot Matches, and the team you were on. */
    function firstSpawns(mapId: 'survival-town' | 'switchyard', mode: ModeId, matches: number): { at: string; team: number }[] {
      const map = buildMapById(mapId);
      const out: { at: string; team: number }[] = [];
      for (let n = 0; n < matches; n++) {
        const driver = new BotMatchDriver({ map: map.id, solids: mapSolids(map), ladders: map.ladders ?? [], spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav!, mode, botsPerTeam: 2, name: 'You' });
        try {
          for (let i = 0; i < 240 && !(driver.match?.phase === 'playing' && driver.client.self?.alive); i++) driver.tick(usercmd());
          const self = driver.client.self;
          expect(self?.alive).toBe(true);
          out.push({ at: `${self!.position[0].toFixed(1)},${self!.position[2].toFixed(1)}`, team: self!.team });
        } finally {
          driver.dispose();
        }
      }
      return out;
    }

    it.each([
      ['switchyard', 'tdm'],
      ['survival-town', 'outposts'],
      ['switchyard', 'charge'],
    ] as const)('on %s (%s) you start somewhere different from match to match, always in your own team’s yard', (mapId, mode) => {
      // Seeded, so the test is the same every run; the game draws from Math.random.
      let state = 31;
      vi.spyOn(Math, 'random').mockImplementation(() => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32));
      const map = buildMapById(mapId);
      const starts = firstSpawns(mapId, mode, 6);
      for (const s of starts) {
        const yard = map.spawns.teams![s.team - 1]!.map((p) => `${p.position[0].toFixed(1)},${p.position[2].toFixed(1)}`);
        expect(yard).toContain(s.at);
      }
      expect(new Set(starts.map((s) => s.at)).size).toBeGreaterThanOrEqual(3);
    }, 60_000);
  });
});
