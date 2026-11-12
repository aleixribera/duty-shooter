// The five-minute mark (ticket 36): a Bot Match of 5:20 (`?matchtime=320`), watched as its clock passes T-5:00.
// Prints whether the HUD wrote the line, whether the siren's test blast was played, and saves the screen as it shows.
//   node .scratch/next-level/countdown/five-minutes.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: five-minutes.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate(`${BASE}?nolock&matchtime=320`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  const clock = () => chrome.evaluate(`document.querySelector('.ds-match .clock')?.textContent ?? null`);
  if (!(await chrome.waitFor(`(document.querySelector('.ds-match .clock')?.textContent ?? '') <= 'T−5:01' && (document.querySelector('.ds-match .clock')?.textContent ?? '').startsWith('T−5')`, 60_000, 100))) throw new Error(`clock never reached 5:01 (${await clock()})`);
  await sleep(2200);
  const shown = await chrome.evaluate(`document.body.innerText.includes('T-minus five minutes')`);
  const line = await chrome.evaluate(`(document.body.innerText.match(/T-minus five minutes[^\\n]*/) ?? [null])[0]`);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(`${out}/five-minutes.jpg`, Buffer.from(s.result.data, 'base64'));
  const blasts = await chrome.evaluate(`(duty.sounds?.() ?? duty.sound.log).filter((e) => e.event === 'countdownSirenBlast').map((e) => ({ at: e.params.position?.map((v) => Math.round(v)) }))`);
  console.log(JSON.stringify({ clock: await clock(), shown, line, blasts, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
