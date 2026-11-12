// Bot pings only in Battle Royale (PLAN item 0): a Survival Town TDM Bot Match played for `seconds`,
// counting every "Enemy spotted" line the feed shows and the ping marks in the world, with a frame at the end.
//   node .scratch/next-level/bot-pings/look.mjs <out dir> [seconds] [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [seconds] [base url]');
const SECONDS = Number(process.argv[3] ?? 120);
const BASE = process.argv[4] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate(`${BASE}?nolock&seed=7`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(2000);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  const lines = new Set();
  let shown = 0;
  let marks = 0;
  const start = Date.now();
  let shotTaken = false;
  while (Date.now() - start < SECONDS * 1000) {
    // Each feed line about a ping, counted once (marked when first seen), and the ping marks standing in the world.
    const r = await chrome.evaluate(`(() => {
      const fresh = [...document.querySelectorAll('.ds-feed div')].filter((d) => /spotted|Enemy here|Going here|Looting/i.test(d.textContent) && !d.dataset.counted);
      for (const d of fresh) d.dataset.counted = '1';
      return { fresh: fresh.map((d) => d.textContent), marks: document.querySelectorAll('.ds-ping').length };
    })()`);
    for (const l of r?.fresh ?? []) { lines.add(l); shown += 1; }
    marks = Math.max(marks, r?.marks ?? 0);
    if (!shotTaken && (r?.fresh.length || r?.marks)) { await shot('ping-seen'); shotTaken = true; }
    await sleep(400);
  }
  await shot('end');
  const kills = await chrome.evaluate('duty.driver.scores.reduce((n, s) => n + s.kills, 0)');
  const summary = { seconds: SECONDS, pingLines: shown, mostMarks: marks, examples: [...lines].slice(0, 5), kills, errors: chrome.errors.slice(0, 3) };
  writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  await chrome.close();
}
