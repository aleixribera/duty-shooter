// Ticket 65: frame time and draw calls in a Bot Match (production build, headless muted Chrome),
// the player strafing and firing bursts so its own tracers count too.
//   remote-test --local "node .scratch/battle-royale/t65/botmatch.mjs"
// DIST=dist-before|dist-after (under t65), MAP=switchyard, MODE=tdm, PLAY=40, QUERY=webgl.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 5341);
const PLAY = Number(process.env.PLAY ?? 40);
const MAP = process.env.MAP ?? 'switchyard';
const MODE = process.env.MODE ?? 'tdm';
const DIST = process.env.DIST ?? 'dist-after';
const TAG = process.env.TAG ?? `${DIST}-${MAP}-${process.env.QUERY ?? 'webgpu'}`;
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', crash: 'Crash', tdm: 'Team deathmatch', ffa: 'Free-for-all' };
const out = '.scratch/battle-royale/t65/results';
mkdirSync(out, { recursive: true });
const vite = spawn(process.execPath, [`${process.cwd()}/node_modules/vite/bin/vite.js`, 'preview', '--outDir', `${process.cwd()}/.scratch/battle-royale/t65/${DIST}`, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: 'apps/range', stdio: ['ignore', 'ignore', 'inherit'] });
const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)));
  const perf = (globalThis.__perf = { frames: null });
  perf.start = () => { const t = []; perf.frames = t; let last = performance.now(); const f = (now) => { if (perf.frames !== t) return; t.push(now - last); last = now; requestAnimationFrame(f); }; requestAnimationFrame(f); };
  perf.stop = () => { const t = perf.frames ?? []; perf.frames = null; return t; };
})();`;
let chrome;
let failed = false;
try {
  for (let i = 0; ; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok).catch(() => false)) break;
    if (i > 200) throw new Error('preview did not start');
    await sleep(300);
  }
  chrome = await launchChrome();
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  await chrome.navigate(`http://127.0.0.1:${PORT}/?stats${process.env.QUERY ? `&${process.env.QUERY}` : ''}`);
  for (let i = 0; (await chrome.evaluate('location.protocol').catch(() => '')) !== 'http:'; i++) {
    if (i > 300) throw new Error('page did not commit');
    await sleep(100);
  }
  const click = (text) => ev(`const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true;`);
  for (let i = 0; !(await click('Bot Match')); i++) {
    if (i > 600) throw new Error('no Bot Match button');
    await sleep(100);
  }
  await sleep(400);
  for (const p of [NAMES[MAP], NAMES[MODE], ...(MODE === 'ffa' ? [] : ['Mixed teams']), 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  // The production build has no duty hook: wait for the HUD's match clock instead.
  for (let i = 0; !(await ev(`return !!document.body.dataset.render`)); i++) {
    if (i > 1800) throw new Error('match did not start');
    await sleep(100);
  }
  await sleep(6000);
  const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
  await chrome.evaluate(`document.querySelector('canvas')?.click()`);
  await key('keyDown', 'KeyW');
  await chrome.evaluate('__perf.start()');
  const render = [];
  const started = Date.now();
  for (let t = 0; Date.now() - started < PLAY * 1000; t++) {
    const side = t % 2 === 0 ? 'KeyA' : 'KeyD';
    await key('keyDown', side);
    await mouse('mousePressed');
    await sleep(1200);
    await mouse('mouseReleased');
    await key('keyUp', side);
    render.push(await ev(`return document.body.dataset.render ? JSON.parse(document.body.dataset.render) : null`));
    if (t === 6) {
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
      writeFileSync(`${out}/${TAG}.jpg`, Buffer.from(s.result.data, 'base64'));
    }
    await sleep(800);
  }
  const frames = await ev('return __perf.stop()');
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const r = render.filter(Boolean);
  const mean = (k) => Math.round(r.reduce((s, x) => s + x[k], 0) / Math.max(1, r.length));
  const report = { tag: TAG, frames: frames.length, frameMs: { mean: +(frames.reduce((s, f) => s + f, 0) / frames.length).toFixed(2), p50: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(2), worst: +q(1).toFixed(1) }, draws: mean('draws'), maxDraws: Math.max(...r.map((x) => x.maxDraws)), triangles: mean('triangles'), errors: await ev('return globalThis.__errors ?? []') };
  console.log(`REPORT ${JSON.stringify(report)}`);
  writeFileSync(`${out}/${TAG}.json`, JSON.stringify(report, null, 2));
} catch (e) {
  failed = true;
  console.error(e);
  try {
    writeFileSync(`${out}/${TAG}-fail.jpg`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data, 'base64'));
  } catch {}
} finally {
  await chrome?.close().catch(() => {});
  vite.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
