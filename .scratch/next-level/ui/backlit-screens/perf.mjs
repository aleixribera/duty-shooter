// Ticket 114: the Backlit UI's cost. Frame times in the main menu and in a Bot Match on Survival Town, uncapped, with
// the page's CPU slowed (Chrome's throttle, as on a weak laptop), for two production builds served from this PC.
//   node .scratch/next-level/ui/backlit-screens/perf.mjs <label>=<dist dir or dev server URL> […]
// A production build pauses a match without pointer lock (`?nolock` is dev-only), so a match is measured on dev servers.
// Runs the builds in turn, ROUNDS times (default 2), so drift on this busy PC lands on both.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../../apps/range/scripts/chrome.mjs';

const RATE = Number(process.env.RATE ?? 4);
const ROUNDS = Number(process.env.ROUNDS ?? 2);
const builds = process.argv.slice(2).map((a) => a.split('='));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'audio/webm' };

function serve(dir, port) {
  const server = createServer(async (req, res) => {
    let path = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) => server.listen(port, () => done(server)));
}

const PROBE = `(() => {
  const ft = (globalThis.__ft = { on: false, d: [], last: 0 });
  const raf = window.requestAnimationFrame.bind(window);
  const tick = (t) => { if (ft.on && ft.last) ft.d.push(t - ft.last); ft.last = t; raf(tick); };
  raf(tick);
})()`;

// A production build has no `duty` hooks: the script reads the page.
const VISIBLE = (text) => `[...document.querySelectorAll('button')].some((b) => b.offsetParent && b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())}))`;
const CLICK = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())})); b?.click(); return !!b; })()`;

async function sample(chrome, ms) {
  await chrome.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await sleep(1500);
  await chrome.evaluate('__ft.d = []; __ft.last = 0; __ft.on = true');
  await sleep(ms);
  const d = await chrome.evaluate('(() => { __ft.on = false; return __ft.d; })()');
  await chrome.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const s = [...d].sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const low = s.slice(Math.floor(s.length * 0.99));
  const r = (v) => Math.round(v * 100) / 100;
  return { frames: d.length, meanMs: r(mean), p50Ms: r(s[Math.floor(s.length / 2)]), p99Ms: r(s[Math.floor(s.length * 0.99)]), low1Ms: r(low.reduce((a, b) => a + b, 0) / low.length), over50: d.filter((v) => v > 50).length };
}

const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

async function run(label, base) {
  const chrome = await launchChrome({ uncapped: true });
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    await chrome.navigate(new URL('?nolock', base).toString());
    if (!(await chrome.waitFor(VISIBLE('Bot Match'), 120_000))) throw new Error('no menu');
    await sleep(Number(process.env.MENU_WAIT ?? 10_000));
    const menu = await sample(chrome, 12_000);
    await chrome.evaluate(CLICK('Bot Match'));
    await sleep(1500);
    await chrome.evaluate(CLICK('Start'));
    if (!(await chrome.waitFor("(() => { const m = document.querySelector('.ds-match'); return !!m && getComputedStyle(m).display === 'flex'; })()", 180_000))) {
      const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
      if (shot.result?.data) writeFileSync(new URL('./perf-fail.jpg', import.meta.url), Buffer.from(shot.result.data, 'base64'));
      throw new Error(`no match; buttons: ${await chrome.evaluate("[...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim().slice(0, 30)).join(' | ')")}`);
    }
    await sleep(6000);
    const match = await sample(chrome, 15_000);
    const map = await chrome.evaluate("document.querySelector('.ds-match .sub')?.textContent ?? null");
    return { label, map, menu, match };
  } finally {
    await chrome.close();
  }
}

const results = [];
const bases = builds.map(([, src], i) => (src.startsWith('http') ? src : `http://localhost:${4810 + i}/`));
const servers = await Promise.all(builds.filter(([, src]) => !src.startsWith('http')).map(([, dir]) => serve(dir, 4810 + builds.findIndex(([, d]) => d === dir))));
try {
  for (let round = 0; round < ROUNDS; round++)
    for (const [i, [label]] of builds.entries()) {
      const r = await run(label, bases[i]);
      results.push(r);
      console.log(`${label} round ${round + 1} (${r.map}): menu mean ${r.menu.meanMs} ms, 1% low ${r.menu.low1Ms} | match mean ${r.match.meanMs} ms, 1% low ${r.match.low1Ms}, >50 ms ${r.match.over50}`);
    }
} finally {
  for (const s of servers) s.close();
}
writeFileSync(new URL('./perf.json', import.meta.url), JSON.stringify({ rate: RATE, results }, null, 2));
