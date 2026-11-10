// node nade152b.mjs <out dir>   The grenade indicator staged: three grenades put into the driver's list (ahead and far,
// left and lethal, behind with its fuse nearly out), shot at 1920 and at a phone's landscape. Then a real one at your feet.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'nade152';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const size = (w, h) => chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
const look = (x, y) => chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${x}, movementY: ${y}, bubbles: true }))`);
const marks = `JSON.stringify({ n: document.querySelectorAll('.ds-nades .w').length, cls: [...document.querySelectorAll('.ds-nades .w')].map((e) => e.className + ' ' + e.style.transform), g: duty.driver.grenades().map((g) => ({ at: g.position.map((v) => Math.round(v * 10) / 10), fuse: Math.round((g.explodeAt - duty.driver.serverTime) * 100) / 100, resting: g.resting })), yaw: duty.game.player.yaw, pitch: duty.game.player.pitch, health: Math.round(duty.game.player.health), alive: duty.game.player.alive })`;
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await size(1920, 1080);
  await chrome.navigate(`http://localhost:5199/?explore=survival-town&nolock`);
  await chrome.waitFor('globalThis.duty?.game?.player', 120000);
  await sleep(6000);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await sleep(1500);
  // Staged: the driver's own list replaced for a moment. Yaw 0 looks along -z.
  await chrome.evaluate(`(() => { const d = duty.driver, real = d.grenades.bind(d); globalThis.__realGrenades = real; d.grenades = () => { const p = duty.game.player.position, t = d.serverTime; const g = (id, dx, dz, fuse) => ({ id, thrower: 'them', team: 9, position: [p[0] + dx, p[1] + 0.05, p[2] + dz], velocity: [0, 0, 0], explodeAt: t + fuse, resting: true }); return [g(9001, 0.5, -6, 2.5), g(9002, -2, 0, 3), g(9003, 3, 5, globalThis.__fuse ?? 0.9)]; }; })()`);
  await sleep(300);
  console.log('staged', await chrome.evaluate(marks));
  await shot('nade-staged-1920');
  await size(844, 390);
  await sleep(300);
  await shot('nade-staged-844');
  await size(390, 844);
  await sleep(300);
  await shot('nade-staged-390');
  await size(1920, 1080);
  await chrome.evaluate(`duty.driver.grenades = globalThis.__realGrenades`);
  await sleep(300);
  console.log('cleared', await chrome.evaluate(marks));
  // A real one at your feet.
  await look(0, 4000);
  await sleep(400);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyG', key: 'g', windowsVirtualKeyCode: 71 });
  await sleep(150);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyG', key: 'g', windowsVirtualKeyCode: 71 });
  let shots = 0;
  for (let i = 0; i < 50; i++) {
    const s = await chrome.evaluate(marks);
    if (i % 3 === 0 || JSON.parse(s).n > 0) console.log(s.slice(0, 300));
    if (JSON.parse(s).n > 0 && shots++ === 0) await shot('nade-real-1920');
    await sleep(100);
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally { await chrome.close(); }
