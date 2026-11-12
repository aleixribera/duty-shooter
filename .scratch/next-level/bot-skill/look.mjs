// Ticket 83: Bot Match's bot skill. The setup at desktop and phone sizes, Hard picked, then a Survival Town TDM started
// and the bots' reaction times read from the running match.
//   node .scratch/next-level/bot-skill/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate('http://localhost:5191/?nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('Bot Match'))) throw new Error('no Bot Match');
  await sleep(1500);
  await shot('setup-normal');
  if (!(await click('Hard'))) throw new Error('no Hard');
  await sleep(400);
  const lit = await chrome.evaluate(`[...document.querySelectorAll('[data-act="skill"]')].map((b) => b.innerText + (b.classList.contains('on') ? '*' : ''))`);
  await shot('setup-hard');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  await chrome.evaluate(`document.querySelector('[data-act="skill"]')?.scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await shot('setup-phone');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  const bots = await chrome.evaluate(`[...duty.driver.botProfiles].map(([n, p]) => n + ' ' + p.reaction.toFixed(3) + ' ' + (p.aimError * 180 / Math.PI).toFixed(2))`);
  await sleep(2500);
  await shot('match');
  console.log(JSON.stringify({ lit, bots, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
