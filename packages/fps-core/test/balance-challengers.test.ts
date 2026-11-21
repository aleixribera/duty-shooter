// The primaries without a band of their own (the light machine gun, the marksman rifle, the burst rifle) against
// the four that have one; beside balance.test.ts, so the two sets of duels run side by side.
import { beforeAll, describe, expect, it } from 'vitest';
import { CHALLENGER_WEAPONS, DUEL_WEAPONS, challengerRuns, type DuelCell } from '@duty-shooter/fps-core/harness';
import { CHALLENGER_ERROR, CHALLENGER_ROUNDS, band, challengerOverall, rate } from './support/balance';

let challengers: DuelCell[] = [];
beforeAll(() => {
  challengers = challengerRuns(CHALLENGER_ROUNDS);
}, 1_500_000);

describe('the primaries without a band of their own, against the four that have one', () => {
  it.each(CHALLENGER_WEAPONS)('the %s wins 40 to 60 percent of all its duels with them', (w) => {
    expect(challengerOverall(challengers, w)).toBeGreaterThanOrEqual(0.4);
    expect(challengerOverall(challengers, w)).toBeLessThanOrEqual(0.6);
  });

  it.each(CHALLENGER_WEAPONS)('the %s takes no band from the primary that owns it', (w) => {
    // Two standard errors of a 48-duel cell above a half: a gun that wins an owner's band outright shows past it.
    for (const owner of DUEL_WEAPONS) expect(rate(challengers, w, owner, band(owner)), `against the ${owner} at ${band(owner)} m`).toBeLessThan(0.5 + 2 * CHALLENGER_ERROR);
  });

  it.each(CHALLENGER_WEAPONS)('the %s is a gun for range: it loses to the shotgun at 5 m and beats it at 60 m', (w) => {
    expect(rate(challengers, w, 'shotgun', 5)).toBeLessThan(0.5);
    expect(rate(challengers, w, 'shotgun', 60)).toBeGreaterThan(0.5);
  });
});
