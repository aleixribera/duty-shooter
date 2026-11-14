// PLAN item 9c, seen in a fresh browser: the main menu holds no name box and no "Player 1234"; a Bot Match's setup
// never asks; the first Play Online asks for the name (desktop and phone), joins under it, and the lobby shows it;
// back at the menu the corner shows it, Settings' Player tab holds it, the save code carries it, and after a reload
// Play Online joins at once without asking again. Needs the dev server (5173) and a public game server (3000).
//
//   node .scratch/next-level/name/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/name/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const desk = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const look = `(() => ({ screen: document.querySelector('.ds-menu h1, .ds-menu h2')?.innerText ?? null, corner: document.querySelector('.ds-corner')?.innerText.replace(/\\s+/g, ' ') ?? null, cornerBox: document.querySelector('.ds-corner input')?.value ?? null, asked: !!document.querySelector('[aria-label="Your name"]'), playerNNNN: /Player \\d{4}/.test(document.body.innerText), stored: { settings: JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? '{}').name ?? null, profile: Object.entries(localStorage).filter(([k]) => k.includes('profile')).map(([k, v]) => [k, JSON.parse(v).name ?? null]) } }))()`;
const report = { steps: [], errors: chrome.errors };
const log = async (step, extra = {}) => {
  const detail = { ...(await js(look)), ...extra };
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desk();
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await chrome.waitFor(`!!document.querySelector('.ds-dest .readout') && !/not answering|offline/i.test(document.querySelector('.ds-dest .readout').innerText)`, 20_000, 250);
  await sleep(1500);
  await log('1 fresh menu');
  await shot('1-menu-desktop');
  // Solo play never asks.
  if (!(await click('Bot Match'))) throw new Error('no Bot Match');
  await sleep(1200);
  await log('2 bot match setup');
  await shot('2-botmatch-desktop');
  await click('Back');
  await sleep(800);
  // The first Play Online asks.
  if (!(await click('Play Online'))) throw new Error('no Play Online');
  await sleep(800);
  await log('3 play online');
  await shot('3-asked-desktop');
  await phone();
  await sleep(600);
  await shot('3-asked-phone');
  await desk();
  await sleep(400);
  // Typed as a player types: the box is focused, then the keys.
  await chrome.evaluate(`document.querySelector('[aria-label="Your name"]').focus()`);
  await chrome.send('Input.insertText', { text: 'Aleix' });
  await sleep(300);
  if (!(await click('Play Online'))) throw new Error('no Play Online under the name');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 300))) throw new Error('no lobby');
  await sleep(1500);
  await log('4 lobby', { names: await js(`duty.driver?.match ? Object.values(duty.driver.names ?? {}) : null`), lobbyText: await js(`document.querySelector('.ds-lobby')?.innerText.includes('Aleix')`) });
  await shot('4-lobby-desktop');
  if (!(await click('Leave')) && !(await click('Back'))) throw new Error('no way out of the lobby');
  await sleep(1500);
  await log('5 menu again');
  await shot('5-menu-desktop');
  await phone();
  await sleep(600);
  await shot('5-menu-phone');
  await desk();
  await click('Settings');
  await sleep(600);
  await click('Player');
  await sleep(500);
  await log('6 settings', { box: await js(`document.querySelector('.ds-rows input')?.value ?? null`) });
  await shot('6-settings-desktop');
  await phone();
  await sleep(600);
  await shot('6-settings-phone');
  await desk();
  await click('Back');
  await sleep(500);
  const code = await js(`(() => { const p = Object.entries(localStorage).find(([k]) => k.includes('profile')); return p ? p[1] : null; })()`);
  report.profile = code;
  // A reload: Play Online joins at once under the kept name.
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start again');
  await chrome.waitFor(`!!document.querySelector('.ds-dest .readout') && !/not answering|offline/i.test(document.querySelector('.ds-dest .readout').innerText)`, 20_000, 250);
  await sleep(1200);
  await click('Play Online');
  await sleep(600);
  await log('7 reload, play online');
  const joined = await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 60_000, 300);
  await log('8 joined without asking', { joined });
  await shot('8-lobby-again');
  await click('Leave');
  await sleep(800);
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => undefined);
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
