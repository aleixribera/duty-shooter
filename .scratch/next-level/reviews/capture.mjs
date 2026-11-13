// The review's evidence (PLAN item 1): what a player meets, judged by the five objectives.
//   node .scratch/next-level/reviews/capture.mjs <out dir> [match seconds = 150] [base url = http://localhost:5173/]
// Against the dev server (`preview_start range`). One headless Chrome at a time, each part in its own browser:
//   menu     the main menu at desktop and phone width, and the Bot Match setup.
//   match    one Bot Match played to its end by a scripted player who turns toward the nearest enemy in sight and
//            fires (the trailer's `steer`): a frame on each of its first kills (hit marker, score popup), the
//            scoreboard, the last minute, the end screen; sound recorded from the game's own output (opening and
//            last minute, .webm) with each second's level and every sound the game asked for; frame times.
//            Map and mode rotate through all fifteen pairs, one per review (MAIN=<map id>:<mode id> picks one).
//   tour     every other map and mode in turn, 25 s each with the same player, then the Practice Range; ISLAND=1
//            adds a local Battle Royale on Zero Island (the dev server builds the island's nav on its first ask,
//            which took this PC over three minutes, and the island takes GBs).
//   online   Play Online on a local server (started here if none answers): this page and a second client, a
//            Node socket named Friend, share the lobby; the host starts the match.
// Everything lands in <out>: frames (.jpg), sound (.webm), and summary.json (per part: kills, deaths, frame
// times, sound levels, the sounds heard, page errors). ONLY=<part>,<part> runs just those parts (menu, match, tour,
// island, online) into an existing capture, keeping the rest of its summary.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: capture.mjs <out dir> [match seconds] [base url]');
const MATCH_SECONDS = Number(process.argv[3] ?? 150);
const BASE = process.argv[4] ?? 'http://localhost:5173/';
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
mkdirSync(out, { recursive: true });

const MAPS = {
  'survival-town': 'Survival Town',
  switchyard: 'Switchyard',
  'station-nine': 'Station Nine',
};
const MODES = {
  tdm: 'Team deathmatch',
  ffa: 'Free-for-all',
  outposts: 'Outposts',
  charge: 'Charge',
  gungame: 'Gun game',
};
// Pair k plays map k mod 3 in mode k mod 5: fifteen pairs, each once, and the next review differs in both.
const PAIRS = Array.from({ length: 15 }, (_, k) => [Object.keys(MAPS)[k % 3], Object.keys(MODES)[k % 5]]);
// The match: the next pair for each review saved so far, so fifteen reviews play every map in every mode.
const reviewsSoFar = readdirSync(new URL('.', import.meta.url)).filter((f) => /^\d{4}-\d\d-\d\d\w?\.md$/.test(f)).length;
const ONLY = process.env.ONLY?.split(',') ?? null;
// A part run again into an existing capture keeps its summary, and its match's map and mode.
const old = ONLY && existsSync(`${out}/summary.json`) ? JSON.parse(readFileSync(`${out}/summary.json`, 'utf8')) : null;
const MAIN = process.env.MAIN ? process.env.MAIN.split(':') : old?.match?.map ? [old.match.map, old.match.mode] : PAIRS[reviewsSoFar % PAIRS.length];
// The tour: every map and every mode once besides the match (five pairs cover three maps and five modes).
const TOUR = Object.keys(MODES)
  .map((mode, i) => [Object.keys(MAPS)[(i + 1) % 3], mode])
  .filter(([m, o]) => !(m === MAIN[0] && o === MAIN[1]));

const want = (part) => (ONLY ? ONLY.includes(part) : part !== 'island' || process.env.ISLAND === '1');
const summary = {
  base: BASE,
  frameCap: Number(process.env.FRAME_CAP ?? 30),
  match: null,
  tour: [],
  range: null,
  island: null,
  online: null,
};
if (old) Object.assign(summary, old, { base: summary.base, frameCap: summary.frameCap });
// A part that hasn't finished in this long is stuck (a crashed renderer never answers): its Chrome is closed.
const PART_MS = 15 * 60_000;
let server = null;
process.on('exit', () => server?.kill());
const save = () => writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Vite's hot reload stubbed: another session's edit must not reload a scripted page mid-run.
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// Every node the game connects to its context's speakers is also connected to a tap, which a recorder and a
// level meter read; and each frame's time, while __ft.on.
const PROBES = `(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      const c = dest.context;
      if (!c.__tap) { c.__tap = c.createMediaStreamDestination(); globalThis.__tapContext = c; }
      connect.call(this, c.__tap);
    }
    return r;
  };
  // Each frame's time, and the main thread's work in it (every animation-frame callback timed): under the 30 fps
  // cap the frame time only shows hitches, and the work shows how much of the frame the game needs.
  const ft = (globalThis.__ft = { on: false, d: [], w: [], busy: 0, last: 0 });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); try { cb(t); } finally { ft.busy += performance.now() - s; } });
  const tick = (t) => { if (ft.on && ft.last) { ft.d.push(t - ft.last); ft.w.push(ft.busy); } ft.busy = 0; ft.last = t; raf(tick); };
  raf(tick);
})()`;

