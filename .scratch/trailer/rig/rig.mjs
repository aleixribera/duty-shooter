// Renders one trailer shot frame by frame on virtual time (vt-shim.js), with a film camera
// (game.cinema) driven by the shot's camera function, and saves the frames inside each
// 24 fps frame's shutter, plus every sound the game played, for the mix.
//
//   node .scratch/trailer/rig/rig.mjs <shot.mjs> [--preview] [--out <dir>] [--from <s>] [--to <s>]
//
// Needs the dev server on :5173. --preview: 960x540, one capture per frame, 12 fps.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const shotPath = resolve(argv[0]);
const flag = (name) => argv.includes(name);
const opt = (name, d) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const shot = (await import(pathToFileURL(shotPath).href)).default;
const preview = flag('--preview');
const name = shot.name ?? shotPath.replace(/.*[\\/]/, '').replace(/\.mjs$/, '');
const out = resolve(opt('--out', join(here, '..', 'renders', preview ? `${name}-preview` : name)));
const fps = preview ? 12 : (shot.fps ?? 24);
const sub = preview ? 1 : (shot.sub ?? 6); // steps per output frame
const shutter = preview ? 1 : (shot.shutter ?? 3); // of those, the ones captured and blended (180 degrees)
const width = preview ? 960 : (shot.width ?? 1920);
const height = preview ? 402 : (shot.height ?? 804);
const scale = preview ? 1 : (shot.scale ?? 1); // device pixel ratio: above 1 supersamples
const from = Number(opt('--from', 0));
const to = Number(opt('--to', shot.seconds));
const BASE = process.env.BASE ?? 'http://localhost:5173/';

const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const SETTINGS = `localStorage.setItem('duty-shooter.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? '{}'), name: 'Vance', fpsCap: 0, showFps: false, ...(${JSON.stringify(shot.settings ?? {})}) }))`;
const HIDE_UI = `(() => { const s = document.createElement('style'); s.id = 'trailer-hide'; s.textContent = 'body > *:not(#view) { visibility: hidden !important; } * { cursor: none !important; }'; document.head.append(s); })()`;

const chrome = await launchChrome();
const ev = async (expr) => {
  const r = await chrome.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
  return r.result?.result?.value;
};
const click = (text) =>
  ev(`(() => { const b = [...document.querySelectorAll('button, [role=tab], [role=radio]')].find((b) => b.offsetParent && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', 'station-nine': 'Station Nine', tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };

const t0 = Date.now();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SETTINGS });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(here, 'vt-shim.js'), 'utf8') });
  const params = new URLSearchParams({ nolock: '', hz: '144', map: shot.map, ...(shot.params ?? {}) });
  await chrome.navigate(`${BASE}?${params.toString().replace(/=(&|$)/g, '$1')}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 180_000))) throw new Error('the game did not start');
  await ev(readFileSync(join(here, 'cine.js'), 'utf8'));
  await sleep(3000);
  if (shot.match) {
    const m = shot.match;
    for (const p of ['Bot Match', NAMES[shot.map], NAMES[m.mode ?? 'tdm'], ...(m.hvb ? ['Humans vs bots'] : m.mode === 'ffa' || m.mode === 'gungame' ? [] : ['Mixed teams'])]) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    if (!(await click('Start'))) throw new Error('no Start button');
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' || duty.game.driver?.match?.phase === 'playing'`, 240_000))) throw new Error('the match did not start');
  } else {
    await ev(`duty.menu.hide()`);
  }
  // The baked light and every model in, before the clock stops.
  await sleep((shot.settle ?? 6) * 1000);
  await ev(HIDE_UI);
  // Every sound the game plays, on the shot's clock; gunshots also tell the cameras where the fight is.
  await ev(`(() => {
    globalThis.__sounds = [];
    const s = duty.sound, play = s.play.bind(s);
    s.play = (event, params = {}) => {
      __sounds.push({ t: __vt.t, event, params: JSON.parse(JSON.stringify(params)) });
      if (event === 'gunshot' && params.position) cine.noteShot(__vt.t, params.position);
      play(event, params);
    };
  })()`);
  if (shot.setup) await ev(`(${shot.setup})()`);
  await ev(`__vt.start(${shot.seed ?? 1})`);
  const only = opt('--take', null);
  const takes = (shot.takes ?? [{ ...shot, name }]).map((k) => ({ ...k, name: shot.takes ? `${name}-${k.name}` : name }));
  for (const take of takes) {
    const skip = only && !take.name.endsWith(only);
    const tFrom = take === takes[0] ? from : 0;
    const tTo = take.seconds;
    const speed = take.speed ?? 1;
    await ev(`globalThis.__state = {}; globalThis.__camera = (${take.camera}); 0`);
    await ev(take.drive ? `globalThis.__drive = (${take.drive}); 0` : `globalThis.__drive = null; 0`);
    if (take.before) await ev(`(${take.before})()`);
    // Warm-up: the match plays on before the camera rolls (TAA and exposure settle too).
    const warm = (take.warm ?? 0) + tFrom + (skip ? tTo : 0);
    for (let w = 0; w < warm * 60; w++) {
      const t = -warm + w / 60 + tFrom;
      await ev(`(() => { const t = ${t}; if (__drive) __drive(t); duty.game.cinema = __camera(t, cine, __state); __vt.step(${1000 / 60}); })()`);
      if (w % 30 === 0) await ev(`duty.renderer.backend.device?.queue.onSubmittedWorkDone()`);
    }
    if (skip) continue;
    const dir = takes.length > 1 ? join(dirname(out), `${take.name}${preview ? '-preview' : ''}`) : out;
    await ev(`globalThis.__sounds.length = 0; globalThis.__roll = __vt.t; 0`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const frames = Math.round((tTo - tFrom) * fps);
    const stepMs = (1000 / (fps * sub)) * speed;
    const cameras = [];
    const shotStart = Date.now();
    for (let f = 0; f < frames; f++) {
      for (let s = 0; s < sub; s++) {
        const t = tFrom + (f + s / sub) / fps;
        const cam = await ev(`(() => { const t = ${t}; if (__drive) __drive(t); const c = __camera(t, cine, __state); duty.game.cinema = c; __vt.step(${stepMs}); return ${s === 0} ? c : null; })()`);
        if (cam) cameras.push({ f, ...cam });
        if (s < shutter) {
          await ev(`duty.renderer.backend.device?.queue.onSubmittedWorkDone()`);
          const r = await chrome.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
          if (!r.result?.data) throw new Error(`no screenshot at frame ${f}`);
          writeFileSync(join(dir, `f${String(f).padStart(5, '0')}_${s}.png`), Buffer.from(r.result.data, 'base64'));
        }
      }
      if (f % 48 === 0) console.log(`${take.name}: frame ${f}/${frames}, ${((Date.now() - shotStart) / 1000 / (f + 1)).toFixed(2)} s a frame`);
    }
    // Sound times on the shot's clock in seconds of screen time (slow motion stretches them).
    const sounds = await ev(`__sounds.map((s) => ({ ...s, t: (s.t - __roll) / 1000 / ${speed} + ${tFrom} }))`);
    writeFileSync(join(dir, 'shot.json'), JSON.stringify({ name: take.name, map: shot.map, fps, sub, shutter, width, height, speed, from: tFrom, to: tTo, frames, sounds, cameras }, null, 1));
    console.log(JSON.stringify({ take: take.name, frames, sounds: sounds.length, errors: chrome.errors.slice(0, 5) }));
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
} finally {
  await chrome.close();
}
