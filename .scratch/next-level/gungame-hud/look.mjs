// Review 2026-11-14a's defects 2 and 3: a Gun Game Bot Match on Survival Town. Frames the countdown card (no
// "F Loadout"), the bar while you lead (never your own name as Leader beside "You · 1st") with the scoreboard
// held (the same place on both), then stands still until killed: dead, no loadout chip, no loadout hint, and F
// opens nothing. Logs the bar's words, your place on both, the prompt and the hint each step. Needs the dev server.
//
//   node .scratch/next-level/gungame-hud/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/gungame-hud/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const MODE = process.env.MODE ?? 'Gun game';
const MAP = process.env.MAP ?? 'Survival Town';
const FIGHT = Number(process.env.FIGHT ?? 45);
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 });
const tap = async (code) => {
  await key('keyDown', code);
  await key('keyUp', code);
};
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button, clickCount: 1 });
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' ? e.innerText.replace(/\\s+/g, ' ').trim() : null; })()`;
const facts = `({
  bar: ${visible('.ds-match')},
  round: ${visible('.ds-round')},
  prompt: ${visible('.ds-prompt')},
  hint: ${visible('.ds-hintline')},
  alive: duty.game.player?.alive ?? null,
  mine: (() => { const s = duty.driver.scores; const me = s.find((x) => x.id === duty.driver.selfId); return me && { kills: me.kills, progress: me.progress ?? 0, score: me.score }; })(),
  board: [...document.querySelectorAll('.ds-board tr')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()).filter((t) => t).slice(0, 10),
})`;
const report = { mode: MODE, map: MAP, steps: [], errors: chrome.errors };
const log = async (step, extra = {}) => {
  const f = { ...(await js(facts)), ...extra };
  report.steps.push({ step, ...f });
  console.log(step, JSON.stringify(f));
  return f;
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(BASE);
  // A fresh browser: every first-match hint still to learn, so the loadout and swap hints would show if they could.
  await chrome.evaluate(`localStorage.clear()`);
  await chrome.navigate(`${BASE}?nolock&matchtime=240`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', MAP, MODE, 'Easy', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  await sleep(1500);
  await log('countdown');
  await shot('1-countdown');
  // F at the countdown: in Gun Game nothing opens.
  await tap('KeyF');
  await sleep(500);
  await log('F at countdown', { loadoutOpen: await js(`!!document.querySelector('.ds-loadout, .ds-editor, [data-screen="loadout"]')?.getClientRects().length`) });
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, MAP).catch((e) => console.log('no routes', e.message));
  const STEER = steer({ range: 40 });
  const held = { walk: false, pressed: false, ads: false, n: 0 };
  const release = async () => {
    if (held.walk) await key('keyUp', 'KeyW');
    if (held.ads) await mouse('mouseReleased', 'right');
    if (held.pressed) await mouse('mouseReleased');
    Object.assign(held, { walk: false, ads: false, pressed: false });
  };
  // Fight: the bar while it runs, and the first time you lead.
  const t0 = Date.now();
  let led = false;
  let ticks = 0;
  while (Date.now() - t0 < FIGHT * 1000 && (await js(`duty.driver?.match?.phase ?? null`)) === 'playing') {
    const want = await js(STEER);
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.ads !== held.ads) await mouse(want.ads ? 'mousePressed' : 'mouseReleased', 'right');
      if (want.reload) await tap('KeyR');
      const press = want.fire && (want.dist < 12 || held.n++ % 6 < 4);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await mouse(press ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, ads: want.ads, pressed: press });
    }
    if (ticks++ % 25 === 0) {
      const f = await log('fight');
      if (!led && f.bar && /You · 1st/i.test(f.bar) && (f.mine?.kills ?? 0) > 0) {
        led = true;
        await shot('2-leading');
      }
      if (f.hint) await shot(`2-hint-${ticks}`);
    }
    await sleep(40);
  }
  await release();
  // The scoreboard held beside the bar: the same place on both.
  await key('keyDown', 'Tab');
  await sleep(500);
  await log('scoreboard');
  await shot('3-scoreboard');
  await key('keyUp', 'Tab');
  // Stand still until a bot kills you.
  const t1 = Date.now();
  while (Date.now() - t1 < 90_000 && (await js(`duty.game.player?.alive ?? true`))) await sleep(250);
  await sleep(1200);
  await log('dead');
  await shot('4-dead');
  await sleep(1800);
  await log('dead later');
  await shot('5-dead-later');
  await tap('KeyF');
  await sleep(500);
  await log('F while dead', { overlay: await js(`[...document.querySelectorAll('h1,h2')].filter((h) => h.getClientRects().length).map((h) => h.innerText).slice(0, 5)`) });
  await shot('6-dead-f');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