/** One part in its own Chrome: the page helpers, then closed whatever happens. */
async function session(name, fn) {
  const chrome = await launchChrome();
  const page = {
    chrome,
    js: (expression) => chrome.evaluate(expression),
    sleep,
    async shot(file) {
      const s = await chrome.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 80,
      });
      if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
      // The frame the capture held up is not the game's: the next frame time starts after it.
      await chrome.evaluate('__ft.last = 0');
    },
    /** Clicks the first visible, enabled button whose text starts with `text`, as a user gesture (sound unlocks on one). */
    async click(text) {
      const r = await chrome.send('Runtime.evaluate', {
        userGesture: true,
        returnByValue: true,
        expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
      });
      return r.result?.result?.value === true;
    },
    key: (type, code, key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code, vk = code.startsWith('Key') ? code.charCodeAt(3) : ({ Space: 32, Tab: 9, ShiftLeft: 16 }[code] ?? 0)) =>
      chrome.send('Input.dispatchKeyEvent', {
        type,
        code,
        key,
        windowsVirtualKeyCode: vk,
      }),
    mouse: (type, button = 'left') =>
      chrome.send('Input.dispatchMouseEvent', {
        type,
        x: 960,
        y: 540,
        button,
        clickCount: 1,
      }),
    waitFor: (e, ms, every) => chrome.waitFor(e, ms, every),
  };
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
      source: HMR_SHIELD,
    });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
      source: PROBES,
    });
    let timer;
    const stuck = new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(`not done in ${PART_MS / 60_000} min`)), PART_MS)));
    return await Promise.race([fn(page), stuck]).finally(() => clearTimeout(timer));
  } catch (e) {
    log(`${name} failed: ${e.message}`);
    await page.shot(`${name}-failed`).catch(() => {});
    return { failed: e.message };
  } finally {
    const errors = chrome.errors.slice(0, 5);
    if (errors.length) log(`${name} page errors: ${errors.join(' | ').slice(0, 400)}`);
    await chrome.close();
  }
}

async function open(page, params = '') {
  await page.chrome.navigate(`${BASE}?nolock&stats${params ? `&${params}` : ''}`);
  if (!(await page.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game && !!globalThis.duty?.sound`, 90_000))) throw new Error('page did not start');
  await sleep(2000);
}

async function botMatch(page, map, mode) {
  for (const p of ['Bot Match', MAPS[map], MODES[mode]]) {
    if (!(await page.click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  await page.click('Mixed teams');
  await sleep(300);
  if (!(await page.click('Start'))) throw new Error('no Start button');
  if (!(await page.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
}

/** After the map is up: the trailer's page helpers (C), the bots' routes, sound logging and recording. */
async function arm(page, map) {
  await page.js(CAMERA_LIB);
  if (map && MAPS[map]) await loadNav(page, MAPS[map]).catch((e) => log(`no routes: ${e.message}`));
  await page.js(`(() => {
    const s = duty.sound, log = (globalThis.__sounds = []);
    const play = s.play.bind(s);
    s.play = (event, params = {}) => { log.push([Math.round(performance.now()), event]); return play(event, params); };
    globalThis.__levels = [];
    const c = globalThis.__tapContext;
    if (!c) return;
    const a = c.createAnalyser();
    a.fftSize = 2048;
    c.__tap.stream && c.createMediaStreamSource(c.__tap.stream).connect(a);
    const buf = new Float32Array(a.fftSize);
    setInterval(() => {
      a.getFloatTimeDomainData(buf);
      let peak = 0, sum = 0;
      for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      globalThis.__levels.push([Math.round(performance.now()), Math.round(20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9)), Math.round(20 * Math.log10(peak + 1e-9))]);
    }, 250);
  })()`);
}

/** Starts recording the game's sound; `stop` saves it as <file>.webm. */
async function record(page) {
  const ok = await page.js(`(() => {
    const c = globalThis.__tapContext;
    if (!c) return 'no audio context';
    const r = new MediaRecorder(c.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96000 });
    const chunks = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.start(1000);
    globalThis.__rec = { r, chunks };
    return c.state;
  })()`);
  return {
    state: ok,
    async stop(file) {
      const b64 = await page.js(`new Promise((done) => {
        const { r, chunks } = globalThis.__rec ?? {};
        if (!r) return done(null);
        r.onstop = async () => { const buf = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); done(btoa(s)); };
        r.stop();
      })`);
      let loudness = null;
      if (b64) {
        writeFileSync(`${out}/${file}.webm`, Buffer.from(b64, 'base64'));
        // A picture of it for a reviewer who can't listen: the spectrum over time, and the loudness.
        spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/${file}.webm`, '-lavfi', 'showspectrumpic=s=1600x400:legend=1', `${out}/${file}.png`]);
        const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', `${out}/${file}.webm`, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
        const tail = String(r.stderr ?? '')
          .split('Summary:')
          .at(-1);
        loudness = { lufs: Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)?.[1] ?? NaN), truePeakDb: Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1] ?? NaN) };
      }
      await page.js('__ft.last = 0');
      return { audioKb: b64 ? Math.round((b64.length * 3) / 4 / 1024) : 0, loudness };
    },
  };
}

