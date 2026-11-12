// Ticket 61: the HUD's health and ammo plates. Survival Town walked alone, at desktop and phone sizes, over a bright wall.
//   node .scratch/next-level/plates/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const SIZES = { desktop: [1920, 1080, false], phone: [844, 390, true] };
try {
  for (const [name, [width, height, mobile]] of Object.entries(SIZES)) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=20,-25,1.9');
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
    await sleep(3500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
