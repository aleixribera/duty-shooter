// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak } from './support/bots';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const town = botMap(buildSurvivalTown(), BOUNDARY);

describe('Survival Town: bots on their own', () => {
  it('play three minutes of 3v3 team deathmatch: both teams score, nobody wanders off or stands stuck', () => {
    const r = soak(town, 'tdm', 3);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    const scores = r.m.server.mode.teamScores()!;
    expect(scores.map((t) => t.score).every((n) => n > 0), JSON.stringify(scores)).toBe(true);
  }, 120_000);
});
