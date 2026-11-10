// Ticket 35: the plant meshes of a map mid-flight: how many, how full, which share a material.
//   node .scratch/next-level/one-picture/plants.mjs [map]
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
    const real = r._renderObjectDirect;
    let seen = 0; r._renderObjectDirect = function (object) { if (!(object.parent && object.parent.name === "plants") && seen++ < 400) return real.apply(this, arguments); let o = object; while (o.parent) o = o.parent; r._renderObjectDirect = real; let root = null; (function find(x) { if (x.name === 'plants') root = x; else for (const c of x.children) find(c); })(o); done(report(root)); return real.apply(this, arguments); };
  function report(root) {
    if (!root) return 'no plants root';
    const mats = new Map();
    const built = root.children.find((m) => m.name === 'built'); const cells = built ? built.children.filter((m) => m.visible).length + ' of ' + built.children.length : 'none'; const rows = root.children.filter((m) => m.isInstancedMesh).map((m) => { mats.set(m.material.uuid, (mats.get(m.material.uuid) ?? 0) + 1); return [m.visible ? m.count : 0, m.instanceMatrix.count, m.castShadow, m.geometry.index.count / 3, m.material.uuid.slice(0, 4)].join(' '); });
    return JSON.stringify({ cells, meshes: root.children.length, visible: root.children.filter((m) => m.visible).length, materials: [...mats.values()], rows }, null, 0);
  }
  })`);
  console.log(out);
} finally {
  await chrome.close();
}
