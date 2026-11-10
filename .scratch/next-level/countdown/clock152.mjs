// node clock152.mjs <out dir>   The last minute's clock on the match bar: what it reads, and how often the bar itself is rebuilt
// (its children replaced) against how often the clock is painted, through the last 12 s of a 75 s Bot Match.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'clock152';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const chrome = await launchChrome();
const shot = async (name) => writeFileSync(`${OUT}/${name}-${W}.png`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://localhost:5199/?nolock&matchtime=75`);
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 120000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  for (const p of ['Bot Match', process.env.MAP ?? 'Survival Town', 'Team Deathmatch', 'Start']) {
    if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive`, 240000))) throw new Error('match did not start');
  const left = () => chrome.evaluate(`(() => { const m = duty.driver?.match; return m && m.phase === 'playing' && m.phaseEnds != null ? Math.min(m.timeLimit, m.phaseEnds - duty.driver.serverTime) : -1; })()`);
  const read = () => chrome.evaluate(`JSON.stringify({ mid: document.querySelector('.ds-match .mid')?.innerText ?? null, cls: document.querySelector('.ds-match .clock')?.className ?? null, fuse: document.querySelector('.ds-match .fuse i')?.style.transform ?? null, w: Math.round(document.querySelector('.ds-match .mid')?.getBoundingClientRect().width ?? 0), toast: (() => { const t = document.querySelector('.ds-toast'); return t && getComputedStyle(t).opacity !== '0' && t.getClientRects().length ? t.innerText : null; })() })`);
  const said = [];
  const at = async (t, name) => { while ((await left()) > t) await sleep(15); said.push({ at: t, ...JSON.parse(await read()) }); if (name) await shot(name); };
  await at(62); await at(58, 'minute'); await at(30);
  while ((await left()) > 12) await sleep(20);
  await chrome.evaluate(`(() => { const bar = document.querySelector('.ds-match'); const c = globalThis.__count = { rebuilt: 0, painted: 0, from: performance.now() }; new MutationObserver((list) => { for (const m of list) { if (m.target === bar && m.type === 'childList') c.rebuilt++; else c.painted++; } }).observe(bar, { childList: true, subtree: true, characterData: true, attributes: true }); })()`);
  await at(9.95, 'tick'); await at(8.5, 'ten'); await at(3);
  while ((await left()) > 0.3) await sleep(20);
  console.log(JSON.stringify({ said, count: JSON.parse(await chrome.evaluate(`JSON.stringify({ ...globalThis.__count, seconds: Math.round((performance.now() - globalThis.__count.from) / 100) / 10 })`)), errors: chrome.errors.slice(0, 5) }, null, 1));
} finally { await chrome.close(); }
