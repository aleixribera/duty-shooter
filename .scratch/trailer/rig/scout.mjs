// Scouting: renders a still for each camera pose in a JSON file, on one map, in one browser.
//   node scout.mjs <map> <poses.json> <out dir> [--match tdm] [--wait <s of play before the stills>]
// poses.json: [{ "name": "a", "position": [x,y,z], "target": [x,y,z], "fov": 40 }, ...]
// (or "yaw"/"pitch" instead of "target"). Writes <out>/<name>.jpg and <out>/sheet.jpg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [map, posesPath, outArg, ...rest] = process.argv.slice(2);
const opt = (n, d) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : d);
const poses = JSON.parse(readFileSync(posesPath, 'utf8'));
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const mode = opt('--match', null);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', 'station-nine': 'Station Nine', tdm: 'Team deathmatch', ffa: 'Free-for-all' };
const chrome = await launchChrome();
const ev = async (expr) => {
  const r = await chrome.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const click = (text) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, 'vt-shim.js'), 'utf8') });
  await chrome.navigate(`http://localhost:5173/?nolock&hz=144&map=${map}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 180_000))) throw new Error('no game');
  await ev(readFileSync(join(here, 'cine.js'), 'utf8'));
  await sleep(3000);
  if (mode) {
    for (const p of ['Bot Match', NAMES[map], NAMES[mode], 'Mixed teams', 'Start']) {
      if (!(await click(p))) throw new Error(`no ${p}`);
      await sleep(300);
    }
    await chrome.waitFor(`duty.game.driver?.match?.phase === 'playing'`, 240_000);
    await sleep(Number(opt('--wait', 5)) * 1000);
  } else await ev('duty.menu.hide()');
  await sleep(6000);
  await ev(`(() => { const s = document.createElement('style'); s.textContent = 'body > *:not(#view) { visibility: hidden !important; }'; document.head.append(s); })()`);
  await ev('__vt.start(1)');
  const names = [];
  for (const p of poses) {
    const cam = p.target ? `cine.shot(${JSON.stringify(p.position)}, ${JSON.stringify(p.target)}, ${p.fov ?? 40})` : `({ position: ${JSON.stringify(p.position)}, yaw: ${p.yaw}, pitch: ${p.pitch}, roll: 0, fov: ${p.fov ?? 40} })`;
    for (let i = 0; i < 24; i++) await ev(`duty.game.previewEnding = ${p.ending ?? null}; duty.game.cinema = ${cam}; __vt.step(1000/60)`);
    await ev('duty.renderer.backend.device?.queue.onSubmittedWorkDone()');
    const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(join(out, `${p.name}.jpg`), Buffer.from(r.result.data, 'base64'));
    names.push(p.name);
  }
  const ff = process.env.FFMPEG ?? 'ffmpeg';
  const cols = 3;
  const inputs = names.flatMap((n) => ['-i', join(out, `${n}.jpg`)]);
  const labelled = names.map((n, i) => `[${i}]scale=640:360,drawtext=text='${n}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[l${i}]`).join(';');
  const pad = (cols - (names.length % cols)) % cols;
  const tiles = names.map((_, i) => `[l${i}]`).join('') + Array.from({ length: pad }, (_, i) => `[p${i}]`).join('');
  const pads = Array.from({ length: pad }, (_, i) => `color=black:s=640x360:d=1[p${i}]`).join(';');
  const rows = Math.ceil(names.length / cols);
  const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
  execFileSync(ff, ['-v', 'error', '-y', ...inputs, '-filter_complex', `${labelled}${pad ? ';' + pads : ''};${tiles}xstack=inputs=${rows * cols}:layout=${layout}`, '-frames:v', '1', join(out, 'sheet.jpg')]);
  console.log('sheet', join(out, 'sheet.jpg'), JSON.stringify(chrome.errors.slice(0, 3)));
} finally {
  await chrome.close();
}
