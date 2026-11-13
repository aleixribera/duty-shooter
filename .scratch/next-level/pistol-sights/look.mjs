// Request 2 reopened (the pistol's model and sights take too much of the screen): in the Practice Range, the Warden 9
// at hip and aimed down its sights on the 10 m dummy, desktop or phone; then the same two poses looking up at open sky
// with the HUD hidden, where every dark pixel is the gun or the hands, to measure how much of the view they take.
//   node .scratch/next-level/pistol-sights/look.mjs <out dir> [WxH] [weapon]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [WxH] [weapon]');
const [W, H] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const GUN = process.argv[4] ?? 'pistol';
mkdirSync(out, { recursive: true });
const AIM = (id, height = 0.72) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * ${height} - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const SKY = `(() => { const g = duty.game, me = g.player, look = g.input.angles; g.input.setAngles(look.yaw, 1.25 - (me.pitch - look.pitch)); })()`;
// Counts the dark pixels of the frame (the sky and clouds are bright, the gun and hands dark): the share of the view
// they cover, the highest row they reach, and their widest extent across, as fractions of the frame.
const MEASURE = (png) => `(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,${png}';
  await img.decode();
  const w = 480, h = Math.round(480 * img.height / img.width);
  const o = new OffscreenCanvas(w, h), x = o.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let dark = 0, top = h, left = w, right = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, lum = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    if (lum < 140) { dark++; if (j < top) top = j; if (i < left) left = i; if (i > right) right = i; }
  }
  return { cover: +(dark / (w * h)).toFixed(4), top: +(top / h).toFixed(3), left: +(left / w).toFixed(3), right: +(right / w).toFixed(3) };
})()`;
const chrome = await launchChrome();
const key = async (code, k, vk) => {
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
};
const mouse = (type, button) =>
  chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button, buttons: type === 'mousePressed' ? 2 : 0, clickCount: 1 });
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(`${out}/${name}-${W}.jpg`, Buffer.from(s.result.data, 'base64'));
};
try {
  if (W !== 1920) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&at=-56,-2,0&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(4000);
  const secondary = GUN === 'pistol' || GUN === 'revolver';
  await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify(secondary ? { primary: 'm4a1', secondary: GUN, grenade: 'frag' } : { primary: GUN, secondary: 'pistol', grenade: 'frag' })})`);
  await sleep(3000);
  if (secondary) await key('Digit2', '2', 50);
  await sleep(1800);
  const result = { weapon: await chrome.evaluate('duty.game.player.weapon.id'), size: `${W}x${H}` };
  for (const ads of [false, true]) {
    const pose = ads ? 'ads' : 'hip';
    await chrome.evaluate(AIM('dummy-10'));
    if (ads) await mouse('mousePressed', 'right');
    await sleep(1500);
    await chrome.evaluate(AIM('dummy-10'));
    await sleep(300);
    await shot(`${GUN}-${pose}`);
    await chrome.evaluate(SKY);
    await chrome.evaluate(`(() => { const s = document.createElement('style'); s.id = '__nohud'; s.textContent = 'body * { visibility: hidden !important } canvas { visibility: visible !important }'; document.head.append(s); const cs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height); cs.slice(1).forEach((c) => c.style.setProperty('visibility', 'hidden', 'important')); })()`);
    await sleep(700);
    await shot(`${GUN}-${pose}-sky`);
    const png = await chrome.send('Page.captureScreenshot', { format: 'png' });
    result[pose] = await chrome.evaluate(MEASURE(png.result.data));
    await chrome.evaluate(`(document.getElementById('__nohud')?.remove(), document.querySelectorAll('canvas').forEach((c) => c.style.removeProperty('visibility')))`);
    if (ads) await mouse('mouseReleased', 'right');
  }
  result.errors = chrome.errors.slice(0, 5);
  writeFileSync(`${out}/result-${GUN}-${W}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await chrome.close();
}
