import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { hitKind, protectedFor } from '../src/hud/hud';

const FULL = STATS.royale.bleedOut.value;

describe('the second after going Down, on screen (ticket 54)', () => {
  it('a hit that lands nothing reads as shielded, not as a hit', () => {
    expect(hitKind(false, false, 0)).toBe('shielded');
    expect(hitKind(false, true, 0)).toBe('shielded');
    expect(hitKind(false, false, 25)).toBe('hit');
    expect(hitKind(false, true, 60)).toBe('headshot');
    expect(hitKind(true, false, 25)).toBe('kill');
    expect(hitKind(true, true, 25)).toBe('headshotKill');
  });

  it('a seat just Downed is Protected for the grace, then not', () => {
    expect(protectedFor({ bleedOut: FULL })).toBeCloseTo(STATS.royale.downedGrace.value);
    expect(protectedFor({ bleedOut: FULL - 0.5 })).toBeCloseTo(0.5);
    expect(protectedFor({ bleedOut: FULL - STATS.royale.downedGrace.value })).toBe(0);
    expect(protectedFor({ bleedOut: 3 })).toBe(0);
    expect(protectedFor(null)).toBe(0);
  });
});
