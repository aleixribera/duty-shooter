// node look.mjs <out dir> [runs]   A match's opening (ticket 100): Station Nine Free-for-all Bot Matches (MODE=, MAP= to change), the player
// standing still. Each run: a frame as the countdown ends and 2 s into play, and the clock when the kill feed shows its first kill.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'first-blood';
const RUNS = Number(process.argv[3] ?? 3);
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const chrome = await launchChrome();
const shot = async (name) => {
  const data = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data;
  writeFileSync(`${OUT}/${name}-${W}.jpg`, Buffer.from(data, 'base64'));
};
const results = [];
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 800 });
  for (let run = 1; run <= RUNS; run++) {
    await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock`);
    if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 120000))) throw new Error('page did not start');
    await sleep(1500);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
    for (const p of ['Bot Match', process.env.MAP ?? 'Station Nine', process.env.MODE ?? 'Free-for-all', 'Start']) {
      if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
      await sleep(400);
    }
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
    // Into play: the countdown's end, then 2 s on.
    const counting = `(() => { const m = duty.driver?.match; return m?.countdownEnds != null && m.countdownEnds > duty.driver.serverTime; })()`;
    while (await chrome.evaluate(counting)) await sleep(15);
    const t0 = await chrome.evaluate('duty.driver.serverTime');
    await shot(`run${run}-t0`);
    const feed = `document.querySelector('.ds-feed')?.innerText.trim() || ''`;
    let first = null;
    let shot2 = false;
    while (!first) {
      const t = (await chrome.evaluate('duty.driver.serverTime')) - t0;
      if (!shot2 && t >= 2) {
        await shot(`run${run}-t2`);
        shot2 = true;
      }
      const text = await chrome.evaluate(feed);
      if (text) first = { at: Math.round(t * 10) / 10, feed: text.split('\n').slice(0, 2).join(' | ') };
      else if (t > 20) first = { at: null, feed: 'none in 20 s' };
      else await sleep(30);
    }
    results.push({ run, first });
  }
  console.log(JSON.stringify({ results, errors: chrome.errors.slice(0, 5) }, null, 1));
} finally {
  await chrome.close();
}
