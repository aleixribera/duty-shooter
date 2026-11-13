// A newcomer with a fresh profile opens the link and takes the first way into a match the menu offers.
// Times each step from the page opening to the match going live (countdown over, the player free to move),
// and photographs the menu, each screen on the way, the countdown's goal plate and the first hint line.
//
//   node .scratch/next-level/newcomer/look.mjs <out> [online|bot|range ...]
//
// BASE (default http://localhost:5173/) is the dev server; point it at the game server (http://localhost:3000/)
// to time the production build. Play Online needs the game server (`npm run server`, PASSPHRASE empty).
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/newcomer/run';
const paths = process.argv.slice(3).length ? process.argv.slice(3) : ['online', 'bot'];
const BASE = process.env.BASE ?? 'http://localhost:5173/';
const PHONE = process.env.PHONE === '1';
mkdirSync(out, { recursive: true });

const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

// What a newcomer sees right now: the screen's title, its buttons, the match's phase, the goal plate and the hint.
const LOOK = `(() => {
  const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const buttons = [...document.querySelectorAll('button')].filter((b) => vis(b) && !b.disabled).map((b) => b.innerText.trim().split('\\n')[0]).filter(Boolean);
  const title = [...document.querySelectorAll('h1')].filter(vis).map((h) => h.innerText.trim())[0] ?? null;
  const d = globalThis.duty?.driver;
  const m = d?.match ?? null;
  const round = document.querySelector('.ds-round');
  const hint = document.querySelector('.ds-hintline');
  const loading = [...document.querySelectorAll('.ds-loading, .ds-load, [class*=loading]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean)[0] ?? null;
  return {
    title, buttons, loading,
    driver: !!d,
    phase: m ? m.phase : d ? 'none' : null,
    counting: m ? m.countdownEnds !== null && d.serverTime < m.countdownEnds : false,
    goal: vis(round) ? round.innerText.replace(/\\s+/g, ' ').trim() : null,
    hint: vis(hint) && !hint.hidden ? hint.innerText.replace(/\\s+/g, ' ').trim() : null,
  };
})()`;

const summary = {};
for (const path of paths) {
  const chrome = await launchChrome();
  const t = { path };
  const events = [];
  let t0 = 0;
  const now = () => Math.round((performance.now() - t0) / 100) / 10;
  const mark = (what, extra = {}) => {
    events.push({ at: now(), what, ...extra });
    console.log(`${path} ${now()}s ${what}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
  };
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    if (s.result?.data) writeFileSync(`${out}/${path}-${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const look = () => chrome.evaluate(LOOK);
  const click = async (text) => {
    const r = await chrome.send('Runtime.evaluate', {
      userGesture: true,
      returnByValue: true,
      expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
    });
    const ok = r.result?.result?.value === true;
    if (ok) mark(`click ${text}`);
    return ok;
  };
  // Waits until `test(view)` holds, sampling every 200 ms; returns the view or null.
  const until = async (test, ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const v = await look().catch(() => null);
      if (v && test(v)) return v;
      await sleep(200);
    }
    return null;
  };
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
    if (PHONE) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    t0 = performance.now();
    await chrome.navigate(`${BASE}?nolock${path === 'online' && BASE.includes(':5173') ? '&online' : ''}`);
    mark('open');
    // The menu is up when its first way in can be clicked.
    const want = path === 'online' ? 'Play Online' : path === 'bot' ? 'Bot Match' : 'Practice Range';
    const menu = await until((v) => v.buttons.some((b) => b.toUpperCase().startsWith(want.toUpperCase())), 120_000);
    if (!menu) throw new Error(`no ${want} on the menu`);
    t.menu = now();
    mark('menu', { buttons: menu.buttons });
    await shot('1-menu');
    if (!(await click(want))) throw new Error(`could not click ${want}`);
    // A way in that stops for a name: the newcomer types one and presses again.
    await sleep(300);
    const asked = await chrome.evaluate(`(() => { const a = document.activeElement; return a?.tagName === 'INPUT' && !a.value ? (a.placeholder || 'a field') : null; })()`);
    if (asked) {
      mark('asked for a name', { field: asked });
      await shot('1b-name');
      await sleep(1500);
      await chrome.send('Input.insertText', { text: 'Newcomer' });
      if (!(await click(want))) throw new Error(`could not click ${want} again`);
    }
    // Each screen on the way: press the primary way forward until a match has a driver.
    const forward = ['Quick Play', 'Join', 'Start', 'Ready'];
    let screens = 0;
    const seen = new Set();
    while (true) {
      await sleep(400);
      const v = await look();
      if (v.driver && (v.goal !== null || v.hint !== null || v.phase === 'playing')) break;
      const key = `${v.title}|${v.buttons.join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        screens += 1;
        mark('screen', { title: v.title, buttons: v.buttons.slice(0, 14), loading: v.loading });
        await shot(`2-screen-${screens}`);
      }
      const next = forward.find((f) => v.buttons.some((b) => b.toUpperCase() === f.toUpperCase() || b.toUpperCase().startsWith(`${f.toUpperCase()} `)));
      if (next) await click(next);
      if (now() > 120) throw new Error('no match in 120 s');
    }
    t.clicks = events.filter((e) => e.what.startsWith('click')).length;
    t.driver = now();
    const atDriver = await look();
    mark('driver', { phase: atDriver.phase, counting: atDriver.counting, goal: atDriver.goal });
    const first = await until((v) => v.goal !== null, 8_000);
    if (first?.goal) {
      t.goal = first.goal;
      mark('goal plate', { goal: first.goal });
      await shot('3-countdown');
    }
    const live = await until((v) => (v.phase === 'playing' || v.phase === 'none') && !v.counting, 60_000);
    if (!live) throw new Error('never went live');
    t.live = now();
    mark('live');
    await shot('4-live');
    const hinted = await until((v) => v.hint !== null, 15_000);
    if (hinted) {
      t.hint = hinted.hint;
      t.hintAt = now();
      mark('hint', { hint: hinted.hint });
      await shot('5-hint');
    }
  } catch (e) {
    t.failed = e.message;
    mark(`failed: ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    t.events = events;
    t.errors = chrome.errors.slice(0, 5);
    summary[path] = t;
    await chrome.close();
  }
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
for (const [p, t] of Object.entries(summary)) console.log(`${p}: menu ${t.menu}s, live ${t.live}s, ${t.clicks} clicks, goal ${t.goal ? 'yes' : 'no'}, hint ${t.hint ?? 'none'}${t.failed ? `, FAILED ${t.failed}` : ''}`);
