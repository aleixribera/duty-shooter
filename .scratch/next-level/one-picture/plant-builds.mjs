// Ticket 35: shaders a map's warm-up left unbuilt. Walks a map alone, waits for the game's warm-up and a few
// quiet seconds, then puts every plant mesh on show (culling off, at least one plant) for a few frames and
// counts the shader builds three makes for them: each would otherwise be a hitch the first time that kind
// of plant comes into view.
//   node .scratch/next-level/one-picture/plant-builds.mjs [map] [x,z,yaw]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const map = process.argv[2] ?? 'zero-island';
const at = process.argv[3] ? `&at=${process.argv[3]}` : '';
// WHAT=all: every mesh of the world, not only the plants.
const everything = process.env.WHAT === 'all';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const EARLY = `(() => {
  const log = (globalThis.__early = []);
  const ids = new Map();
  const name = (o) => { let x = o; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) return x.name; return o.type; };
  const tryHook = () => {
    const nodes = globalThis.duty?.renderer?._nodes;
    if (!nodes) return setTimeout(tryHook, 20);
    const real = nodes._createNodeBuilder;
    nodes._createNodeBuilder = function (ro) {
      if (name(ro.object) === 'plants' || ro.camera.isOrthographicCamera) { const g = duty.game; if (!ids.has(g)) ids.set(g, ids.size + 1); log.push('t' + Math.round(performance.now() / 1000) + ' game' + ids.get(g) + ' ' + name(ro.object) + (ro.camera.isOrthographicCamera ? ' ortho ' : ' ') + 'ctx ' + ro.context.id + (g?.warming ? ' warming' : '') + (g?.drawing ? '' : ' holding')); }
      return real.apply(this, arguments);
    };
  };
  tryHook();
})()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  await chrome.navigate(new URL(`?explore=${map}${at}&nolock`, BASE).toString());
  await chrome.waitFor('globalThis.duty?.game', 180_000);
  await chrome.waitFor('duty.game?.driver && duty.game.drawing && !duty.game.warming', 180_000, 500);
  await sleep(10_000);
  console.log('early', JSON.stringify(Object.entries((await chrome.evaluate('__early')).reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}))));
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const nodes = r._nodes;
    const realDirect = r._renderObjectDirect;
    const scenes = new Set();
    r._renderObjectDirect = function (object, material, s) { scenes.add(s); return realDirect.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      r._renderObjectDirect = realDirect;
      // Every scene but the first-person one (its unequipped attachments never show in a match).
      const plants = ${everything} ? { traverse: (f) => { for (const sc of scenes) if (!sc.getObjectByName('viewmodel') && !sc.getObjectByName('stock')) sc.traverse(f); } } : [...scenes].map((s) => s.getObjectByName('plants')).find(Boolean);
      if (!plants) return done({ error: 'no plants' });
      const builds = [];
      const real = nodes._createNodeBuilder;
      nodes._createNodeBuilder = function (renderObject) {
        const b = real.apply(this, arguments);
        const build = b.build;
        b.build = function () { const t = performance.now(); const x = build.apply(this, arguments); const nm = (o) => { let x = o; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) return x.name; return o.type; }; builds.push({ who: nm(renderObject.object), uuid: renderObject.object.uuid, ms: performance.now() - t, pass: (renderObject.camera.isOrthographicCamera ? 'shadow ' : '') + 'ctx ' + renderObject.context.id + ' ' + nm(renderObject.object) + ' ' + renderObject.material.type, vis: restore.length }); return x; };
        return b;
      };
      const restore = [];
      let meshes = 0;
      let shownBefore = 0;
      let countZero = 0;
      plants.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const { visible, frustumCulled, count } = o;
        if (visible) shownBefore++;
        if (count === 0) countZero++;
        restore.push(() => { o.visible = visible; o.frustumCulled = frustumCulled; o.count = count; });
        o.visible = true; o.frustumCulled = false; if (o.isInstancedMesh) o.count = Math.max(1, count);
      });
      let frames = 0;
      const tick = () => {
        if (++frames < 4) return requestAnimationFrame(tick);
        for (const put of restore) put();
        nodes._createNodeBuilder = real;
        done({ meshes, builds: builds.length, meshesBuilt: new Set(builds.map((b) => b.uuid)).size, ms: builds.reduce((a, b) => a + b.ms, 0).toFixed(0), passes: Object.entries(builds.reduce((m, b) => ((m[b.pass] = (m[b.pass] ?? 0) + 1), m), {})), shown: shownBefore, countZero });
      };
      requestAnimationFrame(tick);
    }));
  })`);
  console.log(map, process.argv[3] ?? '', JSON.stringify(out));
} finally {
  await chrome.close();
}
