// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildStationNine } from '../src/map/station-nine';

const station = botMap(buildStationNine(), BOUNDARY);

describe('Station Nine: bots on their own', () => {
  it.each([3, 4])('play three minutes of free-for-all, %i a side: kills spread round the station', (perTeam) => {
    const r = soak(station, 'ffa', perTeam);
    expect(r.players).toBe(perTeam * 2);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.m.server.mode.scores().filter((s) => s.kills > 0).length).toBeGreaterThanOrEqual(Math.min(6, perTeam * 2 - 1));
  }, 240_000);
});
