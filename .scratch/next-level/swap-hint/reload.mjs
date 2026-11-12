// Ticket 72: the swap hint through a real reload. Survival Town walked alone, with every hint but the swap already
// learned; fires 20 rounds, reloads, and samples the hint line, the magazine and the weapon's action every 100 ms.
//   node .scratch/next-level/swap-hint/reload.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const key = (type, code, k) => chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 });
try {
  await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=-4,-44,3.1416');
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
  await chrome.evaluate(`localStorage.setItem('duty-shooter.hints.v1', JSON.stringify({ done: ['move','fire','aim','sprint','reload','grenade','loadout','scoreboard'], shown: {} })), 1`);
  await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=-4,-44,3.1416');
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not restart');
  await sleep(2500);
  await mouse('mousePressed');
  await sleep(2400);
  await mouse('mouseReleased');
  await sleep(300);
  await key('keyDown', 'KeyR', 'r');
  await sleep(80);
  await key('keyUp', 'KeyR', 'r');
  const samples = [];
  for (let t = 0; t < 45; t++) {
    samples.push(await chrome.evaluate(`(() => { const h = document.querySelector('.ds-hintline'); const w = duty.game.player?.weapon; return { t: ${t * 100}, hint: h && !h.hidden ? h.textContent.trim() : null, mag: document.querySelector('.ds-ammo .mag')?.textContent.trim(), action: w?.action ?? null }; })()`));
    if (t === 8 || t === 22) {
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      writeFileSync(`${out}/t${t * 100}.jpg`, Buffer.from(s.result.data, 'base64'));
    }
    await sleep(100);
  }
  writeFileSync(`${out}/samples.json`, JSON.stringify(samples, null, 1));
  console.log(samples.map((s) => `${s.t} ${s.action} ${s.mag} ${s.hint ?? '-'}`).join('\n'));
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
