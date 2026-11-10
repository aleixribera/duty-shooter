// Bots on their own for three minutes. One file per map and mode, so the slow soaks run in parallel.
import { describe, expect, it } from 'vitest';
import { botMap, soak, chargeToEnd } from './support/bots';
import { BOUNDARY, buildSwitchyard } from '../src/map/switchyard';

const yard = botMap(buildSwitchyard(), BOUNDARY);

describe('Switchyard: bots on their own', () => {
  it.each([3, 6])('play three minutes of Charge, %i a side: rounds are played out', (perTeam) => {
    const r = soak(yard, 'charge', perTeam);
    expect(r.outside).toEqual([]);
    expect(r.longest, r.where).toBeLessThan(8);
    expect(r.rounds).toBeGreaterThanOrEqual(1);
  }, 240_000);

  it('play 3v3 Charge to the end: the charge gets planted, and rounds go both ways', () => {
    const { ended, plants, rounds } = chargeToEnd(yard);
    const log = JSON.stringify({ plants, rounds });
    expect(ended, log).toBe(true);
    expect(plants, log).toBeGreaterThan(0);
    expect(rounds.some((r) => r.winner === r.attackers), log).toBe(true);
    expect(rounds.some((r) => r.winner !== r.attackers), log).toBe(true);
  }, 300_000);
});
