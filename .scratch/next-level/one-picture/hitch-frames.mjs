// Ticket 35: the long frames of a benchmark flight and what was in them. Times three's node builds (a
// material's shader for a new kind of object), render pipeline and shader module creation, and buffer
// creation in each frame; prints every frame over `min` ms with those shares, and the totals.
//   node .scratch/next-level/one-picture/hitch-frames.mjs [map] [cpu rate] [min ms] [seconds]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'zero-island';
const rate = Number(process.argv[3] ?? 4);
const min = Number(process.argv[4] ?? 150);
const seconds = Number(process.argv[5] ?? 40);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  await sleep(1000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const b = r.backend;
    const cur = { build: 0, builds: 0, pipeline: 0, pipelines: 0, program: 0, buffer: 0, buffers: 0, geometry: 0 };
    const time = (obj, key, field, count) => {
      const real = obj[key];
      if (typeof real !== 'function') return;
      obj[key] = function () { const t = performance.now(); try { return real.apply(this, arguments); } finally { cur[field] += performance.now() - t; if (count) cur[count]++; } };
    };
    const realCreate = b.createNodeBuilder.bind(b);
    b.createNodeBuilder = function () { const nb = realCreate(...arguments); time(nb, 'build', 'build', 'builds'); return nb; };
    time(b, 'createRenderPipeline', 'pipeline', 'pipelines');
    time(b, 'createProgram', 'program');
    time(b, 'createAttribute', 'buffer', 'buffers');
    time(b, 'createIndexAttribute', 'buffer', 'buffers');
    time(b, 'updateAttribute', 'geometry');
    const frames = [];
    let last = performance.now();
    const end = last + ${seconds * 1000};
    const tick = () => {
      const now = performance.now();
      frames.push({ ms: now - last, ...cur });
      for (const k in cur) cur[k] = 0;
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else {
        const long = frames.filter((f) => f.ms > ${min});
        const sum = (list, k) => list.reduce((a, f) => a + f[k], 0);
        const keys = ['ms', 'build', 'pipeline', 'program', 'buffer', 'geometry'];
        const row = (f) => keys.map((k) => k + ' ' + f[k].toFixed(0)).join('  ') + '  builds ' + f.builds + ' pipelines ' + f.pipelines + ' buffers ' + f.buffers;
        done(JSON.stringify({
          frames: frames.length,
          long: long.length,
          longTotals: Object.fromEntries(keys.map((k) => [k, Math.round(sum(long, k))])),
          allTotals: Object.fromEntries(keys.map((k) => [k, Math.round(sum(frames, k))])),
          worst: long.sort((a, b) => b.ms - a.ms).slice(0, 25).map(row),
        }, null, 1));
      }
    };
    requestAnimationFrame(tick);
  })`);
  console.log(out);
} finally {
  await chrome.close();
}
