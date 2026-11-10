// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, chargeToEnd } from './support/bots';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const town = botMap(buildSurvivalTown(), BOUNDARY);

describe('Survival Town: bots on their own', () => {
  it('plays 3v3 and 4v4 Charge to the end, with plants and wins on both sides', () => {
    const matches = [3, 4].map((size) => ({ size, ...chargeToEnd(town, size) }));
    const log = JSON.stringify(matches.map(({ size, plants, rounds }) => ({ size, plants, rounds })));
    for (const match of matches) {
      expect(match.ended, log).toBe(true);
      expect(match.plants, log).toBeGreaterThan(0);
    }
    const rounds = matches.flatMap((match) => match.rounds);
    expect(rounds.some((r) => r.winner === r.attackers), log).toBe(true);
    expect(rounds.some((r) => r.winner !== r.attackers), log).toBe(true);
  }, 300_000);
});
