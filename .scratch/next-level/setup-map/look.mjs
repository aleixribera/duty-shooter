// Ticket 81: the Bot Match setup at desktop, laptop, phone-on-its-side and phone sizes, then Free-for-all and Switchyard
// at desktop. Reads where the rosters, the picks and the labels sit, in css px.
//   node .scratch/next-level/setup-map/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = resolve(import.meta.dirname, process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: look.mjs <out dir, under this folder>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const SIZES = { desktop: [1920, 1080, false], laptop: [1280, 720, false], wide: [1366, 768, false], mid: [1100, 800, false], landscape: [844, 390, true], phone: [390, 844, true] };
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text, sel = 'button') => chrome.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const read = () => chrome.evaluate(`(() => { const r = (q) => [...document.querySelectorAll(q)].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; });
  const l = document.querySelector('.ds-lobby .picks .ds-field-label');
  return { section: r('.ds-lobby .body > section'), match: r('.ds-lobby .match'), seats: r('.ds-lobby .seat').length, lastSeat: r('.ds-lobby .seat').at(-1), label: l && getComputedStyle(l).fontSize, scrollW: document.documentElement.scrollWidth, bodyScroll: (() => { const b = document.querySelector('.ds-lobby .body'); return [b.scrollHeight, b.clientHeight]; })() }; })()`);
const res = {};
try {
  await chrome.navigate('http://localhost:5191/');
  await chrome.waitFor('document.querySelector(".ds-home")', 240_000);
  await sleep(2500);
  if (!(await click('Bot Match'))) throw new Error('no Bot Match');
  await sleep(2500);
  for (const [name, [width, height, mobile]] of Object.entries(SIZES)) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(900);
    await shot(name);
    res[name] = await read();
  }
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await click('Free-for-all');
  await sleep(900);
  await shot('desktop-ffa');
  res.ffa = await read();
  await click('Switchyard');
  await sleep(4000);
  await shot('desktop-switchyard');
  res.switchyard = await read();
  console.log(JSON.stringify({ res, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
