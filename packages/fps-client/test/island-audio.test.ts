import { describe, expect, it } from 'vitest';
import { Announcer, leftLine, type Speaker } from '../src/announcer';
import { createRng } from '../src/audio/dsp';
import { FAR_FAMILY, HEARD_EDGE, edgeFade, gunshotVoice, renderFar } from '../src/audio/gunshot';
import { distanceGain } from '../src/audio/system';
import { birdsFlush, gravelSlide, metalRattle } from '../src/audio/traps';

const SR = 22050;
const rms = (data: Float32Array, from: number, to: number) => {
  let sum = 0;
  const a = Math.round(from * SR);
  const b = Math.min(data.length, Math.round(to * SR));
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / Math.max(1, b - a));
};
const clean = (data: Float32Array) => data.every(Number.isFinite) && data.every((v) => Math.abs(v) <= 1);
/** How long (s) a sound takes to put out 90% of its energy: its length as heard. */
const tail = (data: Float32Array) => {
  let total = 0;
  for (const v of data) total += v * v;
  let sum = 0;
  for (let i = 0; i < data.length; i++) if ((sum += data[i]! * data[i]!) > total * 0.9) return i / SR;
  return data.length / SR;
};

describe('the sound traps', () => {
  it('each sounds, cleanly, and dies away within its length', () => {
    for (const [render, seconds] of [[birdsFlush, 2.2], [metalRattle, 1.6], [gravelSlide, 1.5]] as const) {
      const s = render(SR, createRng(7));
      expect(s.length / SR).toBeCloseTo(seconds, 2);
      expect(clean(s)).toBe(true);
      expect(rms(s, 0, 0.5)).toBeGreaterThan(0.03);
      expect(rms(s, seconds - 0.1, seconds)).toBeLessThan(rms(s, 0, 0.5) * 0.25);
    }
  });

  it('carry farther than a footstep', () => {
    expect(distanceGain('trapBirds', 60)).toBeGreaterThan(distanceGain('footstep', 60) * 4);
    expect(distanceGain('trapMetal', 60)).toBeGreaterThan(distanceGain('footstep', 60) * 3);
  });
});

describe('a far gunshot', () => {
  it('has a voice for each family: the sniper rolls longest and cracks ahead of its boom, a light gun is over soonest', () => {
    const far = (w: keyof typeof FAR_FAMILY) => renderFar(createRng(3), SR, FAR_FAMILY[w])[0]!;
    for (const w of ['m4a1', 'sniper', 'shotgun', 'smg', 'pistol'] as const) expect(clean(far(w))).toBe(true);
    expect(FAR_FAMILY.smg).toBe(FAR_FAMILY.pistol);
    expect(tail(far('sniper'))).toBeGreaterThan(tail(far('m4a1')));
    expect(tail(far('pistol'))).toBeLessThan(tail(far('m4a1')));
    // The crack, then a hush, then the report: the round outruns the sound of its own shot.
    const sniper = far('sniper');
    expect(rms(sniper, 0, 0.005)).toBeGreaterThan(rms(sniper, 0.02, 0.05) * 3);
    expect(rms(sniper, 0.06, 0.2)).toBeGreaterThan(rms(sniper, 0.02, 0.05) * 3);
  });

  it('holds its voice slot only as long as it rings: a near shot briefly, a far sniper for its long tail', () => {
    const v = gunshotVoice();
    expect(v.lengthOf!({ local: true })).toBe(0.75);
    expect(v.lengthOf!({ distance: 20, weapon: 'sniper' })).toBe(0.75);
    expect(v.lengthOf!({ distance: 200, weapon: 'sniper' })).toBeGreaterThan(1.4);
    expect(v.lengthOf!({ distance: 200, weapon: 'pistol' })).toBeLessThan(v.lengthOf!({ distance: 200, weapon: 'm4a1' }));
    expect(v.lengthOf!({ distance: 200, weapon: 'sniper' })).toBeLessThanOrEqual(v.duration!);
  });

  it('fades out over the last stretch before the hearing range, where shots stop being sent', () => {
    expect(HEARD_EDGE).toBe(400);
    expect(edgeFade(200)).toBe(1);
    expect(edgeFade(320)).toBe(1);
    expect(edgeFade(360)).toBeCloseTo(0.5);
    expect(edgeFade(400)).toBe(0);
    expect(edgeFade(450)).toBe(0);
  });
});

describe('the announcer', () => {
  it('calls the Squads left on the way down past 10, 5, 3 and 2, players in Solos', () => {
    expect(leftLine(11, 10, false)).toBe('10 squads left');
    expect(leftLine(10, 9, false)).toBeNull();
    expect(leftLine(7, 4, false)).toBe('4 squads left');
    expect(leftLine(4, 3, true)).toBe('3 players left');
    expect(leftLine(3, 2, false)).toBe('2 squads left');
    expect(leftLine(2, 1, false)).toBeNull();
    // Joining mid-match, or a count going up, says nothing.
    expect(leftLine(null, 5, false)).toBeNull();
    expect(leftLine(4, 5, false)).toBeNull();
  });

  it('speaks at the game volume, and not at all when it is off', () => {
    const said: [string, number][] = [];
    const speaker: Speaker = { speak: (text, volume) => said.push([text, volume]), cancel: () => said.push(['(quiet)', 0]) };
    const a = new Announcer(speaker);
    a.volume = 0.6;
    a.say('Ring closing');
    a.volume = 0;
    a.say('5 squads left');
    a.stop();
    expect(said).toEqual([['Ring closing', 0.6], ['(quiet)', 0]]);
    expect(() => new Announcer(null).say('Ring closing')).not.toThrow();
  });
});
