// Ticket 24's look in a real Local bots Battle Royale: the HUD while playing (with a ping, the
// Supply Drop, Reboot and Kill Leader toasts and feed lines put up at once), the board, the pause,
// then standing still until the bots put you Downed and out (the recap, the spectator) and the match
// card. Every shot at 1920x1080 and at 390x844 from the same match: the page is resized between them.
// Headless, muted Chrome.
//   remote-test --local "node .scratch/battle-royale/t24/br.mjs <label>"
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const label = process.argv[2] ?? 'shot';
const VPORT = Number(process.env.VPORT ?? 5241);
const LIMIT = Number(process.env.LIMIT ?? 300);
const out = `.scratch/battle-royale/t24/shots/${label}`;
mkdirSync(out, { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '-c', '.scratch/battle-royale/t23/vite.frozen.mjs'], { env: { ...process.env, VPORT: String(VPORT), DUTY_SERVER: 'http://127.0.0.1:1' }, stdio: ['ignore', 'ignore', 'inherit'] });
const say = (t) => console.log(`${new Date().toISOString().slice(11, 19)} ${t}`);
const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)));
  globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text));
})();`;
let chrome;
try {
  for (let i = 0; i < 200; i++) {
    if (await fetch(`http://localhost:${VPORT}/`).then((r) => r.ok).catch(() => false)) break;
    await sleep(300);
  }
  chrome = await launchChrome();
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const size = (w, h, mobile) => chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const snap = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${name}`);
  };
  /** The same moment at both sizes. */
  const both = async (name, before) => {
    await size(1920, 1080, false);
    await sleep(500);
    if (before) await before();
    await snap(`${name}-desktop`);
    await size(390, 844, true);
    await sleep(700);
    if (before) await before();
    await snap(`${name}-phone`);
    await size(1920, 1080, false);
    await sleep(300);
  };
  const key = async (code, k, hold = 80) => {
    const vk = { Tab: 9, Escape: 27, KeyM: 77 }[code] ?? 0;
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(hold);
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  await size(1920, 1080, false);
  await chrome.navigate(`http://localhost:${VPORT}/?nolock`);
  await chrome.waitFor(`location.protocol === 'http:' && !!globalThis.__find?.('Battle Royale')`, 120000, 200);
  await chrome.evaluate(`__find('Battle Royale').click()`);
  await chrome.waitFor(`!!document.querySelector('.ds-royale [data-key="source-local"]')`, 30000, 100);
  await chrome.evaluate(`document.querySelector('[data-key="source-local"]').click()`);
  await sleep(300);
  // Duos: pings, a mate, the Reboot Card and the Downed recap all need a Squad.
  await chrome.evaluate(`document.querySelector('[data-key="squads-2"]')?.click()`);
  await sleep(300);
  await chrome.evaluate(`const i = document.querySelector('.ds-royale input[name="name"]'); i.value = 'Ada'; document.querySelector('.ds-royale [data-key="go"]').click()`);
  await chrome.waitFor(`!!document.querySelector('.ds-royale [data-act="start"]')`, 180000, 250);
  await chrome.evaluate(`document.querySelector('.ds-royale [data-act="start"]').click()`);
  await chrome.waitFor(`!!document.querySelector('.ds-prep:not([hidden])')`, 120000, 200);
  await sleep(2500);
  await chrome.evaluate(`__find('Ready')?.click()`);
  await chrome.waitFor(`!document.querySelector('.ds-prep:not([hidden])')`, 60000, 200);
  say('playing');
  // Lock the pointer (the probe's fake) by a click on the page, as a player would.
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', clickCount: 1 });
  await chrome.waitFor(`(() => { const g = duty.game, p = g.player; return !!p?.alive && !g.paused && p.movement !== 'airborne'; })()`, 120000, 300);
  await sleep(1500);
  await both('01-playing');
  // A ping where you look, then the toasts and feed lines that land in a match, all at once: the worst case for overlap.
  await chrome.evaluate(`duty.game.input.setAngles(0, -0.25)`);
  await sleep(400);
  for (let i = 0; i < 6; i++) {
    await chrome.evaluate(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1 }))`);
    await sleep(80);
    await chrome.evaluate(`document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1 }))`);
    if (await chrome.waitFor(`document.querySelectorAll('.ds-ping').length > 0`, 2000, 100).then(() => true, () => false)) break;
  }
  say(`pings: ${await chrome.evaluate(`document.querySelectorAll('.ds-ping').length`)}`);
  const pieces = async () => {
    await chrome.evaluate(`(() => { const h = duty.game.hud;
      h.objectiveFeed('Rook is the Kill Leader: 4 eliminations', 2, false);
      h.objectiveFeed('Squad wiped: Briar and Ember', 3, false);
      h.toast('Supply Drop incoming in Harbor C4: lands in 30 s.', 8); })()`);
    await sleep(400);
  };
  await both('02-pieces', pieces);
  // The Downed recap over the same moment (as when a bot puts you Downed): the HUD's own update, with the recap a Downed player gets.
  await chrome.evaluate(`(() => { const h = duty.game.hud; const u = h.update.bind(h); h.__u = u;
    h.update = (s) => u({ ...s, recap: { what: 'downed', cause: 'bullet', attacker: 7, name: 'Rook', bot: true, weapon: 'M4A1', distance: 38, dealt: 42, taken: 100, health: 64, at: null } }); })()`);
  await both('02b-recap', pieces);
  await chrome.evaluate(`(() => { const h = duty.game.hud; h.update = h.__u; })()`);
  await chrome.evaluate(`duty.game.hud.toast("You carry Briar's Reboot Card: take it to a Beacon and hold F.", 8)`);
  await both('03-reboot-toast');
  await key('Tab', 'Tab', 10);
  // Hold the board: a keyDown without its keyUp until both shots are in.
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await both('04-board');
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await chrome.evaluate(`duty.menu.show('pause')`);
  await both('05-pause');
  await chrome.evaluate(`duty.game.resume?.() ?? duty.menu.hide()`).catch(() => {});
  await chrome.evaluate(`__find('Resume')?.click()`).catch(() => {});
  await sleep(800);
  // Stand still until the bots finish it: Downed (the recap), out (the spectator), the card.
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < LIMIT * 1000) {
    await sleep(700);
    const st = await ev(`const v = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
      return { recap: v('.ds-recap'), spec: v('.ds-spec'), card: v('.ds-card.on'), royale: v('.ds-royale'), top: document.querySelector('.ds-br-top')?.innerText.replace(/\\s+/g, ' ') ?? null }`);
    for (const k of ['recap', 'spec', 'card']) {
      if (st?.[k] && !seen.has(k)) {
        seen.add(k);
        say(`${k} after ${Math.round((Date.now() - t0) / 1000)} s (${st.top})`);
        await both(`06-${k}`);
      }
    }
    if (seen.has('card') || st?.royale) break;
  }
  say(`seen: ${[...seen].join(', ') || 'nothing'}`);
  const errors = await ev('return globalThis.__errors ?? []');
  if (errors.length) say(`errors: ${JSON.stringify(errors.slice(0, 5))}`);
} finally {
  await chrome?.close();
  vite.kill();
}
process.exit(0);
