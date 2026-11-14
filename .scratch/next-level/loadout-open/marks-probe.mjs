// The Loadout's first open on a fresh page, WAIT ms after the game starts, with the page's performance marks (T: the
// stage, G: the match's preparation, M: the menu's gate) printed relative to the click. Needs temporary marks in the code.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const WAIT = Number(process.env.WAIT ?? 4000);
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { globalThis.__pipes = []; const P = GPUDevice.prototype; const rp = P.createRenderPipelineAsync; P.createRenderPipelineAsync = function (d) { const t = performance.now(); const p = rp.call(this, d); const rec = [this.label || '?', t, 0, (d.vertex?.module?.label || '') ]; __pipes.push(rec); p.then(() => (rec[2] = performance.now())); return p; }; const sm = P.createShaderModule; let n = 0; P.createShaderModule = function (d) { __shaders = (globalThis.__shaders || 0) + 1; globalThis.__shaders = __shaders; return sm.call(this, d); }; const rd = GPUAdapter.prototype.requestDevice; let k = 0; GPUAdapter.prototype.requestDevice = async function (o) { const d = await rd.call(this, o); d.label = 'dev' + (k++); return d; }; })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(WAIT);
  await chrome.evaluate(`(() => { performance.mark('click'); const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith('LOADOUT')); b.click(); })()`);
  await chrome.waitFor(`!!document.querySelector('.ds-stage')?.dataset.drawn`, 45_000);
  await sleep(6000);
  const marks = JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const m = performance.getEntriesByType('mark'); const c = m.find((x) => x.name === 'click').startTime; return m.map((x) => [x.name, Math.round(x.startTime - c)]); })())`));
  const pipes = JSON.parse(await chrome.evaluate(`JSON.stringify((() => { const c = performance.getEntriesByType('mark').find((x) => x.name === 'click').startTime; return __pipes.map(([d, a, b]) => [d, Math.round(a - c), Math.round(b - c)]); })())`));
  const byDev = {};
  for (const [d, a, b] of pipes) (byDev[d] ??= []).push([a, b]);
  for (const [d, list] of Object.entries(byDev)) {
    const after = list.filter(([a]) => a > 0);
    console.log(d, 'pipelines', list.length, 'after click', after.length, 'first', after[0], 'last', after.at(-1), 'longest', Math.max(0, ...after.map(([a, b]) => b - a)));
  }
  console.log(marks.map(([n, t]) => `${n} ${t}`).join('\n'));
} finally {
  await chrome.close();
}
