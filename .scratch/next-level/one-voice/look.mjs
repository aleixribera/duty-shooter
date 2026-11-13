// node look.mjs <out dir>   One speaker in the slot under the crosshair (ticket 103, pass 2). Three Bot Matches, the player standing
// still: Station Nine Free-for-all (Range Control's opening line against the first hint), Switchyard Charge (the round card
// against the round's words) and Survival Town Team Deathmatch until the player dies (the loadout hint against the prompt plate).
// Every 100 ms it counts the slot's lines on screen (caption, toast, hint) and the prompt plate; frames at the moments that matter.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'one-voice';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
// What stands in the slot: each line's words, if it is on screen.
const SLOT = `(() => {
  const seen = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0.05;
  const t = (sel) => { const el = document.querySelector(sel); return seen(el) ? el.innerText.trim().replace(/\\s+/g, ' ') : null; };
  return { caption: t('.ds-caption.on'), toast: t('.ds-toast'), hint: t('.ds-hintline:not([hidden])'), prompt: t('.ds-prompt:not([hidden])'), card: t('.ds-round') };
})()`;
const chrome = await launchChrome();
const shot = async (name) => {
  const data = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data;
  writeFileSync(`${OUT}/${name}-${W}.jpg`, Buffer.from(data, 'base64'));
};
const report = {};
async function match(map, mode) {
  await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 120000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  for (const p of ['Bot Match', map, mode, 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
}
// Samples the slot for `seconds` (or until `until` holds), keeping the most lines seen at once and every distinct line.
async function watch(name, seconds, until = null, shots = {}) {
  const t0 = Date.now();
  let most = 0, worst = null;
  const lines = new Set();
  const taken = new Set();
  while ((Date.now() - t0) / 1000 < seconds) {
    const s = await chrome.evaluate(SLOT);
    const n = [s.caption, s.toast, s.hint].filter(Boolean).length;
    for (const k of ['caption', 'toast', 'hint', 'prompt']) if (s[k]) lines.add(`${k}: ${s[k]}`);
    if (n > most) (most = n), (worst = s);
    for (const [k, test] of Object.entries(shots)) if (!taken.has(k) && test(s)) taken.add(k), await shot(`${name}-${k}`);
    if (until && (await chrome.evaluate(until))) break;
    await sleep(100);
  }
  report[name] = { mostAtOnce: most, worst, lines: [...lines] };
}
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 800 });
  await match('Station Nine', 'Free-for-all');
  await watch('ffa', 14, null, { caption: (s) => s.caption, hint: (s) => s.hint });
  if (process.env.ONLY === 'ffa') {
    report.hintBox = await chrome.evaluate(`(() => { const el = document.querySelector('.ds-hintline'); const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return { left: r.left, right: r.right, transform: c.transform, maxWidth: c.maxWidth, width: c.width }; })()`);
    console.log(JSON.stringify({ report, errors: chrome.errors.slice(0, 5) }, null, 1));
    process.exit(0);
  }
  await match('Switchyard', 'Charge');
  await watch('charge', 12, null, { card: (s) => s.card, live: (s) => !s.card && (s.caption || s.toast || s.hint) });
  await match('Survival Town', 'Team Deathmatch');
  await watch('tdm', 90, `duty.game.player && !duty.game.player.alive && document.querySelector('.ds-hintline:not([hidden])') !== null`, { dead: (s) => s.hint && /loadout/i.test(s.hint) });
  await sleep(300);
  await shot('tdm-dead-end');
  report.tdmDeadSlot = await chrome.evaluate(SLOT);
  console.log(JSON.stringify({ report, errors: chrome.errors.slice(0, 5) }, null, 1));
} finally {
  await chrome.close();
}
