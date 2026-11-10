// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildStationNine } from '../src/map/station-nine';

const station = botMap(buildStationNine(), BOUNDARY);

describe('Station Nine: bots on their own', () => {
  it.each([3, 6])('play three minutes of team deathmatch, %i a side: both teams score', (perTeam) => {
    const r = soak(station, 'tdm', perTeam);
    expect(r.players).toBe(perTeam * 2);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    const scores = r.m.server.mode.teamScores()!;
    expect(scores.every((t) => t.score > 0), JSON.stringify(scores)).toBe(true);
  }, 240_000);
});
