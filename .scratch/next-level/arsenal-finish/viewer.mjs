// Every gun in the viewmodel viewer, held mid-inspect (the side turned to the camera) (ticket 44): one screen each, and any page errors.
//   node .scratch/next-level/arsenal-finish/viewer.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: viewer.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const GUNS = ['m4a1', 'pistol', 'smg', 'shotgun', 'sniper', 'lmg', 'dmr', 'burst', 'revolver'];
const chrome = await launchChrome();
try {
  for (const gun of GUNS) {
    await chrome.navigate(`${BASE}?viewer&weapon=${gun}&clip=inspect&t=1.4`);
    await sleep(4500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/viewer-${gun}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
