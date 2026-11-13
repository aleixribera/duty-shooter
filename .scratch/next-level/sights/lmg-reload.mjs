// The Bulwark's feed cover lifted mid-reload with an optic on its rail (ticket 102): the optic must lift with it.
//   node .scratch/next-level/sights/lmg-reload.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const t of [0, 1.2, 2.4, 3.6]) {
    await chrome.navigate(`${BASE}?viewer&weapon=lmg&clip=empty&t=${t}&optic=reflex`);
    await sleep(4000);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/lmg-reload-${t}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
