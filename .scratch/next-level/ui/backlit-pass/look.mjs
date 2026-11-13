// PLAN item 1b (Backlit UI): frames of the main menu and a match's HUD at desktop, phone sideways and phone upright.
//   node .scratch/next-level/ui/backlit-pass/look.mjs <out dir> [screens]   (dev server on :5173)
// screens: comma list of menu, settings (with menu), hud (default menu,hud). The world is paused once the frame is up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [screens]');
const screens = (process.argv[3] ?? 'menu,hud').split(',');
mkdirSync(out, { recursive: true });
const SIZES = [
  [1920, 1080, false],
  [844, 390, true],
  [390, 844, true],
];
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const [W, H, mobile] of SIZES) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (screens.includes('menu')) {
      await chrome.navigate(`http://localhost:5173/?nolock`);
      if (!(await chrome.waitFor(`globalThis.duty?.game && globalThis.duty?.menu?.open`, 180_000, 500))) throw new Error('menu did not open');
      await sleep(9000);
      await shot(`menu-${W}x${H}`);
      // The second row under the pointer: lit at half.
      const at = await chrome.evaluate(`(() => { const r = document.querySelectorAll('.ds-dest')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0], y: at[1] });
      await sleep(400);
      await shot(`menu-focus-${W}x${H}`);
      if (screens.includes('settings')) {
        await chrome.evaluate(`[...document.querySelectorAll('.ds-more button')].find((b) => b.textContent === 'Settings').click()`);
        await sleep(800);
        await shot(`settings-${W}x${H}`);
      }
    }
    if (screens.includes('hud')) {
      await chrome.navigate(`http://localhost:5173/?explore=survival-town&nolock`);
      if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 180_000, 500))) throw new Error('match did not start');
      await sleep(4000);
      await shot(`hud-${W}x${H}`);
    }
  }
} finally {
  await chrome.close();
}
