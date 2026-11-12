// Ticket 35: one frame's draw calls at a spot, by pass (the render target drawn into) and by what is drawn
// (the object's name, or its parent's, and its material's type).
//   node .scratch/next-level/one-picture/draws.mjs <map> <spot>
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.env.BASE ?? 'http://localhost:5191/';
const [map, spot] = process.argv.slice(2);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=${map}&spot=${encodeURIComponent(spot)}`, BASE).toString());
  await chrome.waitFor('globalThis.duty?.game', 180_000);
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(8000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const real = r._renderObjectDirect;
    const passes = new Map();
    let frames = 0;
    const name = (o) => { let x = o; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) return x.name; return o.type; };
    r._renderObjectDirect = function (object, material, scene, camera) {
      const target = r.getRenderTarget();
      const pass = (camera.isOrthographicCamera ? 'shadow ' : '') + (target ? target.width + 'x' + target.height + (target.textures?.length > 1 ? ' mrt' + target.textures.length : '') : 'screen');
      const p = passes.get(pass) ?? new Map(); passes.set(pass, p);
      const k = name(object) + ' / ' + material.type + (object.isInstancedMesh ? ' inst' : '');
      p.set(k, (p.get(k) ?? 0) + 1);
      return real.apply(this, arguments);
    };
    const tick = () => { if (++frames < 3) return requestAnimationFrame(tick); r._renderObjectDirect = real;
      const res = {}; for (const [pass, m] of passes) { const total = [...m.values()].reduce((a, b) => a + b, 0) / 2; res[pass + ' (' + total + ')'] = [...m].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => (n / 2) + ' ' + k); }
      done(res); };
    requestAnimationFrame(() => { passes.clear(); requestAnimationFrame(tick); });
  })`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await chrome.close();
}
