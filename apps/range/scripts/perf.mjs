// Measures the production build the way a player meets it: the first visit and
// a return visit on a home connection, every menu click, the way into a match,
// and the frames of a moving, firing Bot Match. Prints one JSON report.
//
//   npm run build && remote-test --local "node apps/range/scripts/perf.mjs [label]"
//
// Build first: it serves apps/range/dist with the real server, on PERF_PORT
// (default 3190). PERF_PLAY sets the seconds of play (default 45), PERF_MAP the
// Bot Match's map as its tile reads, PERF_SETTLE the ms before Start. Frames over
// 8 ms land in play.spikes. CPU_PROFILE=<file> saves a CPU profile of the play,
// LOAD_PROFILE=<prefix> CPU profiles of the return visit (<prefix>-menu, -enter
// and -start .cpuprofile), PERF_NET=off skips the throttled first visit.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, sleep } from './chrome.mjs';

const label = process.argv[2] ?? 'build';
const port = Number(process.env.PERF_PORT ?? 3190);
const playSeconds = Number(process.env.PERF_PLAY ?? 45);
const base = `http://127.0.0.1:${port}/`;

/** Runs before the page's own code: a pointer lock that always works, and the probes the page reports through. */
const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () {
    locked = this;
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function () {
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const perf = (globalThis.__perf = { longTasks: [], frames: null, marks: {} });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  perf.startFrames = () => {
    const times = [];
    perf.frames = times;
    perf.spikes = [];
    let last = performance.now();
    const tick = (now) => {
      if (perf.frames !== times) return;
      times.push(now - last);
      if (now - last > 8) perf.spikes.push({ at: Math.round(now * 10) / 10, ms: Math.round((now - last) * 10) / 10 });
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  perf.stopFrames = () => {
    const times = perf.frames ?? [];
    perf.frames = null;
    return times;
  };
  /** Clicks, and reports how long until the page has drawn what the click did. */
  perf.click = async (el) => {
    const start = performance.now();
    el.click();
    const handler = performance.now() - start;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return { handler: Math.round(handler * 10) / 10, painted: Math.round((performance.now() - start) * 10) / 10 };
  };
  perf.find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  perf.menuUp = () => !!perf.find('Practice Range');
  // The frame that first draws the menu: the DOM being ready is not what a player sees.
  const watchMenu = () => {
    if (document.body && perf.menuUp()) perf.marks.menuFrame = performance.now();
    else requestAnimationFrame(watchMenu);
  };
  requestAnimationFrame(watchMenu);
  perf.playing = () => { const m = document.querySelector('.ds-menu'), l = document.querySelector('.ds-lobby'); return !!m && m.hidden && (!l || l.hidden); };
})()`;

const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
function frameStats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const round = (v) => Math.round(v * 100) / 100;
  const p50 = percentile(sorted, 0.5);
  const total = times.reduce((a, b) => a + b, 0);
  return {
    frames: times.length,
    fps: Math.round((times.length / Math.max(1, total)) * 1000),
    p50: round(p50),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    p999: round(percentile(sorted, 0.999)),
    max: round(sorted.at(-1) ?? 0),
    over16: times.filter((t) => t > 16.7).length,
    over33: times.filter((t) => t > 33.4).length,
    over100: times.filter((t) => t > 100).length,
    /** Frames over three times the median: what the eye reads as a hitch. */
    hitches: times.filter((t) => t > Math.max(p50 * 3, 8)).length,
  };
}

/** A page in Chrome, with the probes in, on `profile`. */
async function open(profile) {
  const chrome = await launchChrome({ profile });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  await chrome.send('Network.enable');
  return chrome;
}

/** Page load to a usable main menu, and what crossed the network for it. */
async function visit(chrome, name) {
  const start = Date.now();
  await chrome.navigate(base);
  const ok = await chrome.waitFor('!!globalThis.__perf?.menuUp()', 120_000, 25);
  const ms = Date.now() - start;
  await sleep(1500);
  const nav = await chrome.evaluate(`(() => {
    const entries = performance.getEntriesByType('resource');
    return JSON.stringify({ menuFrame: Math.round(__perf.marks.menuFrame ?? 0), requests: entries.length, kb: Math.round(entries.reduce((n, e) => n + e.transferSize, 0) / 1024), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0), longTasks: __perf.longTasks });
  })()`);
  return { name, ok: !!ok, toMenuMs: ms, ...JSON.parse(nav ?? '{}') };
}

async function profiled(chrome, name, work) {
  if (!process.env.LOAD_PROFILE) return work();
  await chrome.send('Profiler.enable');
  await chrome.send('Profiler.setSamplingInterval', { interval: 500 });
  await chrome.send('Profiler.start');
  const result = await work();
  const { result: done } = await chrome.send('Profiler.stop');
  writeFileSync(`${process.env.LOAD_PROFILE}-${name}.cpuprofile`, JSON.stringify(done.profile));
  return result;
}

async function click(chrome, text) {
  return JSON.parse((await chrome.evaluate(`(async () => { const b = __perf.find(${JSON.stringify(text)}); if (!b) return 'null'; return JSON.stringify(await __perf.click(b)); })()`)) ?? 'null');
}

/** Every menu click: open, tabs, back. */
async function menus(chrome) {
  const steps = {};
  const go = async (text, key = text) => {
    steps[key] = await click(chrome, text);
    await sleep(120);
  };
  await go('Settings');
  await go('Keys');
  await go('Video');
  await go('Interface');
  await go('Controls');
  await go('Back', 'Settings back');
  await go('Play Online');
  await go('Back', 'Online back');
  await go('Bot Match');
  await go('Back', 'Bot Match back');
  return steps;
}

async function playMatch(chrome) {
  // In through Bot Match, as a player: the tile, then Start.
  const entry = {};
  const tile = await click(chrome, 'Bot Match');
  entry.openLobby = tile;
  await sleep(300);
  if (process.env.PERF_MAP) await click(chrome, process.env.PERF_MAP);
  await sleep(Number(process.env.PERF_SETTLE ?? 0));
  const start = Date.now();
  await profiled(chrome, 'start', async () => {
    await click(chrome, 'Start');
    await chrome.waitFor('__perf.playing()', 180_000, 25);
    entry.startToPlayMs = Date.now() - start;
  });
  await sleep(6000);

  // Moves, turns and fires for the rest: everything a match asks of a frame.
  const key = (type, code, text) => chrome.send('Input.dispatchKeyEvent', { type, code, key: text, windowsVirtualKeyCode: text.toUpperCase().charCodeAt(0) });
  await chrome.evaluate('__perf.longTasks.length = 0; __perf.startFrames()');
  let profiledFrom = 0;
  if (process.env.CPU_PROFILE) {
    await chrome.send('Profiler.enable');
    await chrome.send('Profiler.setSamplingInterval', { interval: 500 });
    await chrome.send('Profiler.start');
    profiledFrom = await chrome.evaluate('performance.now()');
  }
  await key('keyDown', 'KeyW', 'w');
  const end = Date.now() + playSeconds * 1000;
  let x = 900;
  let n = 0;
  while (Date.now() < end) {
    x += n % 40 < 20 ? 60 : -45;
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960 + (x % 300), y: 540 + (n % 9), buttons: 0 });
    if (n % 25 === 0) await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'left', buttons: 1, clickCount: 1 });
    if (n % 25 === 12) await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', buttons: 0, clickCount: 1 });
    if (n % 90 === 45) {
      await key('keyDown', 'Space', ' ');
      await key('keyUp', 'Space', ' ');
    }
    n += 1;
    await sleep(40);
  }
  await key('keyUp', 'KeyW', 'w');
  if (process.env.CPU_PROFILE) {
    const { result } = await chrome.send('Profiler.stop');
    writeFileSync(process.env.CPU_PROFILE, JSON.stringify(result.profile));
  }
  const raw = await chrome.evaluate('JSON.stringify({ frames: __perf.stopFrames(), spikes: __perf.spikes, longTasks: __perf.longTasks, heapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) })');
  const { frames, spikes, longTasks, heapMb } = JSON.parse(raw ?? '{"frames":[],"spikes":[],"longTasks":[]}');
  return { entry, play: { seconds: playSeconds, ...frameStats(frames), longTasks: longTasks.length, worstLongTask: Math.max(0, ...longTasks.map((t) => t.ms)), heapMb, profiledFrom, spikes } };
}

const server = spawn(process.execPath, ['apps/server/dist/main.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development' }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'duty-perf-'));
const report = { label, at: new Date().toISOString() };
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}healthz`)).ok) break;
    } catch {
      await sleep(200);
    }
  }
  await sleep(3000); // The server's precompression settles.
  // A first visit on a home connection (fresh shader cache and all).
  let chrome = await open(profile);
  try {
    if (process.env.PERF_NET !== 'off') await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (50 * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8 });
    report.cold = await profiled(chrome, 'cold', async () => {
      const seen = await visit(chrome, 'cold');
      if (process.env.LOAD_PROFILE) await sleep(3000);
      return seen;
    });
    await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    report.menus = await menus(chrome);
    Object.assign(report, await playMatch(chrome));
    report.errors = chrome.errors.slice(0, 8);
  } finally {
    await chrome.close();
  }
  // A return visit: the same profile, its caches warm.
  chrome = await open(profile);
  try {
    if (process.env.PERF_NET !== 'off') await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (50 * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8 });
    report.warm = await profiled(chrome, 'menu', async () => {
      const seen = await visit(chrome, 'warm');
      if (process.env.LOAD_PROFILE) await sleep(3000);
      return seen;
    });
    await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(500);
    await sleep(Number(process.env.PERF_SETTLE ?? 0));
    await profiled(chrome, 'enter', async () => {
      const start = Date.now();
      await click(chrome, 'Practice Range');
      await chrome.waitFor('__perf.playing()', 180_000, 25);
      report.warmPracticeRangeMs = Date.now() - start;
    });
  } finally {
    await chrome.close();
  }
} finally {
  server.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold it; it is in the temp directory.
  }
}
console.log(JSON.stringify(report, null, 1));
