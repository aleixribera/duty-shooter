// Ticket 35: a point light still lights what it should: the scene's first point light put in front of the
// camera at full strength, a screenshot with it dark and one with it lit.
//   node .scratch/next-level/one-picture/point-light-shots.mjs <map> <spot> <out dir> [backend: webgpu|webgl]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const BASE = process.env.BASE ?? 'http://localhost:5191/';
const [map, spot, out, backend = 'webgpu'] = process.argv.slice(2);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=${map}&spot=${encodeURIComponent(spot)}${backend === 'webgl' ? '&webgl' : ''}`, BASE).toString());
  await chrome.waitFor('globalThis.duty?.game', 180_000);
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(8000);
  const tag = `${map}-${spot}-${backend}`.replace(/[^a-z0-9]+/gi, '-');
  const shot = async (name) => { const r = await chrome.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/pl-${tag}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
  // A red point light of its own, three metres ahead of the camera and one down: its glow is plain to see on the
  // ground and the leaves, and nothing in the game turns it off.
  const set = (on) => chrome.evaluate(`(async () => {
    const r = duty.renderer;
    globalThis.__seen ??= await new Promise((done) => { const real = r._renderObjectDirect; r._renderObjectDirect = function (object, material, scene, camera) { let o = object; while (o.parent) o = o.parent; if (o.isScene && o.children.length >= 10 && camera.isPerspectiveCamera) { r._renderObjectDirect = real; done({ scene: o, camera }); } return real.apply(this, arguments); }; });
    const { scene, camera } = globalThis.__seen;
    if (!globalThis.__probe) {
      const Light = scene.getObjectByProperty('isPointLight', true).constructor;
      globalThis.__probe = new Light(0xff2020, 0, 14, 1.2);
      scene.add(globalThis.__probe);
    }
    const l = globalThis.__probe, d = camera.getWorldDirection(camera.position.clone());
    l.position.copy(camera.getWorldPosition(camera.position.clone())).addScaledVector(d, 3); l.position.y -= 1;
    l.intensity = ${on ? 200 : 0};
    let n = 0; scene.traverse((x) => { if (x.isPointLight) n++; }); return n;
  })()`);
  // A new light rebuilds every lit shader: the dark shot waits it out too.
  console.log('lights', await set(false));
  await sleep(8000);
  await shot('dark');
  await set(true);
  await sleep(5000);
  await shot('lit');
  console.log('errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
