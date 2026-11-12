// Renders one trailer shot frame by frame on a virtual clock: the page's
// performance.now and requestAnimationFrame are the script's, so every frame
// is exactly 1/fps of game time apart however slow this machine draws it.
// The game's simulation ticks from the render loop, so bots, bullets and the
// nuke all run on the same clock. Each frame is a JPEG; the sounds the game
// asked for (with the listener's pose at that moment) go to sounds.json, for
// render-audio.mjs to render in step with the pictures.
//
//   node apps/range/scripts/trailer/capture.mjs <shot name> <out dir> [base url]
//
// Shots live in shots.mjs. Needs the dev server. Headless and muted (chrome.mjs).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../chrome.mjs';
import { CAMERA_LIB } from './camera-lib.mjs';
import { SHOTS } from './shots.mjs';

const [name, out, base = 'http://localhost:5173/'] = process.argv.slice(2);
const shot = SHOTS[name];
if (!shot || !out) {
  console.error(`usage: node capture.mjs <${Object.keys(SHOTS).join('|')}> <out dir> [base url]`);
  process.exit(2);
}
// FPS=<n> overrides the shot's rate, for a quick look at a move before the real render.
const fps = Number(process.env.FPS ?? shot.fps ?? 60);
const width = Number(process.env.WIDTH ?? 1920);
const height = Number(process.env.HEIGHT ?? 1080);
const frames = `${out}/frames`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

// Put in place before the page's own scripts: the virtual clock (off until `freeze`), deafness to Vite's hot
// reloads (other sessions edit the source while a shot renders), and a page with nothing over the picture.
const SHIM = `(() => {
  const Real = WebSocket;
  const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'));
  globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } });
  const realNow = performance.now.bind(performance);
  const realRaf = requestAnimationFrame.bind(globalThis);
  const realCancel = cancelAnimationFrame.bind(globalThis);
  let virtual = null;
  let queue = new Map();
  let nextId = 1;
  performance.now = () => (virtual ?? realNow());
  globalThis.requestAnimationFrame = (cb) => {
    if (virtual === null) return realRaf((t) => cb(virtual ?? t));
    const id = nextId++;
    queue.set(id, cb);
    return -id;
  };
  globalThis.cancelAnimationFrame = (id) => (id < 0 ? queue.delete(-id) : realCancel(id));
  globalThis.__cine = {
    get virtual() { return virtual; },
    freeze() { virtual = realNow(); return virtual; },
    /** Advances the clock by ms and runs the frame the page asked for. */
    step(ms) {
      virtual += ms;
      const due = queue;
      queue = new Map();
      for (const cb of due.values()) cb(virtual);
      return due.size;
    },
  };
})()`;

const HIDE_UI = `(() => {
  const s = document.createElement('style');
  s.textContent = 'body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; } body { cursor: none !important; }';
  document.head.append(s);
})()`;