/** Frame times since `__ft.on`: mean, percentiles and the 1% low, in ms and fps. */
async function frames(page) {
  const { d, w } = (await page.js(`(() => { const r = { d: __ft.d, w: __ft.w }; __ft.d = []; __ft.w = []; return r; })()`)) ?? {};
  if (!d?.length) return null;
  const ws = [...w].sort((a, b) => a - b);
  const s = [...d].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const low = s.slice(Math.floor(s.length * 0.99));
  const lowMean = low.reduce((a, b) => a + b, 0) / low.length;
  const r = (v) => Math.round(v * 10) / 10;
  const render = await page.js(`document.body.dataset.render ? JSON.parse(document.body.dataset.render) : null`);
  return {
    frames: d.length,
    meanMs: r(mean),
    p50Ms: r(at(0.5)),
    p95Ms: r(at(0.95)),
    p99Ms: r(at(0.99)),
    worstMs: r(s.at(-1)),
    over50ms: d.filter((v) => v > 50).length,
    fps: r(1000 / mean),
    low1Fps: r(1000 / lowMean),
    workP50Ms: r(ws[Math.floor(ws.length / 2)]),
    workP99Ms: r(ws[Math.floor(ws.length * 0.99)]),
    render,
  };
}

/** The sounds heard (counts by event) and the levels, from the page's logs since `arm`, then cleared. */
async function sounds(page, since = 0) {
  const { s, l } = await page.js(`(() => { const r = { s: globalThis.__sounds ?? [], l: globalThis.__levels ?? [] }; globalThis.__sounds = []; globalThis.__levels = []; return r; })()`);
  const counts = {};
  for (const [, e] of s) counts[e] = (counts[e] ?? 0) + 1;
  const rms = l
    .map((x) => x[1])
    .filter((v) => v > -150)
    .sort((a, b) => a - b);
  const silent = l.filter((x) => x[1] < -60).length;
  return {
    heard: Object.fromEntries(
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25),
    ),
    levels: l.length
      ? {
          samples: l.length,
          rmsMedianDb: rms[Math.floor(rms.length / 2)] ?? null,
          rmsLoudestDb: rms.at(-1) ?? null,
          peakDb: Math.max(...l.map((x) => x[2])),
          silentShare: Math.round((silent / l.length) * 100) / 100,
        }
      : null,
    log: s.map(([t, e]) => [Math.round((t - since) / 100) / 10, e]),
  };
}

