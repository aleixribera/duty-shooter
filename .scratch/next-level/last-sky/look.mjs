// node look.mjs <out dir>   The last minute's sky (ticket 100): a 70 s Bot Match on Survival Town shot with 58, 55, 30, 10 and 3 s left,
// from one fixed spot (the player stands still), then 1, 4 and 9 s after the clock runs out (AFTER). The sky sample (x 1200-1500, y 150-250) is measured as ticket 100 says.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'last-sky';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const chrome = await launchChrome();
const shot = async (name) => {
  const data = (await chrome.send("Page.captureScreenshot", { format: "png" })).result.data;
  writeFileSync(`${OUT}/${name}-${W}.png`, Buffer.from(data, 'base64'));
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock&matchtime=${process.env.SECONDS ?? 70}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 90000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  for (const p of ['Bot Match', 'Survival Town', process.env.MODE ?? 'Free-for-all', 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
  const left = () => chrome.evaluate(`(() => { const m = duty.driver?.match; return m && m.phase === 'playing' && m.phaseEnds != null ? Math.min(m.timeLimit, m.phaseEnds - duty.driver.serverTime) : -1; })()`);
  const said = [];
  for (const at of (process.env.AT ?? '58,55,30,10,3').split(',').map(Number)) {
    while ((await left()) > at) await sleep(20);
    const t = await left();
    if (t < 0) break;
    await shot(`left-${String(at).replace('.', '_')}`);
    said.push({ at, t: Math.round(t * 100) / 100, clock: await chrome.evaluate(`document.querySelector('.ds-match .mid')?.innerText ?? null`), toast: await chrome.evaluate(`document.querySelector('.ds-toast')?.innerText ?? null`) });
  }
  // The ending: the bomb under the last minute's sky, then the scoreboard as it clears.
  for (const after of (process.env.AFTER ?? '1,4,9').split(',').map(Number)) {
    const end = await chrome.evaluate(`(() => { const m = duty.driver?.match; return m ? { phase: m.phase, t: duty.driver.serverTime } : null; })()`);
    if (!end || end.phase === 'playing') { await sleep(100); }
    await sleep(after * 1000 - (Number(process.env.AFTER_DONE ?? 0)));
    process.env.AFTER_DONE = String(after * 1000);
    await shot(`end-${after}`);
    said.push({ after, phase: await chrome.evaluate(`duty.driver?.match?.phase ?? null`) });
  }
  console.log(JSON.stringify({ said, lines: await chrome.evaluate(`JSON.stringify(globalThis.duty?.spoken ?? null)`), errors: chrome.errors.slice(0, 5) }, null, 1));
} finally { await chrome.close(); }
