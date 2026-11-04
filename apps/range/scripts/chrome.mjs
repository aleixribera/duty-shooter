// A Chrome driven over the DevTools protocol, for the benchmark and the
// reference-spot screenshots: 1920 x 1080, WebGPU on, vsync off. Headless
// unless HEADED=1, and muted unless SOUND=1 (a headless page still plays
// through the speakers, and the announcer speaks unless the page is marked automated); CHROME overrides the browser path. The page sees no
// controller unless PAD=1: Chrome hands a page the PC's real one once a script's
// click focuses it, and a pad in use at this PC then plays the scripted match.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** `profile`: a user data directory to keep (a return visit's caches); a throwaway one when absent. */
export async function launchChrome({ profile: keep } = {}) {
  const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = keep ?? mkdtempSync(join(tmpdir(), 'duty-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1920,1080',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];
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
      ws.close();
      browser.kill();
      await sleep(500);
      if (keep) return;
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold the profile; it is in the temp directory.
      }
    },
  };
}