const chrome = await launchChrome();
// A crashed page or a lost GPU never answers: give up after two minutes, so `finally` closes Chrome.
const answer = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`no answer in ${ms / 1000} s: ${what}`)), ms).unref())]);
const js = async (expression) => {
  const r = await answer(chrome.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), 120_000, expression.slice(0, 80));
  if (r.result?.exceptionDetails) throw new Error(`${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}\n  in: ${expression.slice(0, 200)}`);
  return r.result?.result?.value;
};
const page = {
  js,
  sleep,
  chrome,
  click: (text) => js(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`),
  key: (type, code, key) => chrome.send('Input.dispatchKeyEvent', { type, code, key: key ?? code.replace(/^Key/, '').toLowerCase(), windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 }),
  mouse: (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: width / 2, y: height / 2, button, clickCount: 1 }),
  waitFor: (expression, ms) => chrome.waitFor(expression, ms),
};

try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
  // Before the game reads them: the first-match hints all learned (no "WASD Move" over the footage), and a shot's
  // own settings (a loadout, a field of view) over the saved ones.
  const HINTS = ['move', 'fire', 'aim', 'sprint', 'reload', 'swap', 'grenade', 'loadout', 'scoreboard'];
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      localStorage.setItem('duty-shooter.hints.v1', ${JSON.stringify(JSON.stringify({ done: HINTS, shown: {} }))});
      const k = 'duty-shooter.settings.v1';
      let s = {};
      try { s = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {}; } catch {}
      localStorage.setItem(k, JSON.stringify({ ...s, ...${JSON.stringify(shot.settings ?? {})} }));
    })()`,
  });
  await chrome.navigate(`${base}?nolock&hz=${fps}${shot.params ? `&${shot.params}` : ''}`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 120_000))) throw new Error('page did not start');
  await sleep(1000);
  await shot.setup(page);
  // The sounds the game asks for, timed on the virtual clock, with where the listener stood.
  await js(`(() => {
    const s = duty.sound, log = (globalThis.__sounds = []);
    let pose = null;
    const at = () => (globalThis.__cine.virtual ?? performance.now()) / 1000;
    const listen = s.setListener.bind(s);
    s.setListener = (p, f, u) => { pose = [[...p], [...f], [...u]]; return listen(p, f, u); };
    const play = s.play.bind(s);
    s.play = (event, params = {}) => { log.push({ t: at(), event, params, listener: pose }); return play(event, params); };
    const scene = s.music.setScene.bind(s.music);
    s.music.setScene = (next, timeLeft = null) => { log.push({ t: at(), scene: next, timeLeft }); return scene(next, timeLeft); };
    const sting = s.music.sting.bind(s.music);
    s.music.sting = (which) => { log.push({ t: at(), sting: which }); return sting(which); };
    // Range Control's recorded lines, as asked: the live queue waits on the real clock, not this one, so the render
    // replays the asks and its own queue (on the shot's clock) makes the game's waits and drops.
    const say = s.speech.say.bind(s.speech);
    s.speech.say = (id, cuts = false) => { log.push({ t: at(), say: id, cuts }); return say(id, cuts); };
    return true;
  })()`);
  if (shot.ui !== true) await js(HIDE_UI);
  // A hit lights a soldier solid red for a moment: feedback for the shooter, a red silhouette to a film camera.
  // Turned off on the page's own Soldier module (found by its URL) unless the shot keeps it.
  if (shot.camera && shot.hitFlash !== true) {
    await js(`(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/fps-client\\/src\\/soldier\\.ts(\\?|$)/.test(n));
      if (!url) throw new Error('soldier.ts not among the loaded modules');
      const { Soldier } = await import(url);
      Soldier.prototype.hitFlash = () => {};
    })()`);
  }
  await js(CAMERA_LIB);
  const t0 = await js('__cine.freeze()');
  await js(`globalThis.__shot = { t0: ${t0}, camera: ${shot.camera ?? 'null'}, state: {} }`);
  // Warm-up frames on the virtual clock: TAA and exposure settle, the first pipelines compile.
  const pre = Math.round((shot.preroll ?? 0.5) * fps);
  const total = Math.round(shot.seconds * fps);
  const step = 1000 / fps;
  const device = 'duty.renderer.backend?.device';
  const started = Date.now();
  for (let i = -pre; i < total; i++) {
    const t = i / fps;
    if (shot.drive) await shot.drive(page, t);
    await js(`(async () => {
      const s = globalThis.__shot;
      duty.game.cinema = s.camera ? s.camera(${t}, duty.game, s.state) : null;
      __cine.step(${step});
      const d = ${device};
      if (d) await d.queue.onSubmittedWorkDone();
    })()`);
    if (i < 0) continue;
    const shotImg = await answer(chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: false }), 120_000, 'screenshot');
    writeFileSync(`${frames}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(shotImg.result.data, 'base64'));
    if (i % fps === 0) process.stdout.write(`${name} ${(i / fps).toFixed(0)}s/${shot.seconds}s (${((Date.now() - started) / (i + pre + 1)).toFixed(0)} ms/frame)\n`);
  }
  // Each step moves the clock before its frame runs, so frame 00000 is drawn at t0 + (pre + 1) steps.
  const sounds = await js(`JSON.stringify(globalThis.__sounds.map((e) => ({ ...e, t: e.t - (${t0} + ${(pre + 1) * step}) / 1000 })))`);
  writeFileSync(`${out}/sounds.json`, sounds);
  const cuts = JSON.parse(await js('JSON.stringify(globalThis.__shot.state.cuts ?? [])'));
  const endedAt = await js('globalThis.__shot.state.endedAt ?? null');
  // Per frame, for a director's shot: [t, subject, subject fired, nearest foe m, subject alive, shots fired by anyone].
  writeFileSync(`${out}/frames.json`, await js('JSON.stringify(globalThis.__shot.state.frames ?? [])'));
  writeFileSync(`${out}/shot.json`, JSON.stringify({ name, fps, seconds: shot.seconds, frames: total, width, height, cuts, endedAt, msPerFrame: Math.round((Date.now() - started) / (total + pre)), errors: chrome.errors.slice(0, 10) }, null, 1));
  console.log(`${name}: ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)} s, errors ${chrome.errors.length}`);
} finally {
  await chrome.close();
}
