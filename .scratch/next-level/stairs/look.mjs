// The back-deck stairs of Survival Town's north house (ticket 47): walked alone, two views from the back yard.
//   node .scratch/next-level/stairs/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const VIEWS = { square: '-9,-43,3.1416', angle: '1,-43,2.245' };
const chrome = await launchChrome();
try {
  for (const [name, at] of Object.entries(VIEWS)) {
    await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${at}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(4500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
