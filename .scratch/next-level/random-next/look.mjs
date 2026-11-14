// Ticket 115, seen in a real Bot Match: the match ends, the host presses N (Random next match), the
// scoreboard's time runs out and a match on another map in another mode starts with no setup page
// between; the end at phone width too. Needs the dev server.
//
//   node .scratch/next-level/random-next/look.mjs <out dir> [match seconds] [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/random-next/after';
const MATCH = Number(process.argv[3] ?? 20);
const BASE = process.argv[4] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const key = async (code, k) => {
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
};
const status = `(() => { const m = duty.driver?.match ?? null; const lobby = document.querySelector('.ds-lobby'); return { phase: m?.phase ?? null, map: m?.map ?? null, mode: m?.mode ?? null, random: m?.lobby?.random ?? false, setup: !!lobby && lobby.getClientRects().length > 0, end: document.querySelector('.ds-end .after')?.innerText ?? '' }; })()`;
const report = { match: MATCH, steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};

try {
  // Other sessions edit the source while this runs: this page takes no word from Vite's hot reload.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock&matchtime=${MATCH}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  log('first match', await js(status));
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'nuke'`, (MATCH + 60) * 1000))) throw new Error('the match did not end');
  await sleep(1500);
  log('its end', await js(status));
  await shot('1-end-desktop');
  await key('KeyN', 'n');
  await sleep(600);
  log('N pressed', await js(status));
  await shot('2-random-asked-desktop');
  // The same at phone width (landscape), pressed off and on again.
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await key('KeyN', 'n');
  await sleep(700);
  log('N again, phone', await js(status));
  await shot('4-end-phone');
  await key('KeyN', 'n');
  await sleep(700);
  log('N again, phone', await js(status));
  await shot('5-random-asked-phone');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  // Watch every 150 ms until a match plays on another map: was the setup page ever up?
  let setupSeen = false;
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < 120_000) {
    s = await js(status);
    if (s.setup) setupSeen = true;
    if (s.phase === 'playing' && s.map !== 'survival-town') break;
    await sleep(150);
  }
  log('next match', { ...s, setupSeen, seconds: (Date.now() - t0) / 1000 });
  await sleep(4000);
  await shot('3-next-match-desktop');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
