// The temporal AA before (an occlusion pass, then three's TRAA copying its history) and after (OccludedTRAA): one frame
// of each at a spot, in this PC's scripted Chrome, with the pixel difference. Needs the TEMP-TRAA-PROBE hook (traa-probe-hook.txt).
//   node .scratch/next-level/toaster/traa-look.mjs <base url> <map> <spot> <out prefix>
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [base, map, spot, out] = process.argv.slice(2);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${base}?map=${map}&spot=${encodeURIComponent(spot)}&hz=1000`);
  await chrome.waitFor('document.body.dataset.bake && globalThis.__post', 240_000);
  await sleep(8000);
  for (const [i, v] of ['real', 'old', 'real'].entries()) {
    await chrome.evaluate(`(() => { const P = globalThis.__post; P.pipeline.outputNode = ${v === 'real' ? 'P.real' : `P.variants.${v}`}; P.pipeline.needsUpdate = true; })()`);
    await sleep(5000);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}-${i}-${v}.png`, Buffer.from((shot.result ?? shot).data, 'base64'));
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
