import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { STATS, shotsToKill, timeToKill } from '@duty-shooter/fps-core';
import { DUEL_WEAPONS, balanceRuns, challengerRuns, type DuelCell } from '@duty-shooter/fps-core/harness';
import { CHALLENGER_ROUNDS, REPORT, ROUNDS, SAMPLING_ERROR, band, overall, rate, report } from './support/balance';

const M4A1 = STATS.weapons.m4a1.damage.bands;

describe('time-to-kill targets', () => {
  it('the M4A1 needs more torso shots the farther away, never fewer', () => {
    const ranges = [M4A1.close!.range!.value - 1, M4A1.medium!.range!.value - 1, M4A1.medium!.range!.value + 10];
    const shots = ranges.map((d) => shotsToKill('m4a1', d));
    for (let i = 1; i < shots.length; i++) expect(shots[i], `${ranges[i]} m`).toBeGreaterThan(shots[i - 1]!);
  });

  it('the SMG out-kills the M4A1 within 12 m and loses to it past 25 m', () => {
    for (const d of [2, 6, 12]) expect(timeToKill('smg', d), `${d} m`).toBeLessThan(timeToKill('m4a1', d));
    for (const d of [26, 40, 60, 90]) expect(timeToKill('smg', d), `${d} m`).toBeGreaterThan(timeToKill('m4a1', d));
  });

  it('the shotgun kills in one shot within 5 m (aimed, to 10 m), two within 12 m, and not reliably past 18 m', () => {
    for (const d of [1, 3, 5]) expect(shotsToKill('shotgun', d), `${d} m`).toBe(1);
    // An aimed blast with five of its eight pellets on still kills to 10 m: no "hit for 90" just past arm's length (ticket 112).
    for (const d of [6, 8, 10]) expect(shotsToKill('shotgun', d, 'upperTorso', 5), `${d} m`).toBe(1);
    // At 12 m about half of an aimed blast lands.
    for (const d of [6, 9, 12]) expect(shotsToKill('shotgun', d, 'upperTorso', 4), `${d} m`).toBeLessThanOrEqual(2);
    // Past 18 m even every pellet of two blasts on target leaves the player standing.
    for (const d of [19, 25, 40]) expect(shotsToKill('shotgun', d), `${d} m`).toBeGreaterThan(2);
  });

  it('the sniper kills in one shot except to the feet at any range', () => {
    for (const d of [5, 30, 80, 200]) {
      for (const zone of ['head', 'neck', 'upperTorso', 'lowerTorso', 'arm', 'leg'] as const) expect(shotsToKill('sniper', d, zone), `${zone} at ${d} m`).toBe(1);
      expect(shotsToKill('sniper', d, 'foot'), `foot at ${d} m`).toBe(2);
    }
  });
});

let cells: DuelCell[] = [];
beforeAll(() => {
  cells = balanceRuns(ROUNDS);
  if (REPORT) writeFileSync(REPORT, report(cells, challengerRuns(CHALLENGER_ROUNDS)));
}, 1_500_000);

describe('bot-vs-bot balance runs', () => {

  it.each(DUEL_WEAPONS)('the %s wins its own band against every other primary', (w) => {
    for (const other of DUEL_WEAPONS) if (other !== w) expect(rate(cells, w, other, band(w)), `against the ${other} at ${band(w)} m`).toBeGreaterThan(0.5 - SAMPLING_ERROR);
  });

  it.each(DUEL_WEAPONS)('the %s wins 40 to 60 percent of all its duels', (w) => {
    expect(overall(cells, w)).toBeGreaterThanOrEqual(0.4);
    expect(overall(cells, w)).toBeLessThanOrEqual(0.6);
  });
});