/** The scripted player: each step turns toward the nearest enemy in sight and fires, as the trailer's first-person shots do. */
function player(page, range = 40) {
  const STEER = steer({ range });
  const held = { walk: false, fire: false, ads: false, pressed: false, n: 0 };
  return {
    async step() {
      const want = await page.js(STEER);
      if (!want) return;
      if (want.walk !== held.walk) await page.key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.sprint && !held.sprint) {
        await page.key('keyDown', 'ShiftLeft', 'Shift');
        await page.key('keyUp', 'ShiftLeft', 'Shift');
      }
      if (want.ads !== held.ads) await page.mouse(want.ads ? 'mousePressed' : 'mouseReleased', 'right');
      if (want.reload) {
        await page.key('keyDown', 'KeyR');
        await page.key('keyUp', 'KeyR');
      }
      if (want.jump) {
        await page.key('keyDown', 'Space', ' ');
        await page.key('keyUp', 'Space', ' ');
      }
      const press = want.fire && (want.dist < 12 || held.n++ % 6 < 4);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await page.mouse(press ? 'mousePressed' : 'mouseReleased', 'left');
      Object.assign(held, want, { pressed: press });
    },
    async release() {
      if (held.walk) await page.key('keyUp', 'KeyW');
      if (held.ads) await page.mouse('mouseReleased', 'right');
      if (held.pressed) await page.mouse('mouseReleased', 'left');
      Object.assign(held, { walk: false, ads: false, pressed: false });
    },
  };
}

const ME = `(() => { const d = duty.driver, s = d?.scores?.find((x) => x.id === d.selfId); return { kills: s?.kills ?? 0, deaths: s?.deaths ?? 0, phase: d?.match?.phase ?? null, left: d?.match?.phaseEnds != null ? Math.round(d.match.phaseEnds - d.serverTime) : null }; })()`;

/** Plays for up to `seconds` (or until the match leaves play), shooting each of the first kills; `every(t, me)` adds frames. */
async function play(page, prefix, seconds, every = async () => {}) {
  const p = player(page);
  const start = Date.now();
  let me = await page.js(ME);
  const first = me;
  let killShots = 0;
  while (Date.now() - start < seconds * 1000) {
    await p.step();
    const now = await page.js(ME);
    if (now.kills > me.kills && killShots < 4) {
      killShots += 1;
      await page.shot(`${prefix}-kill-${killShots}`);
      await sleep(250);
      await page.shot(`${prefix}-kill-${killShots}b`);
    }
    me = now;
    if (me.phase && me.phase !== 'playing') break;
    await every((Date.now() - start) / 1000, me);
    await sleep(40);
  }
  await p.release();
  return {
    kills: me.kills - first.kills,
    deaths: me.deaths - first.deaths,
    seconds: Math.round((Date.now() - start) / 1000),
    phase: me.phase,
  };
}

// --- menu ------------------------------------------------------------------
if (want('menu'))
  await session('menu', async (page) => {
    await open(page);
    await sleep(1000);
    await page.shot('01-menu');
    await page.chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(800);
    await page.shot('02-menu-phone');
    await page.chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(800);
    for (const p of ['Bot Match', MAPS[MAIN[0]], MODES[MAIN[1]]]) await page.click(p);
    await sleep(400);
    await page.shot('03-bot-match-setup');
  });

// --- the match, to its end ---------------------------------------------------
if (want('match')) {
  log(`match: ${MAPS[MAIN[0]]}, ${MODES[MAIN[1]]}, ${MATCH_SECONDS} s`);
  summary.match = await session('match', async (page) => {
    await open(page, `matchtime=${MATCH_SECONDS}`);
    await botMatch(page, ...MAIN);
    await arm(page, MAIN[0]);
    const t0 = await page.js('performance.now()');
    let rec = await record(page);
    const r = { map: MAIN[0], mode: MAIN[1], audioContext: rec.state };
    await page.js('__ft.on = true');
    await sleep(1500);
    await page.shot('10-match-start');
    const marks = new Set();
    let lastMinute = false;
    // Charge has no clock (its rounds end it, and ?matchtime doesn't reach it): it plays on to its last round.
    r.play = await play(page, '11-match', MAIN[1] === 'charge' ? 600 : MATCH_SECONDS + 60, async (t, me) => {
      const at = async (key, cond, fn) => {
        if (!marks.has(key) && cond) {
          marks.add(key);
          await fn();
        }
      };
      await at('board', t > 40, async () => {
        await page.key('keyDown', 'Tab', 'Tab');
        await sleep(400);
        await page.shot('12-match-scoreboard');
        await page.key('keyUp', 'Tab', 'Tab');
      });
      for (const k of [30, 60, 90]) await at(`t${k}`, t > k && (me.left === null || me.left > 62), () => page.shot(`13-match-${k}s`));
      if (!lastMinute && me.left !== null && me.left <= 60) {
        lastMinute = true;
        r.opening = {
          ...(await rec.stop('audio-opening')),
          ...(await sounds(page, t0)),
          frames: await frames(page),
        };
        rec = await record(page);
      }
      for (const k of [55, 30, 10, 3]) await at(`left${k}`, me.left !== null && me.left <= k, () => page.shot(`14-match-last-${String(k).padStart(2, '0')}s`));
    });
    await sleep(2500);
    await page.shot('15-match-end');
    await sleep(6000);
    await page.shot('16-match-after');
    r.lastMinute = {
      ...(await rec.stop(lastMinute ? 'audio-last-minute' : 'audio-match')),
      ...(await sounds(page, t0)),
      frames: await frames(page),
    };
    r.soundLog = 'sounds-match.json';
    writeFileSync(
      `${out}/sounds-match.json`,
      JSON.stringify({
        opening: r.opening?.log ?? [],
        lastMinute: r.lastMinute.log,
      }),
    );
    if (r.opening) delete r.opening.log;
    delete r.lastMinute.log;
    r.errors = page.chrome.errors.slice(0, 5);
    return r;
  });
  save();
  log('match', JSON.stringify(summary.match?.play ?? summary.match));
}

