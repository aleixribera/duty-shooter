// node mood152.mjs <out dir>   The last minute seen: a 100 s free-for-all Bot Match shot at 1920 with 80, 45, 20, 8 and 3 s left,
// from one fixed spot (the player stands still), and at 390 wide for the clock.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'mood152';
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
  await chrome.navigate(`http://localhost:5199/?nolock&matchtime=${process.env.SECONDS ?? 100}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 90000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  for (const p of ['Bot Match', 'Survival Town', process.env.MODE ?? 'Team Deathmatch', 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
  const left = () => chrome.evaluate(`(() => { const m = duty.driver?.match; return m && m.phase === 'playing' && m.phaseEnds != null ? Math.min(m.timeLimit, m.phaseEnds - duty.driver.serverTime) : -1; })()`);
  const said = [];
  for (const at of (process.env.AT ?? '80,58,45,20,8.95,8.5,3').split(',').map(Number)) {
    while ((await left()) > at) await sleep(20);
    const t = await left();
    if (t < 0) break;
    await shot(`left-${String(at).replace('.', '_')}`);
    said.push({ at, t: Math.round(t * 100) / 100, clock: await chrome.evaluate(`document.querySelector('.ds-match .mid')?.innerText ?? null`), toast: await chrome.evaluate(`document.querySelector('.ds-toast')?.innerText ?? null`) });
  }
  console.log(JSON.stringify({ said, lines: await chrome.evaluate(`JSON.stringify(globalThis.duty?.spoken ?? null)`), errors: chrome.errors.slice(0, 5) }, null, 1));
} finally { await chrome.close(); }
