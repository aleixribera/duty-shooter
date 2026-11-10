import { describe, expect, it } from 'vitest';
import { Benchmark, CameraPath, benchLine, frameTimeText, mean, onePercentLow, percentiles, type BenchReport } from '../src/bench';
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
  it('flies the path once after a warm-up, then reports it', () => {
    const bench = new Benchmark(
      [
        { position: [0, 0, 0], yaw: 0, pitch: 0 },
        { position: [6, 0, 0], yaw: 0, pitch: 0 },
      ],
      { speed: 6, warmup: 1 },
    );
    let now = 0;
    while (bench.frame(now)) {
      expect(bench.result).toBeNull();
      bench.rendered(now, { drawCalls: 10, triangles: 1000 });
      now += 1000 / 60;
    }
    // 1 s of path at 60 fps.
    const r = bench.result!;
    expect(r.frames).toBeGreaterThan(55);
    expect(r.frames).toBeLessThan(65);
    expect(r.frameMs.p50).toBeCloseTo(16.667, 2);
    expect(r.drawCalls).toEqual({ mean: 10, max: 10 });
    expect(r.gpuMs).toBeNull();
  });

  it('says how far along it is, and which frames it measures', () => {
    const bench = new Benchmark(
      [
        { position: [0, 0, 0], yaw: 0, pitch: 0 },
        { position: [12, 0, 0], yaw: 0, pitch: 0 },
      ],
      { speed: 6, warmup: 1 },
    );
    expect(bench.seconds).toBe(3);
    expect([bench.progress(0), bench.measuring(0)]).toEqual([0, false]);
    bench.frame(1000);
    expect([bench.progress(1500), bench.measuring(1500)]).toEqual([0, false]);
    expect([bench.progress(3000), bench.measuring(3000)]).toEqual([0.5, true]);
    expect(bench.frame(4100)).toBeNull();
    expect([bench.progress(4100), bench.measuring(4100)]).toEqual([1, false]);
  });

  it('reports the average and the 1% low', () => {
    const bench = new Benchmark(
      [
        { position: [0, 0, 0], yaw: 0, pitch: 0 },
        { position: [60, 0, 0], yaw: 0, pitch: 0 },
      ],
      { speed: 6, warmup: 0 },
    );
    let now = 0;
    let n = 0;
    while (bench.frame(now)) {
      bench.rendered(now, { drawCalls: 1, triangles: 1 });
      now += ++n % 100 === 0 ? 50 : 10;
    }
    const r = bench.result!;
    expect(r.meanMs).toBeCloseTo(10.4, 1);
    // Nine hitches of 50 ms among some 960 frames: the slowest hundredth is nearly all of them.
    expect(r.low1Ms).toBeGreaterThan(40);
    expect(r.low1Ms).toBeLessThanOrEqual(50);
  });

  it('the 1% low is the average of the slowest hundredth of the frames, one frame at least', () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4])).toBe(3);
    expect(onePercentLow([])).toBe(0);
    expect(onePercentLow([10, 30, 20])).toBe(30);
    expect(onePercentLow([...Array.from({ length: 298 }, () => 10), 40, 60, 80])).toBeCloseTo(60);
  });

  it('writes the run as one line to paste', () => {
    const report = (map: string, meanMs: number, low1Ms: number, gpu: number | null): BenchReport =>
      ({ map, backend: 'WebGPU', adapter: 'nvidia rtx 4070', resolution: [1920, 1080], meanMs, low1Ms, gpuMs: gpu === null ? null : { p50: gpu, p95: gpu, p99: gpu, max: gpu } }) as unknown as BenchReport;
    expect(benchLine('v2.152.0', [report('range', 5.04, 9.26, null), report('switchyard', 16.7, 31, 3.24)], (m) => m.toUpperCase())).toBe(
      'Duty Shooter v2.152.0 | WebGPU | nvidia rtx 4070 | drawn at 1920x1080 | RANGE 5.0 ms avg, 9.3 ms 1% low | SWITCHYARD 16.7 ms avg, 31.0 ms 1% low, GPU 3.2 ms',
    );
    expect(benchLine('dev', [])).toBe('');
    expect(benchLine('dev', [{ ...report('range', 5, 9, null), adapter: '' }])).toContain('| adapter not named |');
    expect(frameTimeText(16.666)).toBe('16.7 ms (60 fps)');
    expect(frameTimeText(0)).toBe('no frames');
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
