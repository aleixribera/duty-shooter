import { describe, expect, it } from 'vitest';
import { Benchmark, CameraPath, percentiles } from '../src/bench';
import { buildRange } from '../src/map/maps';
import { buildSurvivalTown } from '../src/map/survival-town';

describe('benchmark camera path', () => {
  const path = new CameraPath([
    { position: [0, 0, 0], yaw: 3, pitch: 0 },
    { position: [10, 0, 0], yaw: -3, pitch: 0.2 },
    { position: [10, 0, 10], yaw: 0, pitch: 0 },
  ]);

  it('moves at a steady speed along straight legs', () => {
    expect(path.length).toBe(20);
    expect(path.pose(5).position).toEqual([5, 0, 0]);
    expect(path.pose(15).position).toEqual([10, 0, 5]);
    expect(path.pose(99).position).toEqual([10, 0, 10]);
  });

  it('turns the short way round between keys', () => {
    // From 3 to -3 rad is 0.28 rad the short way, through pi.
    expect(Math.abs(Math.cos(path.pose(5).yaw - Math.PI))).toBeCloseTo(1, 2);
    expect(path.pose(5).pitch).toBeCloseTo(0.1, 9);
  });
});

describe('benchmark run', () => {
  it('flies the path once per preset after a warm-up, then reports each', () => {
    const bench = new Benchmark(
      [
        { position: [0, 0, 0], yaw: 0, pitch: 0 },
        { position: [6, 0, 0], yaw: 0, pitch: 0 },
      ],
      { presets: ['low', 'high'], speed: 6, warmup: 1 },
    );
    const seen: string[] = [];
    let now = 0;
    for (;;) {
      const f = bench.frame(now);
      if (!f) break;
      if (f.presetStarted) seen.push(bench.preset!);
      bench.rendered(now, { drawCalls: 10, triangles: 1000 });
      now += 1000 / 60;
    }
    expect(seen).toEqual(['low', 'high']);
    expect(bench.reports.map((r) => r.preset)).toEqual(['low', 'high']);
    // 1 s of path at 60 fps per preset.
    for (const r of bench.reports) {
      expect(r.frames).toBeGreaterThan(55);
      expect(r.frames).toBeLessThan(65);
      expect(r.frameMs.p50).toBeCloseTo(16.667, 2);
      expect(r.drawCalls).toEqual({ mean: 10, max: 10 });
      expect(r.gpuMs).toBeNull();
    }
  });

  it('percentiles pick the sample at each rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentiles(v)).toEqual({ p50: 51, p95: 96, p99: 100, max: 100 });
  });

  it('both maps have a benchmark path', () => {
    expect(buildSurvivalTown().benchmarkPath.length).toBeGreaterThan(10);
    expect(buildRange().benchmarkPath.length).toBeGreaterThanOrEqual(2);
  });
});
