import { describe, expect, it } from 'vitest';
import { createRng } from '../src/audio/dsp';
import { blast, siren, upsample } from '../src/audio/nuke';

const SR = 22050;

/** RMS of `data` between `from` and `to` seconds. */
const rms = (data: Float32Array, from: number, to: number) => {
  let sum = 0;
  const a = Math.round(from * SR);
  const b = Math.round(to * SR);
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / (b - a));
};

const peak = (data: Float32Array) => data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Rising zero crossings per second between `from` and `to`: roughly the fundamental (Hz). */
const pitch = (data: Float32Array, from: number, to: number) => {
  let n = 0;
  for (let i = Math.round(from * SR) + 1; i < Math.round(to * SR); i++) if ((data[i - 1] ?? 0) < 0 && (data[i] ?? 0) >= 0) n++;
  return n / (to - from);
};

describe('the nuke siren', () => {
  const s = siren(SR, createRng(1));

  it('winds up from a growl to a wail and holds there', () => {
    expect(pitch(s, 0.1, 0.4)).toBeLessThan(pitch(s, 2, 3.5) * 0.6);
    expect(pitch(s, 2, 3.5)).toBeGreaterThan(450);
    expect(pitch(s, 2, 3.5)).toBeLessThan(800);
  });

  it('is clean audio: finite, below full scale and fading to silence', () => {
    expect(s.every(Number.isFinite)).toBe(true);
    expect(peak(s)).toBeLessThanOrEqual(1);
    expect(rms(s, s.length / SR - 0.05, s.length / SR)).toBeLessThan(rms(s, 2, 3) * 0.1);
  });
});

describe('the nuke blast', () => {
  const b = blast(SR, createRng(1));

  it('hits hardest at once, then rumbles on for seconds', () => {
    expect(rms(b, 0, 0.3)).toBeGreaterThan(rms(b, 2, 3));
    expect(rms(b, 2, 3)).toBeGreaterThan(rms(b, 0, 0.3) * 0.05);
    expect(b.length / SR).toBeGreaterThan(5);
  });

  it('is clean audio: finite and below full scale', () => {
    expect(b.every(Number.isFinite)).toBe(true);
    expect(peak(b)).toBeLessThanOrEqual(1);
  });
});

describe('stretching a quarter-rate render back up', () => {
  it('keeps the ends and interpolates between samples', () => {
    const up = upsample(new Float32Array([0, 1, 0]), 5);
    expect(Array.from(up)).toEqual([0, 0.5, 1, 0.5, 0]);
  });
});
