// Ticket 87: two enemy pings side by side, as in review 2026-11-12g's 07. A Survival Town Bot Match; once it plays,
// the player marks two enemies on the ground 12 m ahead, 0.5 m apart, through the game's own ping path (driver.mark),
// and the frame is taken with both markers standing.
//   node .scratch/next-level/markers-apart/look.mjs <out.jpg> [base]   (dev server on :5173)
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await click('Start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  await sleep(1500);
  const asked = await chrome.evaluate(`(() => {
    const g = duty.game, p = g.player, d = duty.driver;
    const yaw = p.yaw ?? p.look?.yaw ?? 0;
    const f = [-Math.sin(yaw), 0, -Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const at = (ahead, side) => [p.position[0] + f[0] * ahead + r[0] * side, p.position[1], p.position[2] + f[2] * ahead + r[2] * side];
    d.mark({ kind: 'enemy', at: at(12, 0) });
    d.mark({ kind: 'enemy', at: at(15, 0.5) });
    return { yaw, pos: p.position };
  })()`);
  await sleep(700);
  const marks = await chrome.evaluate(`[...document.querySelectorAll('.ds-ping')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.innerText.replace(/\\n/g, ' '), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })`);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  console.log(JSON.stringify({ asked, marks, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
