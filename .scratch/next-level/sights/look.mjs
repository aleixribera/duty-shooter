// Every gun that takes an optic, fully aimed through its irons, the Reflex and the Prism 2x, in the viewmodel
// viewer (ticket 102): one frame each at desktop and phone width, and any page errors.
//   node .scratch/next-level/sights/look.mjs <out dir> [base url] [guns]
// `sheet.py <out dir>` then marks the screen's centre and finds each reticle's red centre.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url] [guns]');
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const GUNS = (process.argv[4] ?? 'm4a1,smg,shotgun,lmg,burst').split(',');
const SIGHTS = ['irons', 'reflex', 'prism'];
const SIZES = [
  { name: 'desktop', width: 1920, height: 1080, mobile: false },
  { name: 'phone', width: 844, height: 390, mobile: true },
];
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const size of SIZES) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
    for (const gun of GUNS) {
      for (const sight of SIGHTS) {
        // Held fully aimed, before the clip's first shot (0.5 s).
        const optic = sight === 'irons' ? '' : `&optic=${sight}`;
        await chrome.navigate(`${BASE}?viewer&weapon=${gun}&clip=ads&t=0.48${optic}`);
        await sleep(4000);
        const s = await chrome.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${out}/${size.name}-${gun}-${sight}.png`, Buffer.from(s.result.data, 'base64'));
      }
    }
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
