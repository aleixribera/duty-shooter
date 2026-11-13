// Review 2026-11-13b: on Switchyard, the B and A markers pinned to the screen's left edge print one over the other (11-kill-2b).
// Starts a Switchyard Outposts (or Charge) Bot Match at 1920x1080 and turns the player through a full circle, logging
// each objective marker's box on screen; saves a frame wherever two markers share an edge, and reports any overlap.
//   node .scratch/next-level/edge-markers/look.mjs <out dir> [outposts|charge] [width height]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const [out, mode = 'outposts', W = '1920', H = '1080'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` });
  if (r.result?.result?.value !== true) throw new Error(`no "${text}" button`);
  await sleep(300);
};
const BOXES = `JSON.stringify([...document.querySelectorAll('.ds-marker')].filter((m) => m.getClientRects().length).map((m) => { const r = m.getBoundingClientRect(); return { t: m.innerText.replace(/\s+/g, ' '), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }))`;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 768 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`http://localhost:5173/?nolock&seed=3`);
  await chrome.waitFor('!!globalThis.duty?.game', 120_000);
  await sleep(2000);
  for (const t of ['Bot Match', 'Switchyard', mode === 'charge' ? 'Charge' : 'Outposts', 'Start']) await click(t);
  await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000, 500);
  await sleep(1500 + Number(process.env.DELAY ?? 0)); // DELAY=<ms> starts the turn after the countdown card
  let worst = 0, shots = 0;
  for (let deg = 0; deg < 360; deg += 15) {
    await chrome.evaluate(`duty.game.input.setAngles(${(deg * Math.PI) / 180}, 0), 1`);
    await sleep(400);
    const boxes = JSON.parse(await chrome.evaluate(BOXES));
    let overlap = 0, edge = false;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0) overlap = Math.max(overlap, ox * oy);
        if (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 70) edge = true; // stacked: these would have covered each other
      }
    worst = Math.max(worst, overlap);
    console.log(deg, overlap ? `OVERLAP ${overlap}px²` : 'clear', boxes.map((b) => `${b.t}@${b.x},${b.y}`).join(' | '));
    if ((edge || overlap) && shots < 4) {
      const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      writeFileSync(`${out}/${mode}-${W}-${deg}.jpg`, Buffer.from(r.result.data, 'base64'));
      shots++;
    }
  }
  console.log('worst overlap', worst, 'errors', chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
