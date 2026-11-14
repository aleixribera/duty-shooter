// Pass 73 (review 14c, "Bodies that aren't soldiers"): a soldier under fire washed flat red. In the Practice Range,
// the M4A1 held on the 10 m dummy's chest on full auto: frames mid-burst and just after, and the body's emissive red
// (the hit flash) read from the page at each frame.
//   node .scratch/next-level/hit-flash/look.mjs <out dir>   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const AIM = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.72 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(5000);
  const runs = [];
  for (const run of [0, 1]) {
    await chrome.evaluate(AIM('dummy-10'));
    await sleep(1500);
    await mouse('mousePressed');
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) {
      await chrome.evaluate(AIM('dummy-10'));
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 760, y: 280, width: 400, height: 600, scale: 1 } });
      writeFileSync(`${out}/${run}-burst-${i}.jpg`, Buffer.from(s.result.data, 'base64'));
      runs.push({ run, frame: i, ms: Date.now() - t0 });
    }
    await mouse('mouseReleased');
    await sleep(150);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(`${out}/${run}-after-150ms.jpg`, Buffer.from(s.result.data, 'base64'));
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
    await sleep(5000);
  }
  const result = { runs, shots: await chrome.evaluate(`document.querySelector('.shots')?.textContent`), errors: chrome.errors.slice(0, 5) };
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await chrome.close();
}
