// A Local bots Battle Royale played until the player is out, to see the Match
// card carry the XP strip (ticket 25) and the Profile take the match
// (ticket 17). The player lands, then drops frags at their own feet: in Solos
// that ends their match, and the card comes up.
//
//   node .scratch/next-level/score/royale.mjs [out dir]
//
// Needs the dev server on :5173.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/score/shots';
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'duty-royale-'));
const NO_HMR = `(() => { const Real = WebSocket; globalThis.WebSocket = new Proxy(Real, { construct(target, args) {
  const p = args[1]; if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
  return new target(...args); } }); })()`;
// What a worker of the page throws, kept where the script can read it.
const WORKER_ERRORS = `(() => { const Real = Worker; globalThis.__workerErrors = []; globalThis.Worker = new Proxy(Real, { construct(target, args) {
  const w = new target(...args); w.addEventListener('error', (e) => globalThis.__workerErrors.push(String(e.message) + ' @ ' + e.filename + ':' + e.lineno)); w.addEventListener('messageerror', () => globalThis.__workerErrors.push('messageerror')); return w; } }); })()`;

const chrome = await launchChrome({ profile });
// One size a run: the card stands for sixteen seconds, too few to resize a loaded page in.
const PHONE = process.env.VIEW === 'phone';
const [W, H] = PHONE ? [390, 844] : [1920, 1080];
const size = (width, height) => chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
const grab = async (name) => {
  const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
};
const both = async (name) => {
  await grab(`${name}-1920`);
  await size(390, 844);
  await sleep(400);
  await grab(`${name}-390`);
  await size(1920, 1080);
  await sleep(200);
};
const click = (selector, text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => !b.disabled && (${JSON.stringify(text ?? '')} === '' || b.innerText.trim().toUpperCase().startsWith(${JSON.stringify((text ?? '').toUpperCase())}))); if (!b) return false; b.click(); return true; })()`);
const key = (type, code, vk) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: vk });

const STATE = `(() => { try { const d = duty.driver, me = d?.scores.find((s) => s.id === d.selfId) ?? null; const p = duty.game?.player; return JSON.stringify({
  phase: d?.match?.phase ?? null, mode: d?.match?.mode ?? null, me, left: d?.match?.phaseEnds == null ? null : Math.round((d.match.phaseEnds - d.serverTime) * 10) / 10,
  alive: p?.alive ?? null, ground: p ? Math.abs(p.velocity[1]) < 0.3 : null, move: p?.movement ?? null, frags: p?.grenades ?? null, y: p ? Math.round(p.position[1]) : null, health: p ? Math.round(p.health) : null,
  card: document.querySelector('.ds-card')?.classList.contains('on') ?? false,
  gain: document.querySelector('.ds-card .ds-gain')?.innerText ?? null,
  lines: [...document.querySelectorAll('.ds-score .lines div')].map((e) => e.textContent),
  screen: document.querySelector('.ds-page h1')?.innerText ?? null,
}); } catch (e) { return JSON.stringify({ error: String(e) }); } })()`;

const report = { shots: [], errors: [] };
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: WORKER_ERRORS });
  await size(W, H);
  await chrome.navigate('http://localhost:5173/?nolock&seed=7');
  if (!(await chrome.waitFor('globalThis.duty?.game && location.protocol === "http:"', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('button', 'Battle Royale'))) throw new Error('no Battle Royale destination');
  await sleep(600);
  if (!(await click('button[data-act="source"][data-value="local"]'))) throw new Error('no Local bots');
  await sleep(400);
  await click('button', 'Solos');
  await sleep(400);
  // A Battle Royale seat needs a name.
  await chrome.evaluate(`(() => { const i = document.querySelector('.ds-page input'); if (!i) return false; i.focus(); i.value = 'Tester'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(400);
  // "Open lobby", then whatever the lobby's way on is, until a match is on.
  const began = Date.now();
  let state = null;
  let last = '';
  let conn = '';
  while (Date.now() - began < 600_000) {
    state = JSON.parse(await chrome.evaluate(STATE));
    if (state.mode === 'battle-royale' && state.phase === 'playing') break;
    const now = await chrome.evaluate(`(document.querySelector('.ds-page .conn')?.innerText ?? '') + ' | go: ' + (document.querySelector('.ds-page footer .primary')?.innerText ?? '') + ' | ' + JSON.stringify(globalThis.__workerErrors ?? null) + ' | ' + (duty.driver?.match?.phase ?? '-')`);
    if (now !== conn) console.error(((Date.now() - began) / 1000).toFixed(0), (conn = now).split('\n').join(' / '));
    await click('button[data-key="go"]');
    await sleep(1500);
  }
  report.pageErrors = chrome.errors.slice(0, 8);
  if (state?.phase !== 'playing') throw new Error(`no match: ${JSON.stringify(state)}`);
  console.error('playing after', ((Date.now() - began) / 1000).toFixed(0), 's');
  const started = Date.now();
  let thrown = 0;
  while (Date.now() - started < 600_000) {
    state = JSON.parse(await chrome.evaluate(STATE));
    if (state.error) throw new Error(state.error);
    const line = `${state.phase} alive ${state.alive} ground ${state.ground} ${state.move} frags ${state.frags} y ${state.y} hp ${state.health} place ${state.me?.place} left ${state.phase === 'playing' ? '-' : state.left} card ${state.card}`;
    if (line !== last) console.error(((Date.now() - started) / 1000).toFixed(0), (last = line));
    if (state.card && state.gain) break;
    if (state.alive && state.ground && Date.now() - thrown > 2500) {
      // Straight down, and a frag at the feet.
      await chrome.evaluate('duty.game.input.setAngles(0, -1.45)');
      await key('keyDown', 'KeyG', 71);
      await sleep(120);
      await key('keyUp', 'KeyG', 71);
      thrown = Date.now();
    }
    await sleep(250);
  }
  report.me = state?.me ?? null;
  report.gain = state?.gain ?? null;
  if (!state?.card) throw new Error(`the Match card never came: ${JSON.stringify(state)}`);
  // Shot at once, and again once the bar has filled: the second is the one to look at when the card is still up.
  const name = `royale-card-${PHONE ? 390 : 1920}`;
  const seen = async () => JSON.parse(await chrome.evaluate(STATE));
  await grab(`${name}-first`);
  report.first = await seen();
  await sleep(1800);
  await grab(name);
  report.second = await seen();
  console.error('card at first shot', report.first.card, report.first.phase, report.first.left, '| at second', report.second.card, report.second.phase, report.second.left);
  report.shots.push(`${name}-first`, name);
  report.cardText = report.second.card ? await chrome.evaluate(`document.querySelector('.ds-card')?.innerText ?? null`) : null;
  report.stored = await chrome.evaluate(`localStorage.getItem('duty-shooter.profile.v1')`);
} catch (e) {
  report.error = String(e);
  await grab('royale-failed-1920').catch(() => {});
}
report.errors.push(...chrome.errors.slice(0, 8));
await chrome.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.error ? 1 : 0);
