// Ticket 35: the shader builds three makes during a benchmark flight (new render-object cache keys), by
// object and material, with the time each took.
//   node .scratch/next-level/one-picture/builds.mjs [map] [seconds] [rate]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'zero-island';
const seconds = Number(process.argv[3] ?? 15);
const rate = Number(process.argv[4] ?? 1);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const HOOK = `(() => {
  const log = (globalThis.__builds = []);
  globalThis.__phase = 'load';
  const name = (o) => { let x = o; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) return x.name; return o.type; };
  const tryHook = () => {
    const nodes = globalThis.duty?.renderer?._nodes;
    if (!nodes) return setTimeout(tryHook, 20);
    const real = nodes._createNodeBuilder;
    nodes._createNodeBuilder = function (renderObject, material) {
      const b = real.apply(this, arguments);
      const build = b.build;
      b.build = function () {
        const t = performance.now();
        const r = build.apply(this, arguments);
        const o = renderObject.object;
        log.push({ phase: globalThis.__phase, uuid: o.uuid, ctx: renderObject.context.id, key: renderObject.initialCacheKey, recv: o.receiveShadow, what: name(o) + ' / ' + material.type + (o.isInstancedMesh ? ' inst' : ''), ms: performance.now() - t });
        return r;
      };
      return b;
    };
  };
  tryHook();
})()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  await sleep(3000);
  await chrome.evaluate(`globalThis.__phase = 'flight'`);
  await sleep(seconds * 1000);
  const out = await chrome.evaluate(`(() => {
    const by = new Map();
    const flight = __builds.filter((b) => b.phase === 'flight');
    const loaded = __builds.filter((b) => b.phase === 'load');
    const seen = (b) => loaded.filter((l) => l.uuid === b.uuid).map((l) => 'ctx ' + l.ctx + ' key ' + l.key + ' recv ' + l.recv).join('; ');
    const detail = flight.filter((b) => b.what.startsWith('plants')).slice(0, 4).map((b) => 'flight ctx ' + b.ctx + ' key ' + b.key + ' recv ' + b.recv + ' | at load: ' + (seen(b) || 'never'));
    const ctxLoad = [...new Set(loaded.map((b) => b.ctx))].join(',');
    for (const b of flight) { const e = by.get(b.what) ?? { n: 0, ms: 0 }; e.n++; e.ms += b.ms; by.set(b.what, e); }
    const total = flight.reduce((a, b) => a + b.ms, 0);
    return { loadBuilds: loaded.length, loadPlants: loaded.filter((b) => b.what.startsWith('plants')).length, ctxLoad, detail, builds: flight.length, ms: total.toFixed(0), by: [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 20).map(([k, e]) => e.n + ' builds ' + e.ms.toFixed(0) + ' ms  ' + k) };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await chrome.close();
}
