// The bloom fed the picture before or after the sharpen and shimmer: one frame of each at a spot, in this PC's scripted Chrome.
//   node .scratch/next-level/toaster/bloom-look.mjs <base url of a dev build with the __post hook> <map> <spot> <out prefix>
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [base, map, spot, out] = process.argv.slice(2);
const chrome = await launchChrome();
try {
  await chrome.navigate(`${base}?map=${map}&spot=${encodeURIComponent(spot)}&hz=1000`);
  await chrome.waitFor('document.body.dataset.bake && globalThis.__post', 240_000);
  await sleep(8000);
  for (const v of ['real', 'cheapbloom']) {
    await chrome.evaluate(`(() => { const P = globalThis.__post; P.pipeline.outputNode = ${v === 'real' ? 'P.real' : `P.variants.${v}`}; P.pipeline.needsUpdate = true; })()`);
    await sleep(5000);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}-${v}.png`, Buffer.from((shot.result ?? shot).data, 'base64'));
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
