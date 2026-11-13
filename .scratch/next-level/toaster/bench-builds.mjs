// Ticket 99: shaders three builds during a map's flight on the benchmark page (each one a hitch the 1% low counts), and the
// frames over 28 ms, with the second of the flight each happened.   node .scratch/next-level/toaster/bench-builds.mjs [map,map] [rate=4]
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const maps = (process.argv[2] ?? 'range,station-nine').split(',');
const rate = Number(process.argv[3] ?? 4);
// DEV=1 flies the dev `?bench` flight instead of the benchmark page.
const DEV = !!process.env.DEV;
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const HOOK = `(() => {
  const log = (globalThis.__log = []);
  globalThis.__t0 = null;
  const at = () => +((performance.now() - globalThis.__t0) / 1000).toFixed(2);
  const name = (o) => { let x = o; const parts = []; for (let i = 0; i < 3 && x; i++, x = x.parent) if (x.name) parts.push(x.name); return parts.join('<') || o.type; };
  let last = performance.now();
  const tick = (t) => { const dt = t - last; last = t; if (dt > (globalThis.__long ?? 28) && globalThis.__t0 !== null) log.push({ at: at(), frame: Math.round(dt) }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const tryHook = () => {
    const nodes = globalThis.duty?.renderer?._nodes;
    if (!nodes) return setTimeout(tryHook, 20);
    const real = nodes._createNodeBuilder;
    nodes._createNodeBuilder = function (ro, material) {
      const b = real.apply(this, arguments);
      const build = b.build;
      b.build = function () {
        const t = performance.now();
        const r = build.apply(this, arguments);
        if (globalThis.__t0 !== null) log.push({ at: at(), build: name(ro.object) + ' / ' + material.type + (ro.camera.isOrthographicCamera ? ' (ortho)' : ''), ms: +(performance.now() - t).toFixed(1) });
        return r;
      };
      return b;
    };
  };
  tryHook();
})()`;
for (const map of maps) {
  const chrome = await launchChrome({ uncapped: true });
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await chrome.navigate(new URL(DEV ? `?bench&map=${map}` : `?benchmark&run&maps=${map}`, BASE).toString());
    if (!(await chrome.waitFor(DEV ? `[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))` : `/ fps$/.test(document.querySelector('[data-progress]')?.textContent ?? '')`, 600_000, 100))) throw new Error('no flight');
    await chrome.evaluate(`globalThis.__t0 = performance.now(); globalThis.__long = ${Number(process.env.LONG ?? 28)}`);
    if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
    const report = JSON.parse(await chrome.waitFor("document.body.dataset.benchmark === 'done' ? JSON.stringify([globalThis.duty?.benchmark].flat()[0]) : null", 20 * 60_000, 1000));
    const log = JSON.parse(await chrome.evaluate('JSON.stringify(globalThis.__log)'));
    const builds = log.filter((e) => e.build);
    console.log(`${map} x${rate}: mean ${report.meanMs.toFixed(1)} ms, 1% low ${report.low1Ms.toFixed(1)} ms; ${builds.length} builds, ${builds.reduce((s, b) => s + b.ms, 0).toFixed(0)} ms`);
    console.log('  long frames:', log.filter((e) => e.frame).map((e) => `${e.at}s ${e.frame}`).join(', '));
    for (const b of builds.slice(0, 25)) console.log(`  ${b.at}s ${b.ms} ms ${b.build}`);
  } finally {
    await chrome.close();
  }
}
