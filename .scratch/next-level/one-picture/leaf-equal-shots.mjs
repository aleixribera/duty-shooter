// Ticket 35: Mutant Jungle's leaves with and without the equal-depth prepass, screenshots of each in one page.
// Needs the temporary `globalThis.__leafDepthMat` hook in plants-view.ts (see ticket 35, phase 2e); held, not shipped.
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.env.BASE ?? 'http://localhost:5191/';
const spot = process.argv[2] ?? 'Mutant Jungle';
const out = process.argv[3] ?? '.';
const dpr = Number(process.argv[4] ?? 1);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=zero-island&spot=${encodeURIComponent(spot)}`, BASE).toString());
  await chrome.waitFor('globalThis.duty?.game', 180_000);
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(9000);
  await chrome.evaluate(`import('/node_modules/.vite/deps/three_webgpu.js').then((t) => { globalThis.__Basic = t.MeshBasicNodeMaterial; return 1; })`);
  const shot = async (name) => { const r = await chrome.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}`, Buffer.from(r.result.data, 'base64')); };
  await shot(`leq-${spot}-off.png`);
  console.log(await chrome.evaluate(`(async () => { const r = duty.renderer; const world = await new Promise((done) => { const real = r._renderObjectDirect; r._renderObjectDirect = function (object) { let o = object; while (o.parent) o = o.parent; if (o.isScene && o.children.length >= 10) { r._renderObjectDirect = real; done(o); } return real.apply(this, arguments); }; }); const v = true;
      if (true) {
        if (!globalThis.__leafEq) {
          globalThis.__leafEq = [];
          const leaves = []; world.getObjectByName('plants')?.traverse((x) => { if (x.isInstancedMesh && x.material?.alphaTest > 0) leaves.push(x); });
          const mats = new Map();
          for (const x of leaves) {
            let d = mats.get(x.material);
            if (!d) { d = globalThis.__leafDepthMat(); mats.set(x.material, d); }
            const t = new x.constructor(x.geometry, d, x.instanceMatrix.count);
            t.instanceMatrix = x.instanceMatrix;
            t.renderOrder = -1; t.frustumCulled = false; t.castShadow = false; t.receiveShadow = false;
            x.parent.add(t);
            globalThis.__leafEq.push([x, t]);
          }
          globalThis.__leafEqMats = [...mats.keys()];
          console.log('leaf twins', leaves.length, mats.size);
          const sync = () => { for (const [x, t] of globalThis.__leafEq) { t.count = x.count; t.visible = x.visible && globalThis.__leafEqOn; } requestAnimationFrame(sync); };
          sync();
        }
        globalThis.__leafEqOn = v;
        for (const m of globalThis.__leafEqMats) { m.alphaTest = v ? 0 : 0.5; m.depthFunc = v ? 4 : 3; m.depthWrite = !v; m.needsUpdate = true; }
      }
    return 'on'; })()`));
  await sleep(4000);
  console.log('state', await chrome.evaluate(`JSON.stringify({ twins: globalThis.__leafEq?.length, shown: globalThis.__leafEq?.filter(([x, t]) => t.visible).length, mats: globalThis.__leafEqMats?.map((m) => [m.alphaTest, m.depthFunc, m.depthWrite]) })`));
  await shot(`leq-${spot}-on.png`);
  console.log('errors', chrome.errors.slice(0, 5));
} finally {
  await chrome.close();
}
