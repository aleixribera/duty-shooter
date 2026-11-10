// Ticket 35: GPU time of each render pass over a benchmark flight, from the renderer's timestamp queries.
//   node .scratch/next-level/one-picture/gpu.mjs [map] [dpr]
// dpr 2 at 1920x1080 draws 3840x2160: the pixel-bound passes stand out as they would on a weak GPU.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'survival-town';
const dpr = Number(process.argv[3] ?? 1);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  if (dpr !== 1) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  await sleep(3000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const backend = r.backend;
    const names = new Map();
    const realBegin = backend.beginRender;
    backend.beginRender = function (ctx) {
      const t = ctx.renderTarget;
      const name = t ? (t.texture?.name || 'rt') + ' ' + t.width + 'x' + t.height + (t.samples > 1 ? ' x' + t.samples : '') + ' objs' : 'screen';
      const out = realBegin.apply(this, arguments);
      const uid = backend.get(ctx).timestampUID;
      if (uid) names.set(uid.split(':f')[0], name);
      return out;
    };
    const sums = new Map();
    let reads = 0;
    const pool = backend.timestampQueryPool.render;
    const realResolve = pool._resolveQueries.bind(pool);
    pool._resolveQueries = async function () {
      const total = await realResolve();
      const perFrame = new Map();
      for (const [uid, ms] of pool.timestamps) {
        const [, id, frame] = uid.match(/^(.*):f(\\d+)$/);
        const key = names.get(id) ?? ('ctx ' + id);
        sums.set(key, (sums.get(key) ?? 0) + ms);
      }
      reads += (pool.frames?.length ?? 1);
      return total;
    };
    setTimeout(() => {
      backend.beginRender = realBegin;
      const rows = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([k, ms]) => (ms / reads).toFixed(3).padStart(7) + ' ms  ' + k);
      const all = [...sums.values()].reduce((a, b) => a + b, 0) / reads;
      done(JSON.stringify({ canvas: [r.domElement.width, r.domElement.height], frames: reads, totalMs: all.toFixed(3), rows }, null, 1));
    }, 12000);
  })`);
  console.log(out);
} finally {
  await chrome.close();
}
