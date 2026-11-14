// Tutorial hints at the climax and down the sights (review 2026-11-14c: "Sprint" at T-0:31, T-0:11, T-03.4 of the
// nuke minute; "WASD Move" while aiming). Two parts, each in a fresh browser profile:
//   range: the Practice Range, waits for "Move. The mouse looks", then holds the sights up and reads the line again.
//   match: a 75 s Bot Match (?matchtime) with the move and sights lessons already learned, nobody at the controls:
//          logs the hint line and the clock each second, with frames before and inside the last minute.
//   node .scratch/next-level/climax-hint/look.mjs <out dir>   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const LINE = `(() => { const h = document.querySelector('.ds-hintline'); return h && !h.hidden ? h.innerText.replace(/\\s+/g, ' ').trim() : null; })()`;
const CLOCK = `(() => { const m = duty.driver?.match; return m?.phaseEnds != null ? Math.round((m.phaseEnds - duty.driver.serverTime) * 10) / 10 : null; })()`;
const result = {};

async function part(name, fn) {
  const chrome = await launchChrome();
  const shot = async (n) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    if (s.result?.data) writeFileSync(`${out}/${name}-${n}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR });
    result[name] = await fn(chrome, shot);
  } catch (e) {
    result[name] = { failure: String(e?.stack ?? e) };
    await shot('failure').catch(() => {});
  } finally {
    result[name].errors = chrome.errors.slice(0, 5);
    await chrome.close();
  }
}

if (!process.env.ONLY || process.env.ONLY === 'range') await part('range', async (chrome, shot) => {
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await chrome.waitFor(LINE, 15_000, 250);
  const r = { beforeAiming: await chrome.evaluate(LINE) };
  await shot('1-hint');
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'right', buttons: 2, clickCount: 1 });
  await sleep(1500);
  r.aiming = await chrome.evaluate(`(duty.game.player?.weapon?.ads ?? 0) > 0.5`);
  r.whileAiming = await chrome.evaluate(LINE);
  await shot('2-aiming');
  await sleep(6000);
  r.stillAiming = await chrome.evaluate(LINE);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'right', buttons: 0, clickCount: 1 });
  return r;
});

const click = (chrome, text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);

if (!process.env.ONLY || process.env.ONLY === 'match') await part('match', async (chrome, shot) => {
  // What a player who moves and aims already knows, stored before the game reads it: Sprint is the next lesson.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('duty-shooter.hints.v1', JSON.stringify({ done: ['move', 'aim', 'loadout', 'scoreboard'], shown: {} }))`,
  });
  await chrome.navigate('http://localhost:5173/?nolock&matchtime=75');
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Team deathmatch', 'Easy', 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  const log = [];
  let before = false;
  let inside = false;
  while (await chrome.evaluate(`duty.driver?.match?.phase === 'playing'`)) {
    const t = await chrome.evaluate(CLOCK);
    const line = await chrome.evaluate(LINE);
    log.push([t, line]);
    if (line && t > 60 && !before) {
      before = true;
      await shot('1-before-last-minute');
    }
    if (t !== null && t < 45 && !inside) {
      inside = true;
      await shot('2-last-minute');
    }
    await sleep(1000);
  }
  return {
    log,
    hintInLastMinute: log.filter(([t, l]) => t !== null && t < 60 && l && !/reload|switch/i.test(l)),
    hintBefore: log.filter(([t, l]) => t !== null && t >= 60 && l).map(([, l]) => l)[0] ?? null,
  };
});

writeFileSync(`${out}/result${process.env.ONLY ? '-' + process.env.ONLY : ''}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ range: result.range && { ...result.range, errors: undefined }, match: result.match && { before: result.match.hintBefore, inLast: result.match.hintInLastMinute, failure: result.match.failure } }));
