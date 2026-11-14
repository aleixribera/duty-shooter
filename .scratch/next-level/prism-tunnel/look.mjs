// Ticket 102, the Prism tunnel (pass 62): each sight laid on the 25 m target's chest in the Practice Range, one ADS frame each.
//   node .scratch/next-level/prism-tunnel/look.mjs <out dir> [gun:optic,...] [width x height]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [gun:optic,...] [WxH]');
const SIGHTS = (process.argv[3] ?? 'm4a1:none,m4a1:reflex,m4a1:prism,dmr:none,sniper:none').split(',').map((s) => s.split(':'));
const [W, H] = (process.argv[4] ?? '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });
const AIM = (id) => `(() => {
  const g = duty.game, me = g?.player, t = g?.driver?.others(0).find((p) => p.id === ${JSON.stringify(id)});
  if (!me || !t) return null;
  const eye = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
  const dx = t.position[0] - eye[0], dy = t.position[1] + t.eyeHeight * 0.78 - eye[1], dz = t.position[2] - eye[2];
  const look = g.input.angles;
  g.input.setAngles(Math.atan2(-dx, -dz) - (me.yaw - look.yaw), Math.atan2(dy, Math.hypot(dx, dz)) - (me.pitch - look.pitch));
  return Math.round(Math.hypot(dx, dz));
})()`;
const chrome = await launchChrome();
try {
  if (W !== 1920) await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(4000);
  const log = [];
  for (const [gun, optic] of SIGHTS) {
    const attachments = optic === 'none' ? {} : { primary: { optic } };
    await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: gun, secondary: 'pistol', grenade: 'frag', attachments })})`);
    await sleep(3200);
    await chrome.evaluate(AIM('dummy-25'));
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'right', buttons: 2, clickCount: 1 });
    await sleep(1500);
    const dist = await chrome.evaluate(AIM('dummy-25'));
    await sleep(200);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(`${out}/${gun}-${optic}.jpg`, Buffer.from(s.result.data, 'base64'));
    // Five shots, laid again on the chest before each, then the range's own count.
    for (let i = 0; i < 5; i++) {
      await chrome.evaluate(AIM('dummy-25'));
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'left', buttons: 3, clickCount: 1 });
      await sleep(80);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'left', buttons: 2, clickCount: 1 });
      await sleep(gun === 'sniper' ? 1400 : 350);
    }
    const hits = await chrome.evaluate(`document.querySelector('.shots')?.textContent ?? null`);
    log.push({ gun, optic, dist, hits });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(500);
  }
  console.log(JSON.stringify({ log, errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
