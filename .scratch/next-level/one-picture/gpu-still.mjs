// Ticket 35: GPU time of each render pass at a reference spot (camera still), from the renderer's
// timestamp queries (`?stats` turns them on).
//   node .scratch/next-level/one-picture/gpu-still.mjs [map] [spot] [dpr] [label]
// dpr 2 at 1920x1080 draws 3840x2160: the pixel-bound passes stand out as they would on a weak GPU.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'survival-town';
const spot = process.argv[3] ?? '';
const dpr = Number(process.argv[4] ?? 2);
const label = process.argv[5] ?? '';
// What to change before measuring: `flat` draws every object of the world with one plain material
// (the world pass then costs its geometry and rasterising alone); `noplants`, `noground` hide those;
// `nolights` hides the point lights (the flashes', dark until something fires).
const mode = process.argv[6] ?? '';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  if (dpr !== 1) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=${map}&spot=${encodeURIComponent(spot)}&stats&hz=1000`, BASE).toString());
  if (!(await chrome.waitFor('globalThis.duty?.game', 180_000))) throw new Error('no game');
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(8000);
  if (mode) {
    const changed = await chrome.evaluate(`new Promise((done) => {
      const r = duty.renderer;
      const real = r._renderObjectDirect;
      r._renderObjectDirect = function (object) {
        let o = object; while (o.parent) o = o.parent;
        if (!o.isScene || o.children.length < 10) return real.apply(this, arguments);
        r._renderObjectDirect = real;
        (async () => {
          const three = await import('/node_modules/.vite/deps/three_webgpu.js');
          if ('${mode}' === 'flat') o.overrideMaterial = new three.MeshBasicNodeMaterial({ color: 0x808080 });
          if ('${mode}'.startsWith('flat:')) {
            const kind = '${mode}'.slice(5);
            const flat = new three.MeshBasicNodeMaterial({ color: 0x808080 });
            o.traverse((x) => { if (x.isMesh && x.material && !Array.isArray(x.material) && x.material.constructor.name === kind) x.material = flat; });
          }
          if ('${mode}' === 'noplants' && o.getObjectByName('plants')) o.getObjectByName('plants').visible = false;
          if ('${mode}' === 'nolights') o.traverse((x) => { if (x.isPointLight) x.visible = false; });
          if ('${mode}' === 'noground') o.traverse((x) => { if (x.name === 'ground') x.visible = false; });
          done('${mode} on');
        })().catch((e) => done('failed ' + e));
        return real.apply(this, arguments);
      };
    })`);
    console.log(changed);
    await sleep(3000);
  }
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
    }, 10000);
  })`);
  console.log(label, map, spot, out);
} finally {
  await chrome.close();
}
