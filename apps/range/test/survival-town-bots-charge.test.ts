// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, chargeToEnd } from './support/bots';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const town = botMap(buildSurvivalTown(), BOUNDARY);

describe('Survival Town: bots on their own', () => {
  it('play 3v3 Charge to the end: the charge gets planted, and rounds go both ways', () => {
    const { ended, plants, rounds } = chargeToEnd(town);
    const log = JSON.stringify({ plants, rounds });
    expect(ended, log).toBe(true);
    expect(plants, log).toBeGreaterThan(0);
    // Attackers and defenders each win rounds.
    expect(rounds.some((r) => r.winner === r.attackers), log).toBe(true);
    expect(rounds.some((r) => r.winner !== r.attackers), log).toBe(true);
  }, 300_000);
});
