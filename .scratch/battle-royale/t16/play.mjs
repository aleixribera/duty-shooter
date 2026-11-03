// Ticket 16: a whole Battle Royale watched from the Preparation to the nuke ending and
// back to the Battle Royale screen, in a real (headless, muted) Chrome.
//   SOURCE=server: the built server (t16/server-dist) run here on its own port, serving t16/dist.
//   SOURCE=local:  t16/dist served by vite preview, the Local bots worker.
//   SQUADS=1|3. REJOIN=1 leaves on purpose in the Preparation and comes back before the dive.
//   remote-test --local "SOURCE=server SQUADS=1 node .scratch/battle-royale/t16/play.mjs"
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const SOURCE = process.env.SOURCE ?? 'server';
const SQUADS = Number(process.env.SQUADS ?? 1);
const PORT = Number(process.env.PORT ?? 5361);
const tag = `${SOURCE}-s${SQUADS}`;
const root = process.cwd();
const out = `${root}/.scratch/battle-royale/shots/t16`;
mkdirSync(out, { recursive: true });
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
const dist = `${root}/.scratch/battle-royale/t16/dist`;
const proc =
  SOURCE === 'server'
    ? spawn(process.execPath, [`${root}/.scratch/battle-royale/t16/server-dist/main.js`], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: dist, EVENT_LOG: `${root}/.scratch/battle-royale/t16/events-${tag}.jsonl` }, stdio: ['ignore', openSync(`${root}/.scratch/battle-royale/t16/server-${tag}.log`, 'w'), 'inherit'] })
    : spawn(process.execPath, [`${root}/node_modules/vite/bin/vite.js`, 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: 'apps/range', stdio: ['ignore', 'inherit', 'inherit'] });
