// Ticket 99: what one frame of a map's `?bench` flight renders: renderer.render calls by target and camera, and
// renderObject calls by pass, averaged over 60 frames.   node .scratch/next-level/toaster/passes.mjs [map,map]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const maps = (process.argv[2] ?? 'range,survival-town').split(',');
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const PROBE = `(async () => {
  const r = duty.renderer;
  const renders = {}, objects = {}, ms = {};
  const realRender = r.render, realObject = r.renderObject;
  let target = 'canvas';
  r.render = function (scene, camera) {
    const prev = target;
    target = (this.getRenderTarget()?.texture?.name || this.getRenderTarget()?.name || (this.getRenderTarget() ? 'rt' : 'canvas')) + ' / ' + (camera.name || camera.type) + ' / ' + (scene.name || scene.type);
    renders[target] = (renders[target] ?? 0) + 1;
    const t = performance.now();
    const out = realRender.apply(this, arguments);
    ms[target] = (ms[target] ?? 0) + performance.now() - t;
    target = prev;
    return out;
  };
  const per = (globalThis.__per = {});
  r.renderObject = function (object) { objects[target] = (objects[target] ?? 0) + 1; const t = performance.now(); const out = realObject.apply(this, arguments); if (target.startsWith('ShadowMap')) { const k = (object.name || object.parent?.name || object.type) + (object.count !== undefined ? ' x' + object.count : ''); per[k] = (per[k] ?? 0) + performance.now() - t; } return out; };
  await new Promise((done) => { let n = 0; const f = () => (++n >= 60 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  r.render = realRender; r.renderObject = realObject;
  const out = {};
  for (const k of Object.keys(renders)) out[k] = { calls: renders[k] / 60, objects: (objects[k] ?? 0) / 60, msIncl: +(ms[k] / 60).toFixed(2) };
  out.__perShadowObject = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +(v / 60).toFixed(3)])); return JSON.stringify(out);
})()`;

for (const map of maps) {
  const chrome = await launchChrome({ uncapped: true });
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
    if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('no flight');
    await sleep(4000);
    const res = JSON.parse(await chrome.evaluate(PROBE, { awaitPromise: true }));
    console.log(map);
    console.log('  shadow per object (ms per frame):', JSON.stringify(res.__perShadowObject)); delete res.__perShadowObject;
    for (const [k, v] of Object.entries(res).sort((a, b) => b[1].objects - a[1].objects)) console.log(`  ${String(v.calls).padStart(5)} calls ${String(Math.round(v.objects)).padStart(6)} objects ${String(v.msIncl).padStart(6)} ms  ${k}`);
  } finally {
    await chrome.close();
  }
}
