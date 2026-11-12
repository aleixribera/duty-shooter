// Ticket 53: a Survival Town team Bot Match at its start, looking round from the spawn: which ally tags carry a name.
//   node .scratch/next-level/ally-names/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate('http://localhost:5191/?nolock&seed=5');
  if (!(await chrome.waitFor('globalThis.duty?.game', 120_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 240_000))) throw new Error('match did not start');
  // Past the opening count, with the bots spread round the house.
  await sleep(Number(process.env.WAIT ?? 9000));
  const report = [];
  for (let k = 0; k < 8; k++) {
    const yaw = (k * Math.PI) / 4;
    await chrome.evaluate(`duty.game.input.setAngles(${yaw}, 0), 1`);
    await sleep(600);
    const tags = JSON.parse(await chrome.evaluate(`JSON.stringify([...document.querySelectorAll('.ds-ally')].map((e) => ({ cls: e.className.replace('ds-ally', '').trim(), name: e.querySelector('.name')?.innerText ?? null })))`));
    report.push({ yaw: yaw.toFixed(2), tags });
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/yaw-${k}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  console.log(JSON.stringify({ report, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
