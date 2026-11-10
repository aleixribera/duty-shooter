// node drain152.mjs <out dir>   The real low-health path: a free-for-all Bot Match, shot the moment the player is alive under 30 health.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'drain152';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const chrome = await launchChrome();
const shot = async (name) => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://localhost:5199/?nolock&matchtime=300`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 90000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  for (const p of ['Bot Match', 'Survival Town', 'Free-for-All', 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
  await shot('full');
  let got = 0;
  const log = [];
  for (let i = 0; i < 4000 && got < 3; i++) {
    const h = await chrome.evaluate(`duty.game.player.alive ? duty.game.player.health : -1`);
    if (h > 0 && h < 30) {
      await sleep(350);
      const h2 = await chrome.evaluate(`duty.game.player.alive ? duty.game.player.health : -1`);
      if (h2 > 0 && h2 < 30) { await shot(`low-${got++}`); log.push(Math.round(h2)); await sleep(1500); }
    }
    await sleep(40);
  }
  console.log(JSON.stringify({ log, errors: chrome.errors.slice(0, 5) }));
} finally { await chrome.close(); }
