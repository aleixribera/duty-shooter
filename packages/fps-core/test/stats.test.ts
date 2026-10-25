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
        : [`${path}: bare ${typeof value} outside a stat`],
    );

    expect(report).toEqual([]);
  });

  it('keeps the estimated sprint speed under its sourced upper bound', () => {
    const { sprintSpeed, sprintSpeedUpperBound } = STATS.movement;

    expect(sprintSpeedUpperBound.provenance.kind).toBe('sourced');
    expect(sprintSpeed.value + (sprintSpeed.provenance.tolerance ?? 0)).toBeLessThan(sprintSpeedUpperBound.value);
  });
});
