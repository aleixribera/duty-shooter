// The main menu with no server answering (ticket 41), at desktop and phone width. Says what the two first items read and
// which one carries the lit bar.
//   node .scratch/next-level/menu/offline.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: offline.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const read = () =>
    chrome.evaluate(`[...document.querySelectorAll('.ds-dest')].slice(0, 3).map((b) => ({ text: b.innerText.replace(/\s+/g, ' ').trim(), off: b.classList.contains('off'), lit: b.classList.contains('primary') || b.classList.contains('lit'), disabled: b.disabled, cls: b.className }))`);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}.png`, Buffer.from(s.result.data, 'base64'));
  };
  await chrome.navigate(BASE);
  if (!(await chrome.waitFor(`document.querySelectorAll('.ds-dest').length > 2`, 60_000))) throw new Error('no menu');
  await sleep(2500);
  await shot('menu-desktop');
  const desktop = await read();
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(800);
  await shot('menu-phone');
  console.log(JSON.stringify({ desktop, phone: await read(), errors: chrome.errors.slice(0, 3) }, null, 1));
} finally {
  await chrome.close();
}
