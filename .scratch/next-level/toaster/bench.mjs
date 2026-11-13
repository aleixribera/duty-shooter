// PLAN item 4 (ticket 99): the benchmark page (`?benchmark`, what a player runs from Settings > Video, warm-up and
// all) on a stand-in toaster, one map per page.
//   node .scratch/next-level/toaster/bench.mjs <out-label> [rate=4] [maps=all]
// Uncapped (frame times are what it measures) with the page's processor slowed `rate` times once the map is up,
// at the window's own 1920x1080. This PC's GPU is far faster than an integrated one, so the GPU time per frame
// (`gpu p50`) is logged beside the frame time: read it against the toaster's GPU separately.
// Writes <label>.json beside this file: { map: { meanMs, low1Ms, p50, gpuP50, draws, loadMs } }.
import { writeFileSync } from 'node:fs';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const label = process.argv[2] ?? 'run';
const rate = Number(process.argv[3] ?? 4);
const maps = (process.argv[4] ?? 'survival-town,switchyard,station-nine,range,zero-island').split(',');
const HERE = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const out = {};
for (const map of maps) {
  const chrome = await launchChrome({ uncapped: true });
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    const t0 = Date.now();
    await chrome.navigate(new URL(`?benchmark&run&maps=${map}`, BASE).toString());
    if (!(await chrome.waitFor(`/ fps$/.test(document.querySelector('[data-progress]')?.textContent ?? '')`, 600_000, 500))) throw new Error(`${map}: the flight did not start`);
    const loadMs = Date.now() - t0;
    if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
    const report = await chrome.waitFor("document.body.dataset.benchmark === 'done' ? JSON.stringify(globalThis.duty?.benchmark?.[0]) : null", 20 * 60_000, 2000);
    if (!report) throw new Error(`${map}: no report`);
    const r = JSON.parse(report);
    out[map] = { meanMs: +r.meanMs.toFixed(2), low1Ms: +r.low1Ms.toFixed(2), meanFps: +(1000 / r.meanMs).toFixed(1), low1Fps: +(1000 / r.low1Ms).toFixed(1), p50: r.frameMs?.p50, gpuP50: r.gpuMs?.p50, draws: r.drawCalls?.mean, loadMs, errors: chrome.errors?.slice?.(0, 3) };
    console.log(`${map} x${rate}: mean ${r.meanMs.toFixed(1)} ms (${(1000 / r.meanMs).toFixed(0)} fps), 1% low ${r.low1Ms.toFixed(1)} ms (${(1000 / r.low1Ms).toFixed(0)} fps), gpu p50 ${r.gpuMs?.p50?.toFixed?.(2)}, load ${(loadMs / 1000).toFixed(1)} s`);
  } catch (e) {
    out[map] = { failed: String(e.message ?? e) };
    console.log(`${map}: ${e.message ?? e}`);
  } finally {
    await chrome.close();
  }
  writeFileSync(`${HERE}${label}.json`, JSON.stringify({ rate, at: new Date().toISOString(), maps: out }, null, 1));
}
