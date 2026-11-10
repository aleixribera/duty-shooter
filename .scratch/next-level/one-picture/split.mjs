// Ticket 35: the world pass's GPU time with each top-level part of the scene hidden in turn, at 4K.
//   node .scratch/next-level/one-picture/split.mjs [map]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const map = process.argv[2] ?? 'survival-town';
const spot = process.argv[3] ?? '';
const dpr = Number(process.argv[4] ?? 3);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?bench&map=${map}`, BASE).toString());
  if (!(await chrome.waitFor(`[...document.querySelectorAll('pre')].some((p) => / fps$/.test(p.textContent))`, 600_000, 500))) throw new Error('the flight did not start');
  await sleep(2000);
  const raw = await chrome.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => { try {
    const r = duty.renderer;
    const backend = r.backend;
    const pool = backend.timestampQueryPool.render;
    const world = new Set();
    const realBegin = backend.beginRender;
    backend.beginRender = function (ctx) {
      const o = realBegin.apply(this, arguments);
      const t = ctx.renderTarget;
      if (t && t.texture?.name === 'output' && t.width === r.domElement.width) world.add(backend.get(ctx).timestampUID?.split(':f')[0]);
      return o;
    };
    let sum = 0, n = 0;
    const realResolve = pool._resolveQueries.bind(pool);
    pool._resolveQueries = async function () {
      const total = await realResolve();
      let got = false;
      for (const [uid, ms] of pool.timestamps) if (world.has(uid.split(':f')[0])) { sum += ms; got = true; }
      if (got) n += pool.frames?.length ?? 1;
      return total;
    };
    const measure = async () => { sum = 0; n = 0; await new Promise((d) => setTimeout(d, 900)); return n ? sum / n : NaN; };
    let scene = null;
    const realObj = r._renderObjectDirect;
    r._renderObjectDirect = function (object, material, sc) { if (sc?.isScene && (!scene || sc.children.length > scene.children.length)) scene = sc; return realObj.apply(this, arguments); };
    await new Promise((d) => setTimeout(d, 300));
    r._renderObjectDirect = realObj;
    // Hold the camera where the flight is now: the bench's later views are dropped.
    const g = duty.game;
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g), 'overview');
    const named = duty.map?.referenceSpots?.find((x) => x.name === ${JSON.stringify(spot)});
    const held = named ? { position: named.position, yaw: named.yaw, pitch: named.pitch } : g.overview;
    Object.defineProperty(g, 'overview', { configurable: true, get: () => held, set: () => {} });
    const count = (c) => { let k = 0; c.traverse(() => k++); return k; };
    const map = scene.children.reduce((a, b) => (count(b) > count(a) ? b : a));
    const parts = [...scene.children.filter((c) => c !== map), ...map.children].map((c, i) => ({ c, label: (map.children.includes(c) ? 'map/' : '') + (c.name || c.type) + '#' + i + '(' + count(c) + ')' }));
    const rows = [];
    const what = (c) => { const m = []; c.traverse((o) => { if (o.material) m.push((o.name || '') + ':' + (o.material.name || o.material.type) + ':' + (o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) + (o.isInstancedMesh ? 'x' + o.count : '')); }); return m.slice(0, 3).join(' ') + (m.length > 3 ? ' +' + (m.length - 3) : ''); };
    await measure();
    rows.push(['spot', named ? named.name : 'flight', 'all x3', (await measure()).toFixed(2), (await measure()).toFixed(2), (await measure()).toFixed(2)]);
    for (const { c, label } of parts) {
      if (!c.visible) continue;
      const a1 = await measure();
      c.visible = false;
      await measure();
      const off = await measure();
      c.visible = true;
      await measure();
      const a2 = await measure();
      const save = (a1 + a2) / 2 - off;
      if (Math.abs(save) > 0.12) rows.push([label, 'saves ' + save.toFixed(2) + ' of ' + ((a1 + a2) / 2).toFixed(2), what(c)]);
    }
    rows.push(['all again', (await measure()).toFixed(3)]);
    return JSON.stringify(rows);
  } catch (e) { return 'ERR ' + e.stack; } })()` });
  const out = raw.result?.result?.value ?? JSON.stringify(raw).slice(0, 1500);
  console.log(out.replace(/\],\[/g, ']\n['));
} finally {
  await chrome.close();
}
