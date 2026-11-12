// Ticket 79: a controller connecting as a Bot Match opens. Starts a Survival Town TDM, announces a pad the moment play
// starts, and shoots the screen while the opening card is up and once it has gone.
//   node .scratch/next-level/pad-notice/start.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: pad-notice/start.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate('http://localhost:5191/?nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await chrome.evaluate(`(() => { const e = new Event('gamepadconnected'); Object.defineProperty(e, 'gamepad', { value: { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' } }); dispatchEvent(e); return 1; })()`);
  const toast = `(() => { const t = document.querySelector('.ds-toast'); return t ? t.style.opacity + ' ' + t.textContent : 'none'; })()`;
  const log = [];
  for (const [name, wait] of [['card', 1500], ['after', 5500]]) {
    await sleep(wait);
    log.push({ name, toast: await chrome.evaluate(toast), countdown: await chrome.evaluate('duty.driver?.match?.countdown ?? null') });
    await shot(name);
  }
  console.log(JSON.stringify({ log, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