const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  navigator.getGamepads = () => [];
  addEventListener('error', (e) => (globalThis.__errors ??= []).push(String(e.message)));
  globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().startsWith(text));
})();`;
let chrome;
try {
  await until('page served', () => fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok), 60000, 300);
  chrome = await launchChrome();
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (js) => JSON.parse((await chrome.evaluate(`JSON.stringify((() => { ${js} })())`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(`${out}/${tag}-${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    say(`  shot ${tag}-${name}`);
  };
  const text = (sel) => ev(`const e = document.querySelector(${JSON.stringify(sel)}); return e && e.getClientRects().length ? e.innerText.replace(/\\s+/g, ' ').slice(0, 600) : null`);
  const screen = () => text('.ds-royale:not([hidden])');
  const prepText = () => text('.ds-prep:not([hidden])');
  const endText = () => text('.ds-end');
  const key = async (code, type = 'keyDown') => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.replace(/^Key/, '').toLowerCase(), windowsVirtualKeyCode: code === 'Escape' ? 27 : code === 'ShiftLeft' ? 16 : code.charCodeAt(3) });
  const press = async (code) => {
    await key(code, 'keyDown');
    await sleep(80);
    await key(code, 'keyUp');
  };

  await chrome.navigate(`http://127.0.0.1:${PORT}/`);
  await until('page', async () => (await chrome.evaluate('location.protocol')) === 'http:', 30000, 100);
  await chrome.waitFor(`!!globalThis.__find?.('Battle Royale')`, 60000, 100);
  await chrome.evaluate(`__find('Battle Royale').click()`);
  await chrome.waitFor(`!!document.querySelector('.ds-royale [data-key="source-${SOURCE}"]')`, 30000, 100);
  await chrome.evaluate(`document.querySelector('[data-key="source-${SOURCE}"]').click()`);
  await sleep(600);
  await chrome.evaluate(`const i = document.querySelector('.ds-royale input[name="name"]'); i.value = 'Ada'; i.dispatchEvent(new Event('input')); document.querySelector('.ds-royale [data-key="go"]').click()`);
  await until('lobby', () => ev(`return !!document.querySelector('.ds-royale [data-act="start"]')`), 180000, 300);
  if (SQUADS !== 1) {
    await chrome.evaluate(`document.querySelector('[data-key="squads-${SQUADS}"]').click()`);
    await sleep(800);
  }
  const lobby = await screen();
  say(`  lobby: ${lobby}`);
  await shot('01-lobby');
  await chrome.evaluate(`document.querySelector('.ds-royale [data-act="start"]').click()`);
  const prepAt = Date.now();
  await until('preparation', () => prepText(), 60000, 100);
  say(`  preparation: ${await prepText()}`);
  await sleep(1500);
  await shot('02-preparation');

  if (process.env.REJOIN) {
    // Leave on purpose (Esc, then Leave), then come back to the screen and join again before the dive.
    await press('Escape');
    await until('pause menu', () => ev(`return !!__find('Leave')`), 5000, 100);
    const controls = await text('.ds-keys');
    check('the pause screen in a Battle Royale lists the island map', /Island map/.test(controls ?? ''));
    await shot('03-pause-in-preparation');
    await chrome.evaluate(`__find('Leave').click()`);
    await until('the main menu', () => ev(`return !!__find('Battle Royale')`), 15000, 100);
    await shot('03-left');
    await chrome.evaluate(`__find('Battle Royale').click()`);
    await until('back on the screen', () => screen(), 15000, 100);
    say(`  after leaving: ${await screen()}`);
    // Join server, then Join the match: the seat is theirs again, back in the Preparation.
    for (let i = 0; i < 12 && ((await screen()) || !(await prepText())); i++) {
      const go = await ev(`const b = document.querySelector('.ds-royale:not([hidden]) [data-key="go"]'); return b && !b.disabled ? b.textContent.trim() : null`);
      say(`  go button: ${go}`);
      if (go === 'Watch the match') break;
      if (go) await chrome.evaluate(`document.querySelector('.ds-royale:not([hidden]) [data-key="go"]').click()`);
      await sleep(1000);
    }
    const back = await prepText();
    say(`  back: ${back}  (${((Date.now() - prepAt) / 1000).toFixed(1)} s into the Preparation)`);
    check('back in the Preparation with the seat, before the dive', !!back && !/Watch/.test((await screen()) ?? ''));
    await shot('03-rejoined');
  }
  await sleep(5000);
  await shot('04-preparation-late');
  await chrome.evaluate(`__find('Ready')?.click()`);
  await sleep(2500);
  await shot('05-dive');
  await until('play', async () => !(await prepText()), 40000, 100);
  await sleep(1500);
  await shot('06-playing');
  const hud = await text('.ds-br-top');
  say(`  hud: ${hud}`);
  // Move about: forward with sprint, and fire now and then.
  await key('KeyW');
  await key('ShiftLeft');
  await press('KeyM');
  await sleep(700);
  await shot('07-map');
  await press('KeyM');
  const start = Date.now();
  let shots = 0;
  let outSeen = false;
  while (!(await endText())) {
    if (Date.now() - start > 12 * 60000) throw new Error('no ending in 12 minutes');
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 450, button: 'left', clickCount: 1 });
    await sleep(300);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 450, button: 'left', clickCount: 1 });
    await sleep(700);
    const t = (Date.now() - start) / 1000;
    const out = await text('.ds-out');
    if (out && !outSeen) {
      outSeen = true;
      say(`  out at ${t.toFixed(0)} s: ${out}`);
      await shot('08-out');
    }
    if (shots < 4 && t > 20 + shots * 40) {
      await shot(`07-play-${Math.round(t)}s`);
      say(`  ${Math.round(t)} s: ${await text('.ds-br-top')}`);
      shots++;
    }
  }
  await key('KeyW', 'keyUp');
  await key('ShiftLeft', 'keyUp');
  const ended = Date.now();
  say(`  ending after ${((ended - start) / 1000).toFixed(0)} s of play: ${await endText()}`);
  for (const [at, name] of [[0.8, 'siren'], [2.7, 'flash'], [4.2, 'cloud'], [6.5, 'scoreboard'], [12, 'scoreboard-late']]) {
    await sleep(Math.max(0, at * 1000 - (Date.now() - ended)));
    await shot(`09-ending-${name}`);
    say(`  ${at} s: ${await endText()}`);
  }
  await until('back on the Battle Royale screen', () => ev(`const r = document.querySelector('.ds-royale:not([hidden])'); return !!r?.querySelector('.last')`), 40000, 500);
  const after = await screen();
  say(`  after: ${after}`);
  check('back on the Battle Royale screen with the last match and the place', /Last match/i.test(after) && /\d+(st|nd|rd|th)|win/i.test(after));
  await shot('10-after');
  const errs = await ev(`return globalThis.__errors ?? []`);
  check(`no page errors (${errs.join(' | ')})`, errs.length === 0);
} catch (e) {
  failed = true;
  console.error(e);
  try {
    writeFileSync(`${out}/${tag}-fail.jpg`, Buffer.from((await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 })).result.data, 'base64'));
  } catch {}
} finally {
  await chrome?.close().catch(() => {});
  proc.kill();
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
