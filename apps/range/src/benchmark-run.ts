import { BenchmarkPage } from '@duty-shooter/fps-client/ui';
import type { Game } from '@duty-shooter/fps-client';
import type { WebGPURenderer } from 'three/webgpu';
import { Benchmark, benchLine, type BenchReport } from './bench';
import type { MapDefinition, MapId } from './map/maps';

/** Draws one frame of a run at `time`; whether it was one of the measured ones. */
export type BenchFrame = (time: number) => boolean;

/**
 * Runs the benchmark on the game's map: the menu hidden, the camera on the
 * benchmark path. The report goes to an on-screen panel, to the console as
 * JSON and to `window.duty.benchmark`.
 */
export function startBenchmarkOn(
  game: Game,
  renderer: WebGPURenderer,
  map: MapDefinition,
  about: {
    backend: string;
    adapter: string;
    /** The benchmark page's run: no panel of its own, `done` gets the report and `progress` how far along it is. */
    quiet?: boolean;
    done?: (report: BenchReport) => void;
    progress?: (fraction: number, frameRate: number) => void;
  },
): BenchFrame {
  const bench = new Benchmark(map.benchmarkPath);
  const loadMs = Math.round(performance.now());
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;margin:0;padding:10px 12px;background:rgb(10 12 14 / 0.8);color:#e8e6e1;font:12px/1.4 ui-monospace,monospace;z-index:10;white-space:pre;';
  if (!about.quiet) document.body.append(panel);
  renderer.info.autoReset = false;
  /** The size drawn: the window's own pixels. */
  let resolution: readonly [number, number] | null = null;
  let pendingGpu = false;
  let finished = false;
  return (time) => {
    if (finished) {
      game.frame(time);
      return false;
    }
    const f = bench.frame(time);
    if (!f) {
      finished = true;
      renderer.info.autoReset = true;
      const report: BenchReport = {
        map: map.id,
        backend: about.backend,
        adapter: about.adapter,
        resolution: resolution ?? [renderer.domElement.width, renderer.domElement.height],
        loadMs,
        ...bench.result!,
      };
      about.done?.(report);
      if (about.quiet) return false;
      panel.textContent = `BENCHMARK ${map.name}
${JSON.stringify(report, null, 1)}`;
      console.log(`BENCHMARK ${JSON.stringify(report)}`);
      Object.assign(globalThis, { duty: { ...((globalThis as { duty?: object }).duty ?? {}), benchmark: report } });
      document.body.dataset['benchmark'] = 'done';
      return false;
    }
    game.overview = f;
    renderer.info.reset();
    resolution ??= [renderer.domElement.width, renderer.domElement.height];
    game.frame(time);
    bench.rendered(time, { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles });
    if (about.quiet) about.progress?.(bench.progress(time), game.fps);
    else panel.textContent = `BENCHMARK ${map.name} · ${game.fps.toFixed(0)} fps`;
    // GPU time: Three.js keeps the latest frame's queries per pass, so each resolve reads one frame.
    if (!pendingGpu) {
      pendingGpu = true;
      void renderer
        .resolveTimestampsAsync('render')
        .then((ms) => {
          if (typeof ms === 'number') bench.gpu(ms);
        })
        .finally(() => (pendingGpu = false));
    }
    return bench.measuring(time);
  };
}

/** What the benchmark page needs from the app. */
export interface BenchmarkPageContext {
  readonly maps: readonly MapId[];
  readonly version: string;
  readonly renderer: WebGPURenderer;
  readonly backend: string;
  readonly adapter: string;
  /** A map's definition (building it if need be). */
  map(id: MapId): MapDefinition;
  /** A map's name from an id, as a report names it. */
  nameOf(id: string): string;
  /** Puts the map on show from a cold start, ready and lit, and gives the game that shows it. */
  show(id: MapId): Promise<Game>;
  /** The frame loop draws through this while a run flies; null hands the loop back. */
  fly(frame: BenchFrame | null): void;
  /** Start a run without the click (`&run`). */
  readonly runNow: boolean;
}

/** The benchmark page a player opens from Settings > Video (ticket 27): every map flown in turn, from the same cold start. */
export function openBenchmarkPage(ctx: BenchmarkPageContext): void {
  /** The run under way: a stop, or a new run, leaves the old one behind. */
  let run = 0;
  const fly = async () => {
    const mine = ++run;
    const reports: BenchReport[] = [];
    delete document.body.dataset['benchmark'];
    for (const [i, id] of ctx.maps.entries()) {
      page.flying(ctx.map(id).name, i, ctx.maps.length);
      page.progress(-1, 0, i, ctx.maps.length);
      const game = await ctx.show(id);
      if (mine !== run) return;
      const report = await new Promise<BenchReport>((done) => {
        ctx.fly(startBenchmarkOn(game, ctx.renderer, ctx.map(id), { backend: ctx.backend, adapter: ctx.adapter, quiet: true, done, progress: (f, rate) => page.progress(f, rate, i, ctx.maps.length) }));
      });
      if (mine !== run) return;
      ctx.fly(null);
      reports.push(report);
    }
    ctx.fly(null);
    page.done(
      reports.map((r) => ({ map: ctx.nameOf(r.map), meanMs: r.meanMs, low1Ms: r.low1Ms })),
      benchLine(ctx.version, reports, (id) => ctx.nameOf(id)),
    );
    // For a script: the reports, and the mark `npm run bench` waits for.
    Object.assign(globalThis, { duty: { ...((globalThis as { duty?: object }).duty ?? {}), benchmark: reports } });
    document.body.dataset['benchmark'] = 'done';
  };
  const page = new BenchmarkPage(
    document.body,
    {
      run: () => void fly(),
      stop: () => {
        run++;
        ctx.fly(null);
        page.done(null, '', 'Stopped before the last map: nothing was kept.');
      },
    },
    { home: location.pathname },
  );
  page.ready({
    backend: ctx.backend,
    adapter: ctx.adapter,
    resolution: [Math.round(innerWidth * devicePixelRatio), Math.round(innerHeight * devicePixelRatio)],
    maps: ctx.maps.map((id) => ctx.nameOf(id)),
    seconds: ctx.maps.reduce((sum, id) => sum + new Benchmark(ctx.map(id).benchmarkPath).seconds, 0),
  });
  if (ctx.runNow) void fly();
}