// --- the tour ----------------------------------------------------------------
if (want('tour')) {
  summary.tour = [];
  for (const [map, mode] of TOUR) {
    log(`tour: ${MAPS[map]}, ${MODES[mode]}`);
    const name = `2${summary.tour.length}-${map}-${mode}`;
    summary.tour.push(
      await session(name, async (page) => {
        await open(page);
        await botMatch(page, map, mode);
        await arm(page, map);
        const t0 = await page.js('performance.now()');
        await page.js('__ft.on = true');
        await sleep(1000);
        await page.shot(`${name}-a`);
        const r = {
          map,
          mode,
          play: await play(page, name, 25, async (t) => t > 18 && !page.done && ((page.done = true), await page.shot(`${name}-b`))),
        };
        Object.assign(r, {
          frames: await frames(page),
          ...(await sounds(page, t0)),
          errors: page.chrome.errors.slice(0, 3),
        });
        delete r.log;
        return r;
      }),
    );
    save();
  }

  log('tour: Practice Range');
  summary.range = await session('30-range', async (page) => {
    await open(page);
    if (!(await page.click('Practice Range'))) throw new Error('no Practice Range button');
    await sleep(8000);
    await page.js('__ft.on = true');
    await page.shot('30-range-a');
    await page.key('keyDown', 'KeyW');
    await sleep(1500);
    await page.key('keyUp', 'KeyW');
    await page.mouse('mousePressed', 'right');
    await sleep(500);
    for (let i = 0; i < 6; i++) {
      await page.mouse('mousePressed');
      await sleep(150);
      await page.mouse('mouseReleased');
      await sleep(250);
    }
    await page.shot('30-range-b');
    await page.mouse('mouseReleased', 'right');
    return {
      frames: await frames(page),
      errors: page.chrome.errors.slice(0, 3),
    };
  });
  save();
}

if (want('island')) {
  {
    log('tour: Zero Island, local Battle Royale');
    summary.island = await session('31-island', async (page) => {
      await open(page);
      if (!(await page.click('Battle Royale'))) throw new Error('no Battle Royale button');
      if (!(await page.waitFor(`!!document.querySelector('.ds-royale [data-key="source-local"]')`, 30_000, 200))) throw new Error('no Local bots choice');
      await page.js(`document.querySelector('.ds-royale [data-key="source-local"]').click()`);
      await sleep(500);
      await page.js(`(() => { const i = document.querySelector('.ds-royale input[name="name"]'); if (i) i.value = 'Reviewer'; document.querySelector('.ds-royale [data-key="go"]')?.click(); })()`);
      if (!(await page.waitFor(`!!document.querySelector('.ds-royale [data-act="start"]')`, 480_000, 1000))) throw new Error('no lobby in 8 min');
      await page.shot('31-island-lobby');
      await page.js(`document.querySelector('.ds-royale [data-act="start"]').click()`);
      if (!(await page.waitFor(`!!document.querySelector('.ds-prep:not([hidden])')`, 120_000, 500))) throw new Error('no Preparation');
      await sleep(2000);
      await page.shot('31-island-preparation');
      await page.click('Ready');
      if (!(await page.waitFor(`!document.querySelector('.ds-prep:not([hidden])')`, 60_000, 500))) throw new Error('the drop did not start');
      await sleep(8000);
      await arm(page, null);
      await page.js('__ft.on = true');
      await page.shot('31-island-a');
      const r = {
        play: await play(page, '31-island', 30, async (t) => t > 25 && !page.done && ((page.done = true), await page.shot('31-island-b'))),
      };
      Object.assign(r, {
        frames: await frames(page),
        ...(await sounds(page)),
        errors: page.chrome.errors.slice(0, 3),
      });
      delete r.log;
      return r;
    });
    save();
  }
}

