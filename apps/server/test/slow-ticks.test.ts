import { describe, expect, it } from 'vitest';
import { noFacts, type SlowTick } from '@duty-shooter/fps-core';
import { SlowLog, slowLine } from '../src/slow-ticks';

const tick = (at: number, wall: number): SlowTick => ({ at, wall, cpu: wall, lag: 0, phases: { think: wall }, slowestBot: null, facts: noFacts(), gc: [], cause: 'work:think' });

describe('the slow tick log', () => {
  it('prints the first few of a stretch, then only ticks over the bar, and starts again ten seconds on', () => {
    const lines: string[] = [];
    const log = new SlowLog((line) => lines.push(line));
    for (let i = 0; i < 20; i++) log.write(tick(i, 9));
    expect(lines).toHaveLength(12);
    for (let i = 0; i < 100; i++) log.write(tick(100 + i, 20));
    expect(lines).toHaveLength(60);
    log.write(tick(10_000, 9));
    expect(lines).toHaveLength(61);
  });

  it('writes a line a script can read back', () => {
    const line = slowLine({ ...tick(5, 12.3456), gc: [{ kind: 'minor', ms: 1.234, offset: 0.5 }] });
    expect(line.startsWith('slow ')).toBe(true);
    const read = JSON.parse(line.slice(5)) as SlowTick;
    expect(read).toMatchObject({ wall: 12.35, cause: 'work:think', phases: { think: 12.35 }, gc: [{ kind: 'minor', ms: 1.23 }] });
  });
});
