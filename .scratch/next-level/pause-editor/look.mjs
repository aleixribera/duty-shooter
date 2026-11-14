// PLAN item 9e (ticket 119): the full loadout editor from the pause menu, mid-match. Team deathmatch on Switchyard:
// walks at the enemy until killed, then Esc (pause), Loadout: the editor over the match, its chip counting the respawn
// it doesn't hold; the second kept loadout picked there, Done, Resume, and the next life carries it. Alive, the same
// path picks the third: the life goes on with the second, and the life after carries the third. Phone width at the end.
// A Bot Match holds still while paused; ONLINE=1 plays it on a local server (`npm run server`, port 3000; the dev
// server proxies it with ?online), where the respawn keeps counting behind the editor. Needs the dev server.
//
//   node .scratch/next-level/pause-editor/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const ONLINE = process.env.ONLINE === '1';
const OUT = process.argv[2] ?? `.scratch/next-level/pause-editor/${ONLINE ? 'online' : 'bot-match'}`;
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
let W = 1920;
let H = 1080;

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const vk = (code) => (code.startsWith('Key') ? code.charCodeAt(3) : code === 'Escape' ? 27 : 0);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: vk(code) });
const press = async (code) => {
  await key('keyDown', code);
  await sleep(60);
  await key('keyUp', code);
};
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
const facts = `(() => {
  const p = duty.game.player;
  const chip = document.querySelector('.ds-menu:not([hidden]) .ds-chip');
  return {
    alive: p?.alive ?? null,
    primary: p?.loadout?.primary ?? null,
    respawnIn: duty.driver?.respawnIn ?? null,
    paused: duty.game.paused,
    // Range Control's caption: up (speaking) and whether it shows through the menu.
    caption: (() => { const c = document.querySelector('.ds-caption'); return c?.classList.contains('on') ? getComputedStyle(c).display : null; })(),
    screen: document.querySelector('.ds-menu:not([hidden]) h1')?.innerText ?? null,
    chip: chip && chip.style.display !== 'none' ? chip.innerText : null,
    sets: [...document.querySelectorAll('.ds-menu:not([hidden]) .ds-sets button')].map((b) => (b.classList.contains('on') ? '*' : '') + b.innerText.replace(/\\s+/g, ' ')),
  };
})()`;
const report = { steps: [], errors: chrome.errors };
const log = async (step) => {
  const f = await js(facts);
  report.steps.push({ step, ...f });
  console.log(step, JSON.stringify(f));
  return f;
};
const fightUntilDead = async () => {
  const STEER = steer({ range: 60, chase: 1 });
  const held = { walk: false, pressed: false };
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && (await js(`duty.game.player?.alive ?? true`))) {
    const want = await js(STEER);
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.fire !== held.pressed) await mouse(want.fire ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, pressed: want.fire });
    }
    await sleep(40);
  }
  if (held.walk) await key('keyUp', 'KeyW');
  if (held.pressed) await mouse('mouseReleased');
};
const untilAlive = async () => {
  for (let i = 0; i < 600 && !(await js(`duty.game.player?.alive === true`)); i++) await sleep(20);
};
/** Picks the first kept loadout that isn't lit; its name. */
const pickOther = () => js(`(() => { const b = [...document.querySelectorAll('.ds-menu:not([hidden]) .ds-sets button')].find((b) => !b.classList.contains('on')); b?.click(); return b?.querySelector('b')?.innerText ?? null; })()`);
/** Esc, Loadout: the editor over the match. */
const openEditor = async () => {
  await press('Escape');
  await sleep(300);
  if (!(await click('Loadout'))) throw new Error('no Loadout on the pause menu');
  await sleep(600);
};
const backToGame = async () => {
  await click('Done');
  await sleep(300);
  await click('Resume');
  await sleep(300);
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock${ONLINE ? '&online' : ''}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  if (ONLINE) {
    if (!(await click('Play Online'))) throw new Error('no Play Online');
    await sleep(800);
    // The name, asked once, and the local server's passphrase (PASSPHRASE=dev in .claude/launch.json).
    await chrome.evaluate(`(() => { const [name, pass] = document.querySelectorAll('.ds-menu:not([hidden]) input'); for (const [i, v] of [[name, 'Tester'], [pass, 'dev']]) if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    if (!(await click('Join'))) await click('Play Online');
    await sleep(1500);
    await chrome.evaluate(`(() => { const [name, pass] = document.querySelectorAll('.ds-menu:not([hidden]) input'); for (const [i, v] of [[name, 'Tester'], [pass, 'dev']]) if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await click('Join');
    await sleep(4000);
    for (const p of ['Switchyard', 'Team deathmatch']) await click(p).then(() => sleep(400));
    if (!(await click('Start'))) throw new Error('no Start in the lobby');
  } else {
    for (const p of ['Bot Match', 'Switchyard', 'Team deathmatch', 'Hard', 'Start']) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(400);
    }
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive === true`, 120_000))) throw new Error('the match did not start');
  await sleep(6000);
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, 'Switchyard').catch((e) => console.log('no routes', e.message));
  await log('0 alive');
  await fightUntilDead();
  await sleep(200);
  await openEditor();
  const a = await log('1 dead, editor open');
  await shot('1-dead-editor');
  await sleep(1500);
  const b = await log('2 1.5 s later');
  await shot('2-later');
  console.log(`respawn ${a.respawnIn} -> ${b.respawnIn}: ${ONLINE ? 'counts on' : 'held with the match'}`);
  console.log('picked', await pickOther());
  await sleep(300);
  await log('3 picked another');
  await shot('3-picked-second');
  await backToGame();
  await untilAlive();
  await sleep(800);
  await log('4 the next life');
  await openEditor();
  await log('5 alive, editor open');
  await shot('5-alive-editor');
  console.log('picked', await pickOther());
  await sleep(300);
  await log('5b picked a third');
  await backToGame();
  await sleep(500);
  await log('6 alive after picking the third: still the second');
  await fightUntilDead();
  await untilAlive();
  await sleep(800);
  await log('7 the life after: the third');
  await fightUntilDead();
  await sleep(200);
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  W = 390;
  H = 844;
  await sleep(500);
  await openEditor();
  await log('8 phone, dead, editor');
  await shot('8-phone-editor');
} catch (e) {
  console.log('failed:', e.message);
  report.failed = e.message;
  await shot('failed');
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await chrome.close();
}
