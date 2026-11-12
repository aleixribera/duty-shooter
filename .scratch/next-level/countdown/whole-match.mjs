// The whole-match countdown: the match bar at the start, halfway and in the last minute of a short Bot Match.
//   node .scratch/next-level/countdown/whole-match.mjs <out dir> [match seconds] [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: whole-match.mjs <out dir> [match seconds] [base url]');
const LENGTH = Number(process.argv[3] ?? 90);
const BASE = process.argv[4] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  // The match bar alone, cropped, plus what its clock and fuse read.
  const bar = async (name) => {
    const r = await chrome.evaluate(`(() => { const m = document.querySelector('.ds-match'); if (!m) return null; const b = m.getBoundingClientRect(); const i = m.querySelector('.fuse i'); return { x: b.x - 40, y: Math.max(0, b.y - 10), w: b.width + 80, h: b.height + 30, clock: m.querySelector('.clock')?.textContent, cls: m.querySelector('.clock')?.className, fuse: i?.style.transform, quiet: !!m.querySelector('.fuse.quiet') }; })()`);
    if (!r) throw new Error('no match bar');
    const s = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 } });
    writeFileSync(`${out}/${name}.png`, Buffer.from(s.result.data, 'base64'));
    console.log(name, JSON.stringify({ clock: r.clock, cls: r.cls, fuse: r.fuse, quiet: r.quiet }));
  };
  await chrome.navigate(`${BASE}?nolock&matchtime=${LENGTH}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await sleep(4000);
  await bar('1-start');
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(`${out}/0-screen.jpg`, Buffer.from(s.result.data, 'base64'));
  await sleep(((LENGTH - 60) / 2) * 1000 - 4000);
  await bar('2-half');
  await sleep(((LENGTH - 60) / 2) * 1000 + 3000);
  await bar('3-last-minute');
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
