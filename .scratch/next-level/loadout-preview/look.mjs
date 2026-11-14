// Review 2026-11-14c defect 5: a fresh Profile's Loadout showed a bare gun (nothing earned, and looking at a locked
// fitting or camo left the gun as it was), and on a phone the kept loadouts' names wrapped "M4A1 · / Warden 9".
// Fresh Profile: the Loadout, a locked suppressor and a locked camo hovered, at desktop; the kept loadouts at phone width.
// Needs the dev server.
//
//   node .scratch/next-level/loadout-preview/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/loadout-preview/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const hoverIn = (row, text) => chrome.evaluate(`(() => { const r = [...document.querySelectorAll('.ds-smith-row')].find((r) => r.querySelector('.ds-label')?.innerText.trim().toUpperCase() === ${JSON.stringify(row.toUpperCase())}); const b = r && [...r.querySelectorAll('.ds-mode')].find((b) => b.innerText.toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.dispatchEvent(new MouseEvent('mouseenter')); return true; })()`);
const stage = `(() => { const s = document.querySelector('.ds-stage'); return s ? { drawn: s.dataset.drawn ?? null } : null; })()`;
const card = `document.querySelector('.ds-card, .ds-detail')?.innerText ?? [...document.querySelectorAll('.ds-label')].map((l) => l.parentElement.innerText).find((t) => /Opens at/.test(t)) ?? null`;
const report = { steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(3000);
  log('loadout', { ok: await click('Loadout') });
  await chrome.waitFor(`!!document.querySelector('.ds-stage')?.dataset.drawn`, 60_000);
  await sleep(2000);
  log('bare', await js(stage));
  await shot('1-fresh-desktop');
  log('hover suppressor', { ok: await hoverIn('Muzzle', 'Suppressor') });
  await sleep(2500);
  log('suppressor', { ...(await js(stage)), text: await js(`document.querySelector('.ds-stage')?.parentElement?.innerText.slice(0, 300) ?? null`) });
  await shot('2-locked-suppressor-desktop');
  log('hover forest', { ok: await hoverIn('Camo', 'Forest') });
  await sleep(2500);
  log('forest', await js(stage));
  await shot('3-locked-forest-desktop');
  await phone();
  await sleep(1500);
  await chrome.evaluate(`document.querySelector('.ds-sets')?.scrollIntoView({ block: 'center' })`);
  await sleep(800);
  log('sets', { lines: await js(`[...document.querySelectorAll('.ds-sets .ds-mode')].map((b) => b.innerText.replace(/\\n/g, ' / '))`) });
  await shot('4-sets-phone');
} catch (error) {
  log('failed', { error: String(error) });
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
