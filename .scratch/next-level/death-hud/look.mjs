// Review 2026-11-14a's defect 5 (23-kill-1b): on death the "+150" score popup ran into the loadout plate under
// "You died", and a marker pinned to the left edge lay on the spectator's panel. A Charge Bot Match on Switchyard:
// fights until hurt, adds a score popup then (as a kill just before dying would), stands until killed, adds one
// more while out (a kill landing after death), then watches each teammate in turn for a while. Each step logs
// whether the popup shows, its box against the prompt's, and every marker's box against the panel's words.
// Needs the dev server.
//
//   node .scratch/next-level/death-hud/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/death-hud/after';
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
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 });
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button, clickCount: 1 });
const popup = `duty.game.hud.score({ lines: [{ points: 100, label: 'Eliminated', note: 'Comet' }, { points: 50, label: 'First blood', note: '' }], medal: null, points: 150 })`;
const facts = `(() => {
  const box = (e) => { if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; };
  const meet = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const lines = [...document.querySelectorAll('.ds-score .lines div, .ds-score .total.on')].map(box).filter(Boolean);
  const prompt = box(document.querySelector('.ds-prompt'));
  // The panel's words, not its padding.
  const panelBits = [...document.querySelectorAll('.ds-spec > *')].map(box).filter(Boolean);
  const marks = [...document.querySelectorAll('.ds-hud [class*="marker"], .ds-hud [class*="carrier"], .ds-hud [class*="drop"]')].map((e) => ({ c: String(e.className), b: box(e) })).filter((m) => m.b);
  return {
    alive: duty.game.player?.alive ?? null,
    hp: duty.game.player?.health ?? null,
    prompt, promptText: document.querySelector('.ds-prompt')?.innerText ?? null,
    scoreShown: lines.length > 0,
    scoreOnPrompt: lines.some((s) => meet(s, prompt)),
    marks: marks.map((m) => m.c.split(' ')[0] + '@' + m.b.join(',')),
    marksOnPanel: marks.filter((m) => panelBits.some((p) => meet(m.b, p))).map((m) => m.c + '@' + m.b.join(',')),
  };
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
  for (const p of ['Bot Match', 'Switchyard', 'Charge', 'Hard', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.driver?.match?.objective?.phase === 'live'`, 120_000))) throw new Error('the round did not go live');
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, 'Switchyard').catch((e) => console.log('no routes', e.message));
  const STEER = steer({ range: 60, chase: 1 });
  const held = { walk: false, pressed: false };
  let added = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && (await js(`duty.game.player?.alive ?? true`))) {
    const want = await js(STEER);
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.fire !== held.pressed) await mouse(want.fire ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, pressed: want.fire });
    }
    if (!added && (await js(`duty.game.player?.health ?? 100`)) < 70) {
      await chrome.evaluate(popup);
      added = true;
      await log('hurt, popup added');
    }
    await sleep(40);
  }
  if (held.walk) await key('keyUp', 'KeyW');
  if (held.pressed) await mouse('mouseReleased');
  await sleep(300);
  await log('dead');
  await shot('1-dead');
  await chrome.evaluate(popup);
  await sleep(500);
  await log('dead, popup added');
  await shot('2-dead-popup');
  // Watch each teammate in turn: markers swing round the edges as the view does.
  let n = 0;
  for (let i = 0; i < 60 && (await js(`duty.game.player?.alive === false`)); i++) {
    if (i % 10 === 5) {
      await mouse('mousePressed');
      await mouse('mouseReleased');
    }
    await sleep(250);
    const f = await log(`watching ${i}`);
    const low = f.marks.some((m) => {
      const [x, , , y] = m.split('@')[1].split(',').map(Number);
      return x < 520 && y > H * 0.6;
    });
    if (low && n < 4) await shot(`3-left-marker-${n++}`);
  }
  await shot('4-watching-end');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
