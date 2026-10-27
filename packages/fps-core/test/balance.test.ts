import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { STATS, WEAPON_IDS, shotsToKill, timeToKill, timeToKillTable, type WeaponId } from '@duty-shooter/fps-core';
import { DUEL_DISTANCES, DUEL_WEAPONS, balanceRuns, winRate, type DuelCell } from '@duty-shooter/fps-core/harness';

/** Seeded duels per pair, distance and side: 240 duels a cell, enough that one more win or loss moves a cell by under half a point. */
const ROUNDS = 120;
/** `BALANCE_REPORT=docs/balance.md npx vitest run packages/fps-core/test/balance.test.ts` writes the tables there. */
const REPORT = process.env.BALANCE_REPORT;

const M4A1 = STATS.weapons.m4a1.damage.bands;

/** "About" a time target: within a fifth of it. */
const about = (target: number) => [target * 0.8, target * 1.2] as const;

describe('time-to-kill targets', () => {
  it('the M4A1 kills in 4, 5 and 6 torso shots, close, medium and long', () => {
    expect(shotsToKill('m4a1', M4A1.close!.range!.value - 1)).toBe(4);
    expect(shotsToKill('m4a1', M4A1.medium!.range!.value - 1)).toBe(5);
    expect(shotsToKill('m4a1', M4A1.medium!.range!.value + 10)).toBe(6);
  });

  it('the SMG kills in about 170 ms within 12 m, about 330 ms by 25 m, and slower than the M4A1 past 25 m', () => {
    const [closeLo, closeHi] = about(0.17);
    const [mediumLo, mediumHi] = about(0.33);
    for (const d of [2, 6, 12]) {
      expect(timeToKill('smg', d), `${d} m`).toBeGreaterThanOrEqual(closeLo);
      expect(timeToKill('smg', d), `${d} m`).toBeLessThanOrEqual(closeHi);
    }
    expect(timeToKill('smg', 24)).toBeGreaterThanOrEqual(mediumLo);
    expect(timeToKill('smg', 24)).toBeLessThanOrEqual(mediumHi);
    for (const d of [26, 40, 60, 90]) expect(timeToKill('smg', d), `${d} m`).toBeGreaterThan(timeToKill('m4a1', d));
  });

  it('the shotgun kills in one shot within 5 m, two within 12 m, and not reliably past 18 m', () => {
    for (const d of [1, 3, 5]) expect(shotsToKill('shotgun', d), `${d} m`).toBe(1);
    // At 12 m about half of an aimed blast lands.
    for (const d of [6, 9, 12]) expect(shotsToKill('shotgun', d, 'upperTorso', 4), `${d} m`).toBeLessThanOrEqual(2);
    // Past 18 m even every pellet of two blasts on target leaves the player standing.
    for (const d of [19, 25, 40]) expect(shotsToKill('shotgun', d), `${d} m`).toBeGreaterThan(2);
  });

  it('the sniper kills in one shot to the head, neck or upper torso at any range, two to the lower torso and limbs', () => {
    for (const d of [5, 30, 80, 200]) {
      for (const zone of ['head', 'neck', 'upperTorso'] as const) expect(shotsToKill('sniper', d, zone), `${zone} at ${d} m`).toBe(1);
      for (const zone of ['lowerTorso', 'arm', 'leg'] as const) expect(shotsToKill('sniper', d, zone), `${zone} at ${d} m`).toBe(2);
    }
  });

  it('the pistol kills in about 450 ms within 10 m', () => {
    const [lo, hi] = about(0.45);
    for (const d of [3, 10]) {
      expect(timeToKill('pistol', d), `${d} m`).toBeGreaterThanOrEqual(lo);
      expect(timeToKill('pistol', d), `${d} m`).toBeLessThanOrEqual(hi);
    }
  });
});

/** `x`'s share of its duels with `y` at `distance` (a draw counts half). */
function rate(cells: readonly DuelCell[], x: WeaponId, y: WeaponId, distance: number): number {
  const cell = cells.find((c) => c.distance === distance && ((c.a === x && c.b === y) || (c.a === y && c.b === x)))!;
  return cell.a === x ? winRate(cell) : 1 - winRate(cell);
}

