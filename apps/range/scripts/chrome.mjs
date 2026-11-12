// A Chrome driven over the DevTools protocol, for the benchmark and the
// reference-spot screenshots: 1920 x 1080, WebGPU on. Headless
// unless HEADED=1, and muted unless SOUND=1 (a headless page still plays
// through the speakers, and the announcer speaks unless the page is marked automated); CHROME overrides the browser path. The page sees no
// controller unless PAD=1: Chrome hands a page the PC's real one once a script's
// click focuses it, and a pad in use at this PC then plays the scripted match.
//
// Light by default, because the owner plays games on this PC while scripts run: the page draws at most
// FRAME_CAP frames a second (30 unless set; 0 for none), and the script and its Chrome run at idle
// priority, so they take only the CPU nothing else wants. `uncapped: true` is for measuring frame times (bench, perf): vsync
// off, no frame cap, normal priority.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rm, rmSync, statSync } from 'node:fs';
import { constants, setPriority, tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Holds every requestAnimationFrame callback to frames at least 1000/cap ms apart; callbacks asked for in one frame all run in it. */
const frameCap = (cap) => `(() => {
  const step = 1000 / ${cap} - 2, raf = requestAnimationFrame.bind(window), caf = cancelAnimationFrame.bind(window), live = new Map();
  let open = -1, next = 0, n = 0;
  window.requestAnimationFrame = (cb) => {
    const id = ++n;
    const tick = (t) => {
      if (t !== open) {
        if (t < next) return void live.set(id, raf(tick));
        open = t;
        next = t + step;
      }
      live.delete(id);
      cb(t);
    };
    live.set(id, raf(tick));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (live.has(id)) caf(live.get(id));
    live.delete(id);
  };
})();`;

/**
 * Throwaway profiles left in the temp directory by a script that died before close(): each is a few hundred MB, and
 * 1740 of them once filled the disk. Any older than six hours goes, in the background.
 */
function sweepProfiles() {
  const cut = Date.now() - 6 * 3600_000;
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!/^duty-(chrome|perf|measure)-/.test(name)) continue;
      const dir = join(tmpdir(), name);
      try {
        if (statSync(dir).mtimeMs < cut) rm(dir, { recursive: true, force: true, maxRetries: 3 }, () => {});
      } catch {
        // Gone already.
      }
    }
  } catch {
    // No temp directory to read.
  }
}

/**
 * `profile`: a user data directory to keep (a return visit's caches); a throwaway one when absent.
 * `uncapped`: frames as fast as the GPU draws them at normal priority, for frame-time measurements.
 */
export async function launchChrome({ profile: keep, uncapped = false } = {}) {
  // Chrome's processes inherit the idle class from this one (Windows), or its nice value elsewhere. It holds for the
  // rest of the script, so an uncapped launch puts it back to normal.
  try {
    setPriority(uncapped ? constants.priority.PRIORITY_NORMAL : constants.priority.PRIORITY_LOW);
  } catch {
    // Not allowed here; the frame cap still holds.
  }
  const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9300 + Math.floor(Math.random() * 500);
  sweepProfiles();
  const profile = keep ?? mkdtempSync(join(tmpdir(), 'duty-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1920,1080',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    'about:blank',
  ];
  if (uncapped) args.splice(4, 0, '--disable-gpu-vsync', '--disable-frame-rate-limit');
  if (!process.env.HEADED) args.unshift('--headless=new');
  // Muted, and marked as automated (navigator.webdriver): the game's announcer speaks through the PC's own
  // speech engine, which --mute-audio doesn't reach, so it keeps quiet for a page that says it is scripted.
  if (!process.env.SOUND) args.unshift('--mute-audio', '--enable-automation');
  const browser = spawn(chrome, args, { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      // Not listening yet.
    }
  }
  if (!target) {
    browser.kill();
    throw new Error('Chrome did not start');
  }
  // Chrome raises its own GPU process (above normal) and its active renderer (normal) over the idle class they
  // inherit, and starts a renderer per site, so every couple of seconds its processes are put back to idle.
  let keepIdle = null;
  if (!uncapped) {
    let top;
    try {
      top = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
      await new Promise((done, fail) => {
        top.onopen = done;
        top.onerror = fail;
      });
    } catch (e) {
      browser.kill();
      throw new Error('Chrome did not open its browser target', { cause: e });
    }
    top.onmessage = (e) => {
      for (const { id } of JSON.parse(e.data).result?.processInfo ?? []) {
        try {
          setPriority(id, constants.priority.PRIORITY_LOW);
        } catch {
          // Gone already.
        }
      }
    };
    const lower = () => top.readyState === WebSocket.OPEN && top.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' }));
    lower();
    keepIdle = { top, timer: setInterval(lower, 2000) };
    keepIdle.timer.unref();
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    ws.onopen = done;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}) =>
    new Promise((done) => {
      const n = ++id;
      pending.set(n, done);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const cap = Number(process.env.FRAME_CAP ?? 30);
  if (!uncapped && cap > 0) await send('Page.addScriptToEvaluateOnNewDocument', { source: frameCap(cap) });
  // Writable, so a script can still put a fake pad of its own in its place.
  if (!process.env.PAD) await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [], writable: true, configurable: true });" });
  return {
    send,
    errors,
    async evaluate(expression) {
      return (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
    },
    async navigate(url) {
      await send('Page.navigate', { url });
    },
    /** Waits until `expression` is truthy, polling every `every` ms; returns its value or null on timeout. */
    async waitFor(expression, timeoutMs, every = 500) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const v = await this.evaluate(expression);
        if (v) return v;
        await sleep(every);
      }
      return null;
    },
    async close() {
      if (keepIdle) {
        clearInterval(keepIdle.timer);
        keepIdle.top.close();
      }
      ws.close();
      // Chrome holds files in its profile until it has exited, and its children a moment after: wait, then retry the delete.
      const exited = new Promise((done) => (browser.exitCode !== null ? done() : browser.once('exit', done)));
      browser.kill();
      await Promise.race([exited, sleep(5000)]);
      if (keep) return;
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // Still held; the next launch's sweep takes it once it is six hours old.
      }
    },
  };
}
