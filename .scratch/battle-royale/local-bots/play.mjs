// Ticket 15's play-through: a Local bots Battle Royale in the production build, in a
// real (headless, muted) Chrome: the screen's Local bots choice, the lobby, Start, the
// Preparation, play with the worker's 59 bots, and the match's end back to the lobby.
// Measures frame times, the page's main-thread time (CDP Performance metrics) and the
// worker's tick cost while playing.
//   remote-test --local "node .scratch/battle-royale/local-bots/play.mjs"
// SQUADS=3 for Trios. Build first into .scratch/battle-royale/local-bots/dist.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const PORT = Number(process.env.PORT ?? 5331);
const SQUADS = Number(process.env.SQUADS ?? 1);
const PLAY = Number(process.env.PLAY ?? 40);
const tag = process.env.TAG ?? `s${SQUADS}`;
const out = `.scratch/battle-royale/shots/local-bots`;
mkdirSync(out, { recursive: true });
const vite = spawn(process.execPath, [`${process.cwd()}/node_modules/vite/bin/vite.js`, 'preview', '--outDir', `${process.cwd()}/.scratch/battle-royale/local-bots/${process.env.DIST ?? 'dist'}`, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: 'apps/range', stdio: ['ignore', 'inherit', 'inherit'] });
const say = (t) => console.log(`${new Date().toISOString().slice(11, 19)} ${t}`);
let failed = false;
const check = (what, ok) => {
  say(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
const until = async (name, test, ms = 30000, every = 200) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await test().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out: ${name}`);
    await sleep(every);
  }
};
const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)));
  const perf = (globalThis.__perf = { frames: null });
  perf.start = () => { const t = []; perf.frames = t; let last = performance.now(); const f = (now) => { if (perf.frames !== t) return; t.push(now - last); last = now; requestAnimationFrame(f); }; requestAnimationFrame(f); };
  perf.stop = () => { const t = perf.frames ?? []; perf.frames = null; return t; };
  globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text));
})();`;
let chrome;
const DIST_DIR = `${process.cwd()}/.scratch/battle-royale/local-bots/${process.env.DIST ?? 'dist'}`;
/** What the page fetched so far, from its resource timings, as files of the build: raw bytes and gzip -9 (the server sends brotli, a little smaller). */
const downloaded = async (ev, extra = []) => {
  const names = [...new Set([...(await ev(`return performance.getEntriesByType('resource').map((e) => e.name)`)), ...extra])];
  let raw = 0;
  let gz = 0;
  const files = [];
  for (const name of names) {
    const path = new URL(name).pathname;
    const file = `${DIST_DIR}${path}`;
    if (!existsSync(file) || path === '/') continue;
    const bytes = readFileSync(file);
    const g = gzipSync(bytes, { level: 9 }).length;
    raw += bytes.length;
    gz += g;
    files.push([path, bytes.length, g]);
  }
  files.sort((a, b) => b[2] - a[2]);
  return { files: files.length, rawMb: +(raw / 1048576).toFixed(1), gzipMb: +(gz / 1048576).toFixed(1), largest: files.slice(0, 8).map(([p, r, g]) => `${p} ${(g / 1048576).toFixed(2)}`) };
};
const summarize = (rows) => {
  const r = rows.filter(Boolean);
  const mean = (k) => Math.round(r.reduce((s, x) => s + x[k], 0) / Math.max(1, r.length));
  return r.length ? { draws: mean('draws'), maxDraws: Math.max(...r.map((x) => x.maxDraws)), triangles: mean('triangles'), geometries: r.at(-1).geometries, textures: r.at(-1).textures } : null;
};
try {
  await until('preview', () => fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok), 60000, 300);
  chrome = await launchChrome();
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  await chrome.send('Performance.enable', { timeDomain: 'timeTicks' });
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${out}/${tag}-${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${tag}-${name}`);
  };
  const metrics = async () => Object.fromEntries((await chrome.send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
  const screen = () => ev(`const r = document.querySelector('.ds-royale:not([hidden])'); return r ? r.innerText.replace(/\\s+/g, ' ').slice(0, 1200) : null`);
  const prepText = () => ev(`return document.querySelector('.ds-prep:not([hidden])')?.innerText.replace(/\\s+/g, ' ').slice(0, 300) ?? null`);

  await chrome.navigate(`http://127.0.0.1:${PORT}/?stats${process.env.QUERY ? `&${process.env.QUERY}` : ''}`);
  await until('page', async () => (await chrome.evaluate('location.protocol')) === 'http:', 30000, 100);
  await chrome.waitFor(`!!globalThis.__find?.('Battle Royale')`, 60000, 100);
  await chrome.evaluate(`__find('Battle Royale').click()`);
  await chrome.waitFor(`!!document.querySelector('.ds-royale [data-key="source-local"]')`, 30000, 100);
  const before = await screen();
  check('the Local bots choice is on offer, no longer "coming soon"', !/coming soon/i.test(before) && (await ev(`return !document.querySelector('[data-key="source-local"]').disabled`)));
  await chrome.evaluate(`document.querySelector('[data-key="source-local"]').click()`);
  await sleep(300);
  const local = await screen();
  say(`  screen: ${local}`);
  check('Local bots says what it is and opens a lobby', /59 bots/.test(local) && /open lobby/i.test(local));
  await shot('01-screen-local');
  const size = (w, h, mobile = false) => chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await size(390, 844, true);
  await sleep(600);
  await shot('01-screen-local-phone');
  await size(1920, 1080);
  await sleep(300);
  if (SQUADS !== 1) await chrome.evaluate(`document.querySelector('[data-key="squads-${SQUADS}"]').click()`);
  await chrome.evaluate(`const i = document.querySelector('.ds-royale input[name="name"]'); i.value = 'Ada'; document.querySelector('.ds-royale [data-key="go"]').click()`);
  const t0 = Date.now();
  await until('lobby', () => ev(`return !!document.querySelector('.ds-royale [data-act="start"]')`), 120000, 200).catch(async (e) => {
    say(`  lobby wait failed; screen: ${await screen()}; errors: ${JSON.stringify(await ev('return globalThis.__errors ?? []'))}; body: ${await ev('return document.body.innerText.replace(/\s+/g, " ").slice(0, 600)')}`);
    throw e;
  });
  say(`  lobby after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const lobby = await screen();
  say(`  lobby: ${lobby}`);
  check('in the lobby on Local bots, as host', /Local bots · Lobby/i.test(lobby) && /You are the host/i.test(lobby));
  check(`the Squad size picked carries in (${SQUADS})`, SQUADS === 1 ? /Solos: everyone/i.test(lobby) : /Squad \d/i.test(lobby));
  await shot('02-lobby');
  await chrome.evaluate(`document.querySelector('.ds-royale [data-act="start"]').click()`);
  await until('preparation', () => prepText(), 60000, 100);
  // Everything the page fetched before the match could start; the worker fetched the island's nav itself.
  const beforeMatch = await downloaded(ev, [`http://127.0.0.1:${PORT}/nav/zero-island.nav`, `http://127.0.0.1:${PORT}/index.html`]);
  say(`  download before the match: ${JSON.stringify(beforeMatch)}`);
  const renderNow = () => ev(`return document.body.dataset.render ? JSON.parse(document.body.dataset.render) : null`);
  const prepRender = [];
  for (let i = 0; i < 6; i++) {
    await sleep(1000);
    if (i === 1 || i === 3) await shot(`03-preparation-${i}s`);
    prepRender.push(await renderNow());
  }
  say(`  preparation render: ${JSON.stringify(prepRender.at(-1))}`);
  const prepFrames = await (async () => { await chrome.evaluate('__perf.start()'); await sleep(3000); return ev('return __perf.stop()'); })();
  const prep = await prepText();
  say(`  preparation: ${prep}`);
  check('the Preparation opens with 60 alive', /60 ALIVE/i.test(prep));
  await shot('03-preparation');
  await chrome.evaluate(`__find('Ready')?.click()`);
  await until('play', async () => !(await prepText()), 30000, 100);
  await sleep(1500);
  await shot('04-playing');
  // Measure: frames, the main thread's busy time, the worker's ticks.
  const m0 = await metrics();
  await chrome.evaluate('__perf.start()');
  const started = Date.now();
  let alive = true;
  const playRender = [];
  while (Date.now() - started < PLAY * 1000 && alive) {
    await sleep(1000);
    playRender.push(await renderNow());
    const k = Math.round((Date.now() - started) / 1000);
    if (process.env.WATCH && k % 5 === 0) {
      const allies = await ev(`return [...document.querySelectorAll('.ds-allies > *')].filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim() + (e.className.includes('downed') ? ' [downed]' : '')).join(' | ')`);
      const hud = await ev(`return document.querySelector('.ds-br-top')?.innerText.replace(/\s+/g, ' ') ?? null`);
      const hp = await ev(`return document.body.innerText.match(/HEALTH\s*(\d+)/)?.[1] ?? null`);
      say(`WATCH ${k}s hp ${hp} hud ${hud} allies ${allies}`);
      if (k % 15 === 0) await shot(`w-${String(k).padStart(3, '0')}`);
      if (k % 30 === 0) {
        const key = (type) => chrome.send('Input.dispatchKeyEvent', { type, key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
        await key('keyDown'); await sleep(80); await key('keyUp'); await sleep(700);
        await shot(`w-${String(k).padStart(3, '0')}-map`);
        await key('keyDown'); await sleep(80); await key('keyUp');
      }
    }
    alive = !(await ev(`return !!document.querySelector('.ds-royale:not([hidden])')`));
  }
  if (process.env.PROFILE) {
    await chrome.send('Profiler.enable');
    await chrome.send('Profiler.setSamplingInterval', { interval: 200 });
    await chrome.send('Profiler.start');
    await sleep(6000);
    const { profile } = (await chrome.send('Profiler.stop')).result;
    const dt = profile.timeDeltas;
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    let total = 0;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const f = n.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
      total += dt[i] ?? 0;
    });
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${(v / total * 100).toFixed(1)}% ${k}`);
    writeFileSync(`${out}/${tag}-profile.txt`, top.join(String.fromCharCode(10)));
    writeFileSync(`${out}/${tag}.cpuprofile`, JSON.stringify(profile));
    say(`PROFILE ${top.join(String.fromCharCode(10))}`);
  }
  const frames = await ev('return __perf.stop()');
  const m1 = await metrics();
  await chrome.send('HeapProfiler.collectGarbage');
  const heap = (await metrics()).JSHeapUsedSize;
  const worker = await ev(`return document.body.dataset.localBots ? JSON.parse(document.body.dataset.localBots) : null`);
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const seconds = m1.Timestamp - m0.Timestamp;
  const task = (m1.TaskDuration - m0.TaskDuration) * 1000;
  const script = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
  const report = { tag, seconds: +seconds.toFixed(1), frames: frames.length, fps: +(frames.length / seconds).toFixed(1), frameMs: { mean: +(frames.reduce((s, f) => s + f, 0) / frames.length).toFixed(2), p50: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(2), worst: +q(1).toFixed(1) }, mainThreadMsPerFrame: +(task / frames.length).toFixed(2), scriptMsPerFrame: +(script / frames.length).toFixed(2), mainThreadBusy: +(task / (seconds * 1000)).toFixed(3), heapMb: Math.round(heap / 1048576), worker, download: { beforeMatch, inMatch: await downloaded(ev, [`http://127.0.0.1:${PORT}/nav/zero-island.nav`, `http://127.0.0.1:${PORT}/index.html`]) }, render: summarize(playRender), preparation: { frameMs: +(prepFrames.reduce((s, f) => s + f, 0) / prepFrames.length).toFixed(2), p99: +[...prepFrames].sort((a, b) => a - b)[Math.floor(prepFrames.length * 0.99)].toFixed(2), render: summarize(prepRender) } };
  say(`REPORT ${JSON.stringify(report)}`);
  writeFileSync(`${out}/${tag}-report.json`, JSON.stringify(report, null, 2));
  check('the worker keeps 60 ticks a second', worker && worker.ticks / worker.seconds > 57);
  const hud = await ev(`return document.querySelector('.ds-br-top')?.innerText.replace(/\\s+/g, ' ') ?? null`);
  say(`  hud: ${hud}`);
  // Play on to the end: standing still, a person is soon out, and the match ends (No humans left) or a Squad wins.
  if (process.env.QUICK) throw Object.assign(new Error('quick run: stopped after measuring'), { quick: true });
  await until('end of match, back on the screen', () => ev(`const r = document.querySelector('.ds-royale:not([hidden])'); return !!r?.querySelector('.last') && !!r.querySelector('[data-act="start"]')`), 15 * 60000, 1000);
  const after = await screen();
  say(`  after: ${after}`);
  check('the match ends and the lobby comes back with your place', /Last match/i.test(after) && /Start match/i.test(after) && /\d+(st|nd|rd|th) of \d+|win/i.test(after));
  await shot('05-after');
  const errs = await ev(`return globalThis.__errors ?? []`);
  check(`no page errors (${errs.join(' | ')})`, errs.length === 0);
} catch (e) {
  if (e.quick) say(e.message);
  else {
  failed = true;
  console.error(e);
  try {
    writeFileSync(`${out}/${tag}-fail.jpg`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data, 'base64'));
  } catch {}
  }
} finally {
  await chrome?.close().catch(() => {});
  vite.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
