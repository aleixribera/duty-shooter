// PLAN item 1b (Backlit UI), pass 2: frames of every screen at desktop, phone sideways and phone upright.
//   node .scratch/next-level/ui/backlit-screens/look.mjs <out dir> [parts]   (dev server on :5173)
// parts: comma list of pages (the menu's pages), royale (the Battle Royale screen), match (a Bot Match: setup, HUD,
// scoreboard, pause, the end panel). Default: all three.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [parts]');
const parts = (process.argv[3] ?? 'pages,royale,match').split(',');
mkdirSync(out, { recursive: true });
const SIZES = [
  [1920, 1080, false],
  [844, 390, true],
  [390, 844, true],
];
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  );
const key = async (code, type) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code === 'Escape' ? 'Escape' : code, windowsVirtualKeyCode: code === 'Escape' ? 27 : code === 'Tab' ? 9 : 0 });
const open = async (params = '') => {
  await chrome.navigate(`http://localhost:5173/?nolock${params}`);
  if (!(await chrome.waitFor(`globalThis.duty?.game && globalThis.duty?.menu?.open`, 180_000, 500))) throw new Error('menu did not open');
  await sleep(4000);
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const [W, H, mobile] of SIZES) {
    const tag = `${W}x${H}`;
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (parts.includes('pages')) {
      await open();
      for (const screen of ['online', 'settings', 'profile', 'changelog', 'loadout']) {
        await chrome.evaluate(`duty.menu.show(${JSON.stringify(screen)})`);
        await sleep(700);
        await shot(`${screen}-${tag}`);
      }
      await chrome.evaluate(`duty.menu.loading('Loading Survival Town', 0.42)`);
      await sleep(400);
      await shot(`loading-${tag}`);
      await chrome.evaluate(`duty.menu.show('error', 'The server did not answer. It may be restarting: try again in a minute.')`);
      await sleep(400);
      await shot(`error-${tag}`);
    }
    if (parts.includes('royale')) {
      await open();
      if (await click('Battle Royale')) {
        await sleep(1500);
        await shot(`royale-${tag}`);
      }
    }
    if (parts.includes('kill') && !(W < H)) {
      // The kill's beats, played on the HUD by hand while walking a map: frames at 200 ms (+score lit) and 1 s (lines and Medal).
      await chrome.navigate(`http://localhost:5173/?explore=survival-town&nolock`);
      if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 180_000, 500))) throw new Error('map did not start');
      await sleep(3000);
      await chrome.evaluate(`(() => { const h = duty.game.hud;
        h.killFeed('Rook', 'Comet', false, false, { killer: true, victim: true }, 'Wasp 9', { killer: 1, victim: 2 });
        h.killFeed('You', 'Vandal', true, true, { victim: true }, 'M4A1', { killer: 1, victim: 2 });
        h.hitMarker('headshotKill');
        h.score({ lines: [{ points: 100, label: 'Eliminated', note: 'Vandal' }, { points: 50, label: 'Headshot', note: '' }, { points: 50, label: 'Long shot', note: '62 m' }], medal: 'Long shot 62 m', points: 200 });
      })()`);
      await sleep(200);
      await shot(`kill-200ms-${tag}`);
      await sleep(800);
      await shot(`kill-1s-${tag}`);
    }
    if (parts.includes('match') && !(W < H)) {
      await open('&matchtime=35');
      for (const p of ['Bot Match', 'Survival Town', 'Team Deathmatch']) {
        if (!(await click(p))) throw new Error(`no "${p}" button`);
        await sleep(400);
      }
      await click('Mixed teams');
      await sleep(500);
      await shot(`botmatch-${tag}`);
      if (!(await click('Start'))) throw new Error('no Start button');
      if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000, 500))) throw new Error('match did not start');
      await sleep(3000);
      await shot(`hud-${tag}`);
      await key('Tab', 'keyDown');
      await sleep(500);
      await shot(`board-${tag}`);
      await key('Tab', 'keyUp');
      await key('Escape', 'keyDown');
      await key('Escape', 'keyUp');
      await sleep(800);
      await shot(`pause-${tag}`);
      await click('Resume');
      await chrome.waitFor(`duty.driver?.match?.phase !== 'playing'`, 120_000, 500);
      await sleep(2500);
      await shot(`end-${tag}`);
    }
  }
} finally {
  const errors = chrome.errors?.slice(0, 5) ?? [];
  if (errors.length) console.log(`page errors: ${errors.join(' | ').slice(0, 400)}`);
  await chrome.close();
}
