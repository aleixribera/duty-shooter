// Survival Town walked alone, one screenshot per view: node views.mjs <out dir> name=x,z,yaw ... [--base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: views.mjs <out dir> name=x,z,yaw ...');
const BASE = 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const v of rest) {
    const [name, at] = v.split('=');
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
