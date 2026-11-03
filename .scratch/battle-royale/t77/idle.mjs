// Ticket 77: does the idle local player fire or move with no input? Logs what the input sends and what the player does.
//   remote-test --local "node .scratch/battle-royale/t77/idle.mjs"   (BASE, MAP, CLICK=1 clicks the canvas first, SECS)
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const MAP = process.env.MAP ?? 'zero-island';
const SECS = Number(process.env.SECS ?? 30);
const say = (t) => console.log(`${new Date().toISOString().slice(11, 19)} ${t}`);
const chrome = await launchChrome();
let failed = false;
try {
  if (process.env.FOCUS === '1') await chrome.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await chrome.navigate(`${BASE}?explore=${MAP}&nolock${process.env.QUERY ? '&' + process.env.QUERY : ''}`);
  if (!(await chrome.waitFor('!!globalThis.duty?.game?.player?.alive', 240000, 500))) throw new Error('no player');
  await chrome.evaluate(`(() => {
    const input = duty.game.input; const sample = input.sample.bind(input);
    globalThis.__cmds = { n: 0, buttons: 0, presses: 0, moving: 0, first: null };
    input.sample = (a, b) => { const c = sample(a, b); const s = globalThis.__cmds; s.n++; if (c.buttons) { s.buttons++; s.first ??= { n: s.n, buttons: c.buttons }; } if (c.firePresses.length) s.presses++; if (c.forward || c.right) s.moving++; return c; };
    return 1;
  })()`);
  if (process.env.CLICK === '1') await chrome.evaluate(`document.querySelector('canvas')?.click(), 1`);
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    const s = JSON.parse(await chrome.evaluate(`JSON.stringify({ p: duty.game.player.position.map((v) => +v.toFixed(2)), w: duty.game.player.weapon.id, mag: duty.game.player.weapon.magazine ?? duty.game.player.weapon.ammo, fired: duty.game.tracers.fired, cmds: globalThis.__cmds, focus: document.hasFocus(), locked: duty.game.input.locked, pad: duty.game.input.padName, padMode: duty.game.input.padMode, pads: [...(navigator.getGamepads?.() ?? [])].filter(Boolean).map((g) => g.id + " " + g.axes.map((a) => a.toFixed(2)).join(",") + " b" + g.buttons.map((b) => (b.pressed ? 1 : 0)).join("")) })`));
    say(JSON.stringify(s));
    await sleep(3000);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await chrome.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
