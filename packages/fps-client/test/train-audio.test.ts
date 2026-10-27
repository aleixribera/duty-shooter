import { describe, expect, it } from 'vitest';
import { armed, beep, disarmed, keyPress, toolClick } from '../src/audio/charge';
import { createRng, hp } from '../src/audio/dsp';
import { HORN_SECONDS, RUMBLE_OVERLAP, RUMBLE_SECONDS, clack, farHorn, horn, rumble } from '../src/audio/train';

const SR = 22050;

/** RMS of `data` between `from` and `to` seconds. */
const rms = (data: Float32Array, from: number, to: number) => {
  let sum = 0;
  const a = Math.round(from * SR);
  const b = Math.round(to * SR);
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / (b - a));
};

const clean = (data: Float32Array) => data.every(Number.isFinite) && data.every((v) => Math.abs(v) <= 1);

describe('the freight train', () => {
  it('sounds its horn in two long blasts with a breath between', () => {
    const h = horn(SR, createRng(1));
    expect(h.length / SR).toBeCloseTo(HORN_SECONDS, 1);
    expect(rms(h, 1.68, 1.82)).toBeLessThan(rms(h, 0.3, 1.3) * 0.1);
    expect(rms(h, 2.1, 3.1)).toBeGreaterThan(rms(h, 0.3, 1.3) * 0.7);
    expect(clean(h)).toBe(true);
  });

  it('heard far off, has the highs taken out by the distance', () => {
    const near = horn(SR, createRng(2));
    const far = farHorn(SR, createRng(2));
    // The share of it above 2 kHz.
    const highs = (d: Float32Array) => rms(hp(d.slice(), SR, 2000), 0.3, 1.3) / rms(d, 0.3, 1.3);
    expect(highs(far)).toBeLessThan(highs(near) * 0.4);
    expect(clean(far)).toBe(true);
  });

  it('rumbles in segments that fade in and out across their overlap, the locos deeper than the wagons', () => {
    const locos = rumble(SR, createRng(3), 1);
    const wagons = rumble(SR, createRng(3), 0);
    for (const r of [locos, wagons]) {
      expect(r.length / SR).toBeCloseTo(RUMBLE_SECONDS, 2);
      expect(Math.abs(r[0]!)).toBeLessThan(1e-3);
      expect(rms(r, RUMBLE_SECONDS - 0.01, RUMBLE_SECONDS)).toBeLessThan(rms(r, RUMBLE_OVERLAP, RUMBLE_SECONDS - RUMBLE_OVERLAP) * 0.1);
      expect(clean(r)).toBe(true);
    }
    // Rising zero crossings: the diesels' low note pulls the locos' down.
    const crossings = (d: Float32Array) => d.reduce((n, v, i) => n + ((d[i - 1] ?? 0) < 0 && v >= 0 ? 1 : 0), 0);
    expect(crossings(locos)).toBeLessThan(crossings(wagons));
  });

  it('clacks twice over a joint, a wheelset at a time', () => {
    const c = clack(SR, createRng(4), 0.065);
    expect(rms(c, 0, 0.03)).toBeGreaterThan(rms(c, 0.04, 0.065) * 1.5);
    expect(rms(c, 0.07, 0.1)).toBeGreaterThan(rms(c, 0.04, 0.065) * 1.5);
    expect(clean(c)).toBe(true);
  });
});

describe('the charge', () => {
  it('makes short, clean sounds', () => {
    const rng = createRng(5);
    for (const s of [keyPress(SR, rng, 0.3), armed(SR, rng), beep(SR), toolClick(SR, rng, 0), toolClick(SR, rng, 1), disarmed(SR, rng)]) {
      expect(s.length / SR).toBeLessThan(1);
      expect(rms(s, 0, s.length / SR)).toBeGreaterThan(0.01);
      expect(clean(s)).toBe(true);
    }
  });

  it('beeps high and short', () => {
    const b = beep(SR);
    const crossings = b.reduce((n, v, i) => n + ((b[i - 1] ?? 0) < 0 && v >= 0 ? 1 : 0), 0);
    expect(crossings / 0.075).toBeGreaterThan(2000);
    expect(rms(b, 0.09, 0.12)).toBeLessThan(0.001);
  });
});
