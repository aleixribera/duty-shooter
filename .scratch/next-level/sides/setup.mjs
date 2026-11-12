// The Bot Match setup's players (ticket 49): the page at desktop and phone width in mixed teams, humans vs bots and
// free-for-all, with the side headings each shows.
//   node .scratch/next-level/sides/setup.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: setup.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const shot = async (name) => {
    await sleep(400);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    return chrome.evaluate(`[...document.querySelectorAll('.ds-lobby .team')].map((t) => t.querySelector('h3').innerText + ': ' + [...t.querySelectorAll('.seat .name')].map((n) => n.innerText).join(', '))`);
  };
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('Bot Match'))) throw new Error('no Bot Match');
  const report = {};
  await click('Team deathmatch');
  await click('Mixed teams');
  report.mixed = await shot('mixed');
  await click('Humans vs bots');
  report.hvb = await shot('hvb');
  await click('Free-for-all');
  report.ffa = await shot('ffa');
  await click('Team deathmatch');
  await click('Mixed teams');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  await chrome.evaluate(`document.querySelector('.ds-lobby .team')?.scrollIntoView({ block: 'start' })`);
  report.phone = await shot('phone');
  report.overflow = await chrome.evaluate('document.documentElement.scrollWidth > innerWidth');
  console.log(JSON.stringify({ ...report, errors: chrome.errors.slice(0, 3) }, null, 1));
} finally {
  await chrome.close();
}
