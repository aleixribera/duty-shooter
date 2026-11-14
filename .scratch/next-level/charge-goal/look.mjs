// Review 2026-11-14a, 23-a: a Charge freeze said its goal twice, on the plate under the match bar and on the
// round card. A Charge Bot Match on Switchyard: a frame and the facts during the freeze, then once the round is live.
// Needs the dev server.
//
//   W=844 H=390 node .scratch/next-level/charge-goal/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/charge-goal/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const W = Number(process.env.W ?? 1920);
const H = Number(process.env.H ?? 1080);
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const facts = `(() => { try {
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  const plate = document.querySelector('.ds-charge');
  const card = [...document.querySelectorAll('.ds-hud .goal')].find(shown);
  return { phase: duty.driver?.match?.objective?.phase ?? null, plate: shown(plate) ? plate.innerText.split(String.fromCharCode(10)).join(' / ') : null, card: card ? card.innerText : null }; } catch (e) { return { error: String(e) }; }
})()`;
const report = { steps: [], errors: chrome.errors };
const log = async (step) => {
  const f = await js(facts);
  report.steps.push({ step, ...f });
  console.log(step, JSON.stringify(f));
  return f;
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Charge', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.objective?.phase === 'freeze' && !!document.querySelector('.ds-hud .goal')`, 120_000))) throw new Error('no freeze');
  await sleep(1200);
  await log('freeze');
  await shot('1-freeze');
  if (!(await chrome.waitFor(`duty.driver?.match?.objective?.phase === 'live'`, 30_000))) throw new Error('the round did not go live');
  await sleep(1500);
  await log('live');
  await shot('2-live');
} catch (e) {
  report.failed = String(e?.message ?? e);
  console.log('FAILED', report.failed);
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
