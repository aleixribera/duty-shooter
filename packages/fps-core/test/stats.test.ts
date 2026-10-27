import { describe, expect, it } from 'vitest';
import { STATS, type Stat } from '@duty-shooter/fps-core';

interface Leaf {
  readonly path: string;
  readonly value: unknown;
}

/** Every non-object value in the tree, with its dotted path. */
function leaves(node: unknown, path = 'STATS'): Leaf[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [{ path, value: node }];
  if (isStat(node)) return [{ path, value: node }];
  return Object.entries(node).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

function isStat(node: object): node is Stat {
  return 'value' in node && 'provenance' in node;
}

function problems(path: string, stat: Stat): string[] {
  const out: string[] = [];
  if (!Number.isFinite(stat.value)) out.push(`${path}: value is not a finite number`);
  if (!stat.unit) out.push(`${path}: missing unit`);
  const p = stat.provenance;
  const validTolerance = (t: number | undefined) => t !== undefined && Number.isFinite(t) && t >= 0;
  const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (p.kind === 'sourced') {
    if (!validTolerance(p.tolerance)) out.push(`${path}: sourced value needs a tolerance >= 0`);
    if (!p.source.name.trim()) out.push(`${path}: source has no name`);
    if (!/^https?:\/\/\S+$/.test(p.source.url)) out.push(`${path}: source url is not a URL`);
    if (!validDate(p.source.collected)) out.push(`${path}: collected date is not YYYY-MM-DD`);
  } else if (p.kind === 'estimated') {
    if (p.method.trim().length < 10) out.push(`${path}: estimated value must say how it was estimated`);
    if (!validDate(p.collected)) out.push(`${path}: estimate date is not YYYY-MM-DD`);
    if (p.tolerance !== undefined && !validTolerance(p.tolerance)) out.push(`${path}: tolerance must be >= 0`);
  } else {
    out.push(`${path}: unknown provenance kind`);
  }
  return out;
}

describe('stats file', () => {
  it('holds every number as a stat with a source or an estimation method', () => {
    const report = leaves(STATS).flatMap(({ path, value }) =>
      value !== null && typeof value === 'object'
        ? problems(path, value as Stat)
        : // Flags (a material that stops bullets) are not numbers, and a weapon's traits are its words.
          typeof value === 'boolean' || (typeof value === 'string' && /^STATS\.weapons\.\w+\.traits\.\w+$/.test(path))
          ? []
          : [`${path}: bare ${typeof value} outside a stat`],
    );

    expect(report).toEqual([]);
  });

  it("keeps numbers out of a weapon's traits and words out of everywhere else", () => {
    const words = leaves(STATS).filter(({ value }) => typeof value === 'string');
    expect(words.length).toBeGreaterThan(0);
    for (const { path } of words) expect(path).toMatch(/^STATS\.weapons\.\w+\.traits\./);
  });

  it("gives every weapon the M4A1's row shape, and the M4A1 its existing stats", () => {
    const { weapons, weapon, damage } = STATS;
    expect(Object.keys(weapons)).toEqual(['m4a1', 'smg', 'shotgun', 'sniper', 'pistol']);
    expect(weapons.m4a1.handling.fireRate).toBe(weapon.fireRate);
    expect(weapons.m4a1.damage.bands['close']?.damage).toBe(damage.closeDamage);
    for (const row of Object.values(weapons)) {
      expect(Object.keys(row)).toEqual(['traits', 'handling', 'reload', 'damage', 'accuracy']);
      const bands = Object.values(row.damage.bands);
      // Bands run outward and only the last reaches any distance.
      expect(bands.at(-1)?.range).toBeUndefined();
      const ranges = bands.slice(0, -1).map((b) => b.range?.value ?? NaN);
      expect(ranges).toEqual([...ranges].sort((a, b) => a - b));
    }
  });

  it('keeps the estimated sprint speed under its sourced upper bound', () => {
    const { sprintSpeed, sprintSpeedUpperBound } = STATS.movement;

    expect(sprintSpeedUpperBound.provenance.kind).toBe('sourced');
    expect(sprintSpeed.value + (sprintSpeed.provenance.tolerance ?? 0)).toBeLessThan(sprintSpeedUpperBound.value);
  });
});
