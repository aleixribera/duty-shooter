// The benchmark page on the reference toaster (PLAN item 4), headless, with no dependency:
// Firefox (the laptop's own browser) driven over WebDriver BiDi with Node's built-in WebSocket.
// Run on the laptop: node laptop-bench.mjs <url> <out.json> [width] [height]
//   url: e.g. https://aleixribera.github.io/duty-shooter/?benchmark&run
// rAF runs unthrottled (layout.frame_rate=0), so frame times are the machine's, not the 60 Hz timer's.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, w = '1920', h = '1080'] = process.argv.slice(2);
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'duty-bench-'));
writeFileSync(join(profile, 'user.js'), [
  'user_pref("layout.frame_rate", 0);',
  'user_pref("dom.webgpu.enabled", true);',
  'user_pref("media.volume_scale", "0.0");',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("remote.prefs.recommended", true);',
  // PREFS="name=value;…": extra Firefox prefs, for an A/B of one of Firefox's own settings.
  ...(process.env.PREFS ?? '').split(';').filter(Boolean).map((p) => `user_pref("${p.slice(0, p.indexOf('='))}", ${p.slice(p.indexOf('=') + 1)});`),
].join('\n'));
// Headless Firefox has no GPU (no WebGPU adapter, no WebGL2). So Firefox runs as a normal window on a
// headless Mutter of its own: a virtual monitor drawn on the laptop's GPU, on its own Wayland display
// and its own D-Bus session, so nothing shows on the owner's screen and nothing talks to their session.
const ffArgs = `--no-remote --profile ${profile} --remote-debugging-port ${port} --width=${w} --height=${h}`;
// REAL=1: a real window, full screen (kiosk) on the owner's own desktop session and its compositor, the way he plays.
const real = !!process.env.REAL;
const session = { WAYLAND_DISPLAY: 'wayland-0', XDG_RUNTIME_DIR: '/run/user/1000', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' };
const ff = real
  ? spawn('sh', ['-c', `MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland exec firefox --kiosk ${ffArgs}`], {
    env: { ...process.env, ...session, DISPLAY: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true,
  })
  : spawn('dbus-run-session', ['--', 'sh', '-c',
    `mutter --headless --no-x11 --virtual-monitor ${w}x${h}@60 --wayland-display duty-wl >/dev/null 2>&1 & sleep 3; ` +
    `WAYLAND_DISPLAY=duty-wl MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland exec nice -n 5 firefox ${ffArgs}`], {
    env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
let errTail = '';
ff.stderr.on('data', (d) => (errTail = (errTail + d).slice(-4000)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { try { process.kill(-ff.pid, 'SIGTERM'); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500); };
process.on('exit', cleanup);

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  await sleep(500);
  try {
    const s = new WebSocket(`ws://127.0.0.1:${port}/session`);
    await new Promise((ok, bad) => { s.onopen = ok; s.onerror = bad; });
    ws = s;
  } catch {}
}
if (!ws) { console.error('no BiDi', errTail); process.exit(1); }
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params) => new Promise((ok, bad) => {
  const n = ++id;
  pending.set(n, (msg) => (msg.type === 'error' ? bad(new Error(`${method}: ${msg.error} ${msg.message}`)) : ok(msg.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
await send('session.new', { capabilities: {} });
const tree = await send('browsingContext.getTree', {});
const context = tree.contexts[0].context;
if (!real) await send('browsingContext.setViewport', { context, viewport: { width: Number(w), height: Number(h) }, devicePixelRatio: 1 }).catch(() => {});
const evaluate = async (expression) => {
  const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
  return r.type === 'success' ? r.result.value : `ERR ${JSON.stringify(r.exceptionDetails?.text)}`;
};
const t0 = Date.now();
await send('browsingContext.navigate', { context, url, wait: 'complete' });
console.log('loaded', (Date.now() - t0) / 1000, 's', await evaluate(`innerWidth + 'x' + innerHeight + '@' + devicePixelRatio + ' gpu:' + !!navigator.gpu`));
if (process.env.SHOTS) {
  // SHOTS="<js>|<js>|…": after the map is baked and 10 s on, run each expression in the page and save a frame after it (out-<i>.png).
  const { writeFileSync: save } = await import('node:fs');
  while (!(await evaluate('!!document.body.dataset.bake'))) await sleep(1000);
  await sleep(10000);
  for (const [i, js] of process.env.SHOTS.split('|').entries()) {
    console.log('shot', i, await evaluate(js));
    await sleep(3000);
    const png = await send('browsingContext.captureScreenshot', { context });
    save(out.replace(/\.json$/, '') + `-${i}.png`, Buffer.from(png.data, 'base64'));
  }
  await send('session.end', {}).catch(() => {});
  process.exit(0);
}
if (process.env.PROBE) {
  // One expression in the page (awaited), printed, then out: for finding why a run stalls.
  console.log('probe', await Promise.race([evaluate(process.env.PROBE), sleep(Number(process.env.PROBE_S ?? 20) * 1000).then(() => "probe timed out")]));
  await send('session.end', {}).catch(() => {});
  process.exit(0);
}
let report = null;
let last = '';
const limit = Number(process.env.LIMIT_S ?? 1500) * 1000;
while (Date.now() - t0 < limit) {
  await sleep(5000);
  const r = await evaluate(`document.body.dataset.benchmark === 'done' ? JSON.stringify(globalThis.duty?.benchmark) : (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160)`);
  if (typeof r === 'string' && r.startsWith('[')) { report = JSON.parse(r); break; }
  if (r !== last) { console.log(Math.round((Date.now() - t0) / 1000) + 's', r); last = r; }
}
writeFileSync(out, JSON.stringify({ url, size: [w, h], firefox: true, report, stderrTail: report ? undefined : errTail }, null, 1));
for (const r of report ?? []) console.log(r.map, r.backend, r.adapter, r.resolution?.join('x'), 'mean', r.meanMs, 'low1', r.low1Ms, 'gpu', JSON.stringify(r.gpuMs), 'draws', r.drawCalls?.mean);
await send('session.end', {}).catch(() => {});
process.exit(report ? 0 : 2);
