// The main menu at phone, tablet, phone-on-its-side and desktop sizes (ticket 80). Reads the right edge of the name
// field, the Rank row and each destination, in css px.
//   node .scratch/next-level/phone-widths/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const SIZES = [['phone', 390, 844, 2], ['small-phone', 360, 740, 2], ['tablet', 768, 1024, 1], ['side', 844, 390, 2], ['desktop', 1600, 900, 1]];
try {
  await chrome.navigate(BASE);
  if (!(await chrome.waitFor(`document.querySelectorAll('.ds-dest').length > 2`, 60_000))) throw new Error('no menu');
  await sleep(2000);
  const res = {};
  for (const [name, width, height, dpr] of SIZES) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: width < 900 });
    await sleep(700);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    res[name] = await chrome.evaluate(`(() => { const r = (q) => [...document.querySelectorAll(q)].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; });
      return { name: r('.ds-name label'), rank: r('.ds-rankline'), dests: r('.ds-dests'), dest: r('.ds-dest'), readout: r('.ds-dest .readout'), scrollW: document.documentElement.scrollWidth }; })()`);
  }
  console.log(JSON.stringify({ res, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
