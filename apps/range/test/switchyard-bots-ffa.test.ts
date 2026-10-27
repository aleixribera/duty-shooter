// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildSwitchyard } from '../src/map/switchyard';

const yard = botMap(buildSwitchyard(), BOUNDARY);

describe('Switchyard: bots on their own', () => {
  it.each([3, 6])('play three minutes of free-for-all, %i a side: kills spread round the yard', (perTeam) => {
    const r = soak(yard, 'ffa', perTeam);
    expect(r.players).toBe(perTeam * 2);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.m.server.mode.scores().filter((s) => s.kills > 0).length).toBeGreaterThanOrEqual(Math.min(6, perTeam * 2 - 1));
  }, 240_000);
});
