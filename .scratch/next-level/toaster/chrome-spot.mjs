// One frame of a map's reference spot in this PC's scripted Chrome (WebGPU), with the page's errors:
//   node .scratch/next-level/toaster/chrome-spot.mjs <map> <spot> <out.jpg>   (dev server on 5173)
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [map, spot, out] = process.argv.slice(2);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`http://localhost:5173/?map=${map}&spot=${encodeURIComponent(spot)}&hz=1000`);
  await chrome.waitFor('document.body.dataset.bake', 240_000);
  await sleep(8000);
  const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(out, Buffer.from((shot.result ?? shot).data, 'base64'));
  console.log('backend', await chrome.evaluate(`duty.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL'`), 'errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
