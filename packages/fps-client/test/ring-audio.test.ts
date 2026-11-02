import { describe, expect, it } from 'vitest';
import { createRng } from '../src/audio/dsp';
import { RING_HUM_SECONDS, RING_OVERLAP, ringCrackle, ringHum, ringShift } from '../src/audio/ring';
import { RING_HEARD, RingSounds } from '../src/ring-sounds';

const SR = 22050;
const rms = (data: Float32Array, from: number, to: number) => {
  let sum = 0;
  const a = Math.round(from * SR);
  const b = Math.round(to * SR);
  for (let i = a; i < b; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / (b - a));
};
const clean = (data: Float32Array) => data.every(Number.isFinite) && data.every((v) => Math.abs(v) <= 1);

describe("the Ring's sound", () => {
  it('hums in segments that fade across their overlap', () => {
    const h = ringHum(SR, createRng(1));
    expect(h.length / SR).toBeCloseTo(RING_HUM_SECONDS, 2);
    expect(Math.abs(h[0]!)).toBeLessThan(1e-3);
    expect(rms(h, RING_HUM_SECONDS - 0.01, RING_HUM_SECONDS)).toBeLessThan(rms(h, RING_OVERLAP, RING_HUM_SECONDS - RING_OVERLAP) * 0.1);
    expect(rms(h, RING_OVERLAP, RING_HUM_SECONDS - RING_OVERLAP)).toBeGreaterThan(0.05);
    expect(clean(h)).toBe(true);
  });

  it('crackles in a sharp snap that dies away, and warns with a clean rising tone', () => {
    const c = ringCrackle(SR, createRng(2));
    expect(rms(c, 0, 0.08)).toBeGreaterThan(rms(c, 0.5, 0.6) * 4);
    expect(clean(c)).toBe(true);
    const w = ringShift(SR, createRng(3));
    expect(clean(w)).toBe(true);
    expect(rms(w, 0.1, 0.5)).toBeGreaterThan(0.05);
  });
});

describe('where the Ring is heard from', () => {
  const ring = { x: 0, z: 0, radius: 100 };

  it('hums from the point of the wall nearest the listener, inside or out', () => {
    const s = new RingSounds(() => 0.99);
    const inside = s.update(ring, 10, [60, 5, 0]).find((c) => c.event === 'ringHum');
    expect(inside?.params.position?.[0]).toBeCloseTo(100);
    expect(inside?.params.position?.[2]).toBeCloseTo(0);
    const t = new RingSounds(() => 0.99);
    const outside = t.update(ring, 10, [0, 5, -160]).find((c) => c.event === 'ringHum');
    expect(outside?.params.position?.[2]).toBeCloseTo(-100);
  });

  it('lays segments end to end across their overlap', () => {
    const s = new RingSounds(() => 0.99);
    const starts: number[] = [];
    for (let t = 0; t < 12; t += 1 / 30) for (const c of s.update(ring, t, [90, 0, 0])) if (c.event === 'ringHum') starts.push(t + (c.params.when ?? 0));
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeCloseTo(RING_HUM_SECONDS - RING_OVERLAP, 1);
  });

  it('is silent with no Ring, or far beyond earshot', () => {
    expect(new RingSounds(() => 0).update(null, 1, [0, 0, 0])).toEqual([]);
    expect(new RingSounds(() => 0).update(ring, 1, [0, 0, 0 + 100 + RING_HEARD + 5])).toEqual([]);
    expect(new RingSounds(() => 0).update({ x: 0, z: 0, radius: 900 }, 1, [0, 0, 0])).toEqual([]);
  });

  it('crackles near the listener now and then', () => {
    const s = new RingSounds(() => 0);
    const cues = s.update(ring, 1, [95, 0, 0]);
    const snap = cues.find((c) => c.event === 'ringCrackle');
    expect(snap).toBeDefined();
    const [x, , z] = snap!.params.position!;
    expect(Math.hypot(x, z)).toBeCloseTo(100);
  });
});
