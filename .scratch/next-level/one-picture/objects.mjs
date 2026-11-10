// Ticket 35: what the renderer draws in one frame of a benchmark flight, object by object, grouped by
// pass (render target) and by what the object is (its name, or its parent's, and its type).
//   node .scratch/next-level/one-picture/objects.mjs [map]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'zero-island';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  await sleep(4000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const counts = new Map();
    let frames = 0;
    let objects = 0;
    const real = r._renderObjectDirect;
    r._renderObjectDirect = function (object, material, scene, camera, lightsNode, group, clippingContext, passId) {
      const target = this._renderTarget;
      const pass = this._currentRenderContext?.depth !== undefined ? '' : '';
      const where = target ? (target.texture?.name || (target.isRenderTarget ? 'rt' + target.width + 'x' + target.height : '?')) : 'screen';
      const shadow = scene && scene.isScene !== true;
      let who = object.name || '';
      for (let p = object.parent; !who && p; p = p.parent) who = p.name ? p.name + '/' : '';
      const key = (this._currentShadow ? 'SHADOW ' : '') + where + ' | ' + (who || '?') + ' ' + object.type + (object.isInstancedMesh ? '[' + object.count + ']' : '') + ' | ' + (material.name || material.type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      objects++;
      return real.apply(this, arguments);
    };
    const start = performance.now();
    const tick = () => {
      frames++;
      if (frames < 30) return requestAnimationFrame(tick);
      r._renderObjectDirect = real;
      const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n / frames).toFixed(1).padStart(6) + '  ' + k);
      done(JSON.stringify({ perFrame: objects / frames, rows: rows.slice(0, 80) }, null, 1));
    };
    requestAnimationFrame(tick);
  })`);
  console.log(out);
} finally {
  await chrome.close();
}
