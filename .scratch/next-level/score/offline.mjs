// The Practice Range keeps no Score: a dummy's kill still gets its line beside
// the crosshair (without a figure), and nothing is banked in the Profile.
//
//   node .scratch/next-level/score/offline.mjs [out dir]
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/score/shots';
mkdirSync(out, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; globalThis.WebSocket = new Proxy(Real, { construct(target, args) {
  const p = args[1]; if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
  return new target(...args); } }); })()`;
const chrome = await launchChrome({ profile: mkdtempSync(join(tmpdir(), 'duty-range-')) });
const report = { errors: [] };
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate('http://localhost:5173/?explore=range&nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game?.player?.alive && globalThis.duty?.driver', 120_000))) throw new Error('the range did not start');
  await sleep(1500);
  report.online = await chrome.evaluate('duty.driver.online');
  report.others = await chrome.evaluate('duty.driver.others(1).map((o) => [o.id, o.alive, o.position.map((n) => Math.round(n))])');
  // Looks at the nearest living dummy's head and holds the trigger.
  await chrome.evaluate(`(() => { globalThis.__aim = setInterval(() => {
    const g = duty.game, me = g.player; if (!me) return;
    let to = null, near = 1e9;
    for (const o of duty.driver.others(1)) { if (!o.alive) continue; const d = Math.hypot(o.position[0] - me.position[0], o.position[2] - me.position[2]); if (d < near) { near = d; to = o; } }
    if (!to) return;
    const eye = me.position[1] + me.eyeHeight;
    const dx = to.position[0] - me.position[0], dz = to.position[2] - me.position[2], dy = to.position[1] + to.eyeHeight + 0.08 - eye;
    const a = g.input.angles;
    g.input.setAngles(Math.atan2(-dx, -dz) - Math.atan2(Math.sin(me.yaw - a.yaw), Math.cos(me.yaw - a.yaw)), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - a.pitch));
  }, 8); })()`);
  await sleep(300);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'left', clickCount: 1 });
  let lines = [];
  for (let i = 0; i < 150 && lines.length === 0; i++) {
    await sleep(80);
    lines = await chrome.evaluate(`[...document.querySelectorAll('.ds-score .lines div')].map((e) => e.innerHTML)`);
  }
  const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/range-kill-1920.png`, Buffer.from(shot.result.data, 'base64'));
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', clickCount: 1 });
  report.lines = lines;
  report.total = await chrome.evaluate(`document.querySelector('.ds-score .total')?.className + ' / ' + document.querySelector('.ds-score .total')?.textContent`);
  await sleep(1000);
  report.stored = await chrome.evaluate(`localStorage.getItem('duty-shooter.profile.v2')`);
} catch (e) {
  report.error = String(e);
}
report.errors.push(...chrome.errors.slice(0, 8));
await chrome.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.error ? 1 : 0);
