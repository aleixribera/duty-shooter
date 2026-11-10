// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildStationNine } from '../src/map/station-nine';

const station = botMap(buildStationNine(), BOUNDARY);

describe('Station Nine: bots on their own', () => {
  it.each([3, 6])('play three minutes of Outposts, %i a side: both teams take zones', (perTeam) => {
    const r = soak(station, 'outposts', perTeam);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.captures).toEqual(new Set([1, 2]));
  }, 240_000);
});
