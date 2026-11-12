// Ticket 82: the grenade and tactical counts in the ammo plate. Survival Town walked alone at 1920, 1366 and 844x390,
// saving the frame and a crop of the plate, and reading the counts' sizes (also with the touch layout's class put on).
//   node .scratch/next-level/nade-count/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const SIZES = { desktop: [1920, 1080, false], laptop: [1366, 768, false], phone: [844, 390, true] };
const read = () => chrome.evaluate(`(() => [...document.querySelectorAll('.ds-ammo .nade, .ds-ammo .mag')].map((e) => { const b = e.getBoundingClientRect(); const i = e.querySelector('svg'); const n = e.querySelector('b'); return { cls: e.className, box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], icon: i ? Math.round(i.getBoundingClientRect().height) : null, count: n ? getComputedStyle(n).fontSize : getComputedStyle(e).fontSize }; }))()`);
const res = {};
try {
  for (const [name, [width, height, mobile]] of Object.entries(SIZES)) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=20,-25,1.9');
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
    await sleep(3500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    const c = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: width - 460, y: height - 170, width: 460, height: 170, scale: 2 } });
    writeFileSync(`${out}/${name}-plate.png`, Buffer.from(c.result.data, 'base64'));
    res[name] = await read();
  }
  await chrome.evaluate(`document.documentElement.classList.add('ds-touch')`);
  await sleep(300);
  res.touch = await read();
  console.log(JSON.stringify({ res, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