// --- online: two clients in one lobby --------------------------------------
if (want('online')) {
  log('online');
  const health = async () =>
    fetch(`${BASE}healthz`).then(
      (r) => (r.ok ? r.json() : null),
      () => null,
    );
  let h = await health();
  if (!h?.protocol) {
    log('starting a local server on port 3000');
    const built = spawnSync('npm run build -w @duty-shooter/server', {
      cwd: REPO,
      shell: true,
      stdio: 'ignore',
    });
    if (built.status !== 0) log('server build failed');
    server = spawn(process.execPath, ['apps/server/dist/main.js'], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: '3000',
        HOST: '127.0.0.1',
        PASSPHRASE: '',
        NODE_ENV: 'development',
      },
      stdio: 'ignore',
    });
    for (let i = 0; i < 120 && !h?.protocol; i++) {
      await sleep(500);
      h = await health();
    }
  }
  try {
    if (!h?.protocol) throw new Error('no server answers at /healthz');
    if (!h.public && process.env.PASSPHRASE === undefined) throw new Error('the server on port 3000 is private: name its passphrase in PASSPHRASE');
    const passphrase = h.public ? '' : process.env.PASSPHRASE;
    summary.online = await session('40-online', async (page) => {
      await open(page, 'online');
      // The name first (the menu's own field): the public lobby joins in one click under it; a private one asks
      // for its passphrase on a form with its own Join.
      const fill = `(() => { const set = (i, v) => { if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }; const f = [...document.querySelectorAll('input')].filter((i) => i.getClientRects().length); set(f.find((i) => i.type !== 'password'), 'Reviewer'); set(f.find((i) => i.type === 'password'), ${JSON.stringify(passphrase)}); })()`;
      await page.js(fill);
      if (!(await page.click('Play Online'))) throw new Error('no Play Online button');
      await sleep(1500);
      await page.shot('40-online-join');
      if (passphrase) {
        await page.js(fill);
        if (!(await page.click('Join'))) throw new Error('no Join button');
      }
      if (!(await page.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])') || duty.driver?.match?.phase === 'playing'`, 90_000, 500))) throw new Error('no lobby');
      // The second client: a plain socket that joins by the same route and stays.
      const friend = new WebSocket(`${BASE.replace(/^http/, 'ws')}ws`);
      friend.on('error', () => {});
      const welcomed = new Promise((done) => {
        friend.on('error', (e) => done(`error: ${e.message}`));
        friend.on('message', (data, binary) => {
          if (binary) return;
          let m = null;
          try {
            m = JSON.parse(String(data));
          } catch {
            return;
          }
          if (m.t === 'welcome') done(true);
          if (m.t === 'reject') done(`rejected: ${m.reason}`);
        });
        setTimeout(() => done('no welcome in 20 s'), 20_000);
      });
      friend.on('open', () =>
        friend.send(
          JSON.stringify({
            t: 'join',
            name: 'Friend',
            passphrase,
            protocol: h.protocol,
          }),
        ),
      );
      try {
        const r = { friend: await welcomed };
        await sleep(3000);
        r.lobby = await page.js(`document.querySelector('.ds-lobby:not([hidden])')?.innerText.replace(/\\s+/g, ' ').slice(0, 400) ?? null`);
        await page.shot('41-online-lobby');
        await page.chrome.send('Emulation.setDeviceMetricsOverride', {
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          mobile: true,
        });
        await sleep(800);
        await page.shot('42-online-lobby-phone');
        await page.chrome.send('Emulation.setDeviceMetricsOverride', {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await sleep(800);
        r.started = await page.click('Start');
        r.playing = !!(await page.waitFor(`duty.driver?.match?.phase === 'playing'`, 60_000, 500));
        if (r.playing) {
          await page.js('__ft.on = true');
          await sleep(4000);
          await page.shot('43-online-play');
          r.frames = await frames(page);
        }
        r.errors = page.chrome.errors.slice(0, 3);
        return r;
      } finally {
        friend.close();
      }
    });
  } finally {
    server?.kill();
  }
  save();
  log('online', JSON.stringify(summary.online));
}

save();
log('done');