/** `x`'s share of every duel it fought, against every other primary at every distance. */
function overall(cells: readonly DuelCell[], x: WeaponId): number {
  const others = DUEL_WEAPONS.filter((y) => y !== x);
  return others.reduce((n, y) => n + DUEL_DISTANCES.reduce((m, d) => m + rate(cells, x, y, d), 0), 0) / (others.length * DUEL_DISTANCES.length);
}

/** The band each primary is meant to own: the duel distances in the order of the primaries. */
const band = (w: WeaponId) => DUEL_DISTANCES[DUEL_WEAPONS.indexOf(w)]!;

describe('bot-vs-bot balance runs', () => {
  let cells: DuelCell[] = [];
  beforeAll(() => {
    cells = balanceRuns(ROUNDS);
    if (REPORT) writeFileSync(REPORT, report(cells));
  }, 600_000);

  it.each(DUEL_WEAPONS)('the %s wins its own band against every other primary', (w) => {
    for (const other of DUEL_WEAPONS) if (other !== w) expect(rate(cells, w, other, band(w)), `against the ${other} at ${band(w)} m`).toBeGreaterThan(0.5);
  });

  it.each(DUEL_WEAPONS)('the %s wins 40 to 60 percent of all its duels', (w) => {
    expect(overall(cells, w)).toBeGreaterThanOrEqual(0.4);
    expect(overall(cells, w)).toBeLessThanOrEqual(0.6);
  });
});

const pct = (x: number) => `${Math.round(x * 100)} %`;
const ms = (s: number) => (s === 0 ? '0' : `${Math.round(s * 1000)}`);

/** The balance report: the time-to-kill table and the duel tables, as Markdown. */
function report(cells: readonly DuelCell[]): string {
  const ttkDistances = [5, 10, 15, 25, 40, 60];
  const ttk = timeToKillTable(ttkDistances);
  const lines = [
    '# Weapon balance',
    '',
    'Generated by `packages/fps-core/test/balance.test.ts`. Rerun it with',
    '`BALANCE_REPORT=docs/balance.md npx vitest run packages/fps-core/test/balance.test.ts`.',
    '',
    '## Time to kill',
    '',
    'Upper-torso hits against 100 HP at the fastest rate the weapon fires (every pellet of a blast on target): shots, then milliseconds from the first shot to the killing one.',
    '',
    `| Weapon | ${ttkDistances.map((d) => `${d} m`).join(' | ')} |`,
    `| --- | ${ttkDistances.map(() => '---').join(' | ')} |`,
    ...WEAPON_IDS.map((w) => `| ${STATS.weapons[w].traits.name} (${w}) | ${ttkDistances.map((d) => {
      const t = ttk.find((r) => r.weapon === w && r.distance === d)!;
      return `${t.shots} / ${ms(t.time)}`;
    }).join(' | ')} |`),
    '',
    '## Duels',
    '',
    `Two moderate bots, one primary each plus the pistol and a frag, start in sight of each other in a seeded yard with crates and walls, weapons drawn, and fight until one dies. Each cell is ${ROUNDS * 2} duels: ${ROUNDS} seeded spots and bot pairs, each fought twice with the spots and personalities swapped. A draw counts half.`,
    '',
    '### Win rate of the row weapon against the column weapon',
    '',
    ...DUEL_DISTANCES.flatMap((d) => [
      `**${d} m**`,
      '',
      `| | ${DUEL_WEAPONS.join(' | ')} |`,
      `| --- | ${DUEL_WEAPONS.map(() => '---').join(' | ')} |`,
      ...DUEL_WEAPONS.map((x) => `| ${x} | ${DUEL_WEAPONS.map((y) => (x === y ? '' : pct(rate(cells, x, y, d)))).join(' | ')} |`),
      '',
    ]),
    '### Each primary in its own band and overall',
    '',
    '| Weapon | Band | Worst win rate in its band | Over all distances, per opponent | Overall |',
    '| --- | --- | --- | --- | --- |',
    ...DUEL_WEAPONS.map((w) => {
      const others = DUEL_WEAPONS.filter((y) => y !== w);
      const worst = Math.min(...others.map((y) => rate(cells, w, y, band(w))));
      const pairs = others.map((y) => `${y} ${pct(DUEL_DISTANCES.reduce((n, d) => n + rate(cells, w, y, d), 0) / DUEL_DISTANCES.length)}`).join(', ');
      return `| ${w} | ${band(w)} m | ${pct(worst)} | ${pairs} | ${pct(overall(cells, w))} |`;
    }),
    '',
  ];
  return lines.join('\n');
}
