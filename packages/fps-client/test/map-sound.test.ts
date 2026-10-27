import { describe, expect, it } from 'vitest';
import { OVERLAP, RADIO_SECONDS, WIND_SECONDS } from '../src/audio/ambience';
import { Ambience, environmentAt, type AmbientCue, type AmbientSource } from '../src/map-sound';

describe('the reverb switch', () => {
  const zones = [{ min: [0, 0, 0], max: [10, 3, 8] }] as const;

  it('rings indoors inside a zone and outdoors everywhere else', () => {
    expect(environmentAt(zones, [5, 1.5, 4])).toBe('indoor');
    expect(environmentAt(zones, [-0.5, 1.5, 4])).toBe('outdoor');
    expect(environmentAt(zones, [5, 3.5, 4])).toBe('outdoor');
    expect(environmentAt([], [5, 1.5, 4])).toBe('outdoor');
  });
});

/** Runs `ambience` for `seconds` at 60 fps, returning each cue with the clock time it starts at. */
function run(ambience: Ambience, seconds: number, from = 0, indoors = false): (AmbientCue & { at: number })[] {
  const out: (AmbientCue & { at: number })[] = [];
  for (let f = 0; f <= seconds * 60; f++) {
    const now = from + f / 60;
    for (const c of ambience.update(now, indoors)) out.push({ ...c, at: now + (c.params.when ?? 0) });
  }
  return out;
}

const town: AmbientSource[] = [
  { kind: 'wind' },
  { kind: 'birds', position: [26, 9, -7.5] },
  { kind: 'birds', position: [-46, 19, 14] },
  { kind: 'sign', position: [-14, 2, 0] },
  { kind: 'radio', position: [4, 1.2, -23] },
];

describe('the ambience', () => {
  it('plays the wind back to back, each segment overlapping the last by its crossfade', () => {
    const wind = run(new Ambience(town, () => 0.5), 60).filter((c) => c.event === 'ambientWind');
    expect(wind[0]?.at).toBeCloseTo(0);
    for (let i = 1; i < wind.length; i++) expect(wind[i]!.at - wind[i - 1]!.at).toBeCloseTo(WIND_SECONDS - 1.2, 6);
    expect(wind.length).toBeGreaterThan(8);
  });

  it('keeps the radio playing without a gap', () => {
    const radio = run(new Ambience(town, () => 0.5), 60).filter((c) => c.event === 'ambientRadio');
    for (let i = 1; i < radio.length; i++) expect(radio[i]!.at - radio[i - 1]!.at).toBeCloseTo(RADIO_SECONDS - OVERLAP, 6);
    expect(radio.every((c) => c.params.position?.[2] === -23)).toBe(true);
  });

  it('has a bird sing now and then from one of the perches, and the sign creak every few seconds', () => {
    const cues = run(new Ambience(town), 120);
    const birds = cues.filter((c) => c.event === 'ambientBirds');
    const creaks = cues.filter((c) => c.event === 'ambientCreak');
    expect(birds.length).toBeGreaterThanOrEqual(120 / 11 - 1);
    expect(birds.length).toBeLessThanOrEqual(120 / 4 + 1);
    expect(new Set(birds.map((c) => c.params.position?.[0])).size).toBe(2);
    for (let i = 1; i < creaks.length; i++) expect(creaks[i]!.at - creaks[i - 1]!.at).toBeGreaterThanOrEqual(2.5 - 1e-9);
    expect(creaks.length).toBeGreaterThan(15);
  });

  it('muffles the wind indoors', () => {
    const a = new Ambience(town, () => 0.5);
    const outside = run(a, 1).find((c) => c.event === 'ambientWind');
    const inside = run(a, 10, 2, true).find((c) => c.event === 'ambientWind');
    expect(inside!.params.intensity!).toBeLessThan(outside!.params.intensity! * 0.5);
  });

  it('picks up from now after a stall instead of playing everything it missed', () => {
    const a = new Ambience(town, () => 0.5);
    run(a, 5);
    const after = a.update(305, false);
    expect(after.filter((c) => c.event === 'ambientWind')).toHaveLength(1);
    expect(after.filter((c) => c.event === 'ambientRadio')).toHaveLength(1);
    expect(after.length).toBeLessThanOrEqual(4);
  });

  it('is silent on a map with no ambience', () => {
    expect(run(new Ambience([]), 30)).toHaveLength(0);
  });
});
