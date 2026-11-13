// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildSwitchyard } from '../src/map/switchyard';

const yard = botMap(buildSwitchyard(), BOUNDARY);

describe('Switchyard: bots on their own', () => {
  // Five minutes, not three: at 3 a side a team takes about 2.5 zones in three minutes, so one in ten
  // three-minute matches (41 played with the spawns' facings nudged by thousandths of a radian, ticket 100)
  // ends with one side never taking one, a coin the seed tosses rather than a fault of the bots.
  it.each([3, 6])('play five minutes of Outposts, %i a side: both teams take zones', (perTeam) => {
    const r = soak(yard, 'outposts', perTeam, 300);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.captures).toEqual(new Set([1, 2]));
  }, 240_000);
});
