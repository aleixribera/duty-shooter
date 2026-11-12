// The loadout prompt in the countdown card (ticket 42): a Survival Town Bot Match, the screen during the opening
// countdown and just after it, with whether the floating prompt shows and what the card's last line reads.
//   node .scratch/next-level/card/countdown-card.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: countdown-card.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const read = () =>
    chrome.evaluate(`(() => { const p = document.querySelector('.ds-prompt'); const u = document.querySelector('.ds-round .use'); const r = document.querySelector('.ds-round'); return { prompt: p && !p.hidden ? p.innerText.trim() : null, card: r && getComputedStyle(r).display !== 'none', cardLine: u ? u.innerText.trim() : null }; })()`);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-round .use')`, 180_000, 100))) throw new Error('no card line');
  await sleep(300);
  await shot('countdown');
  const during = await read();
  await chrome.waitFor(`getComputedStyle(document.querySelector('.ds-round')).display === 'none'`, 15_000, 100);
  await sleep(500);
  await shot('after');
  console.log(JSON.stringify({ during, after: await read(), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
