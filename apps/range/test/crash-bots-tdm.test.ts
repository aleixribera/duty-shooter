import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildCrash } from '../src/map/crash';
const crash = botMap(buildCrash(), BOUNDARY);
describe('Crash bots', () => {
  it('plays three minutes of team deathmatch with both teams scoring', () => {
    const r = soak(crash, 'tdm', 4);
    expect(r.players).toBe(8);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.m.server.mode.teamScores()!.every(t => t.score > 0)).toBe(true);
  }, 240_000);
});
