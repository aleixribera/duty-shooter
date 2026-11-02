// Plays `MATCHES` matches in a row on one page (Bot Match by default, or online with
// ONLINE=1 against a local server) and records every place the local player
// appears: each match start and each respawn (the player throws a frag at
// their feet once alive for a few seconds, to die and respawn). Prints the
// spawn counts per team, kind (first / respawn) and place.
//
//   node .scratch/battle-royale/spawns/spawn-probe.mjs <out.json> <map> <mode> [matches] [seconds per match]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, map, mode] = process.argv.slice(2);
const MATCHES = Number(process.argv[5] ?? 3);
const SECONDS = Number(process.argv[6] ?? 45);
const ONLINE = process.env.ONLINE === '1';
const NAMES = { 'survival-town': 'Survival Town', switchyard: 'Switchyard', crash: 'Crash', tdm: 'Team deathmatch', ffa: 'Free-for-all', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };

const chrome = await launchChrome();
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).find((b) => b.textContent.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
try {
  // A controller plugged into this PC reaches headless Chrome too and drives the menus: hide it.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.getGamepads = () => [];' });
  await chrome.navigate(`http://localhost:5173/?nolock&matchtime=${SECONDS}${ONLINE ? '&online' : ''}`);
  if (!(await chrome.waitFor(`location.protocol === 'http:' && globalThis.duty?.game && duty.menu.screen === 'main'`, 90_000))) throw new Error('page did not start');
  await sleep(1000);
  if (ONLINE) {
    await click('Play Online');
    await sleep(500);
    await chrome.evaluate(`(() => { const i = document.activeElement; if (i?.tagName === 'INPUT') { i.value = 'Probe'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await click('Play Online');
    if (!(await chrome.waitFor(`duty.driver?.match`, 60_000))) throw new Error('did not join');
  } else {
    await click('Bot Match');
    await sleep(500);
    for (const p of [NAMES[map], NAMES[mode], ...(mode === 'ffa' || mode === 'gungame' ? [] : ['Mixed teams'])]) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
  }
  // The recorder: every appearance of the local player.
  await chrome.evaluate(`(() => {
    globalThis.__spawns = []; let wasAlive = false; let last = null; let match = 0; let phase = null;
    const loop = () => {
      const d = duty.driver; const p = duty.game.player; const m = d?.match;
      if (m?.phase === 'playing' && phase !== 'playing') { match++; wasAlive = false; }
      phase = m?.phase ?? null;
      if (p && p.alive && phase === 'playing') {
        const jump = last ? Math.hypot(p.position[0] - last[0], p.position[2] - last[2]) : 0;
        if (!wasAlive || jump > 4) globalThis.__spawns.push({ match, kind: wasAlive ? 'moved' : globalThis.__spawns.some((s) => s.match === match) ? 'respawn' : 'first', team: p.team, at: p.position.map((v) => +v.toFixed(1)), yaw: +p.yaw.toFixed(2), time: +(d.serverTime).toFixed(1) });
        last = p.position; wasAlive = true;
      } else if (p && !p.alive) wasAlive = false;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  for (let n = 0; n < MATCHES; n++) {
    // Start: the lobby's Start (Bot Match setup, or the online host's).
    await chrome.waitFor(`duty.driver === null || !duty.driver.match || duty.driver.match.phase === 'lobby' || ${!ONLINE}`, 60_000);
    if (!(await click('Start'))) throw new Error('no Start');
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
    // Play: a frag at your feet a few seconds after each spawn, until the match ends.
    while (await chrome.evaluate(`duty.driver?.match?.phase === 'playing'`)) {
      const alive = await chrome.evaluate(`!!duty.game.player?.alive`);
      if (alive) {
        await sleep(1500);
        // Cooked past its fuse, the frag goes off in the hand.
        await key('keyDown', 'KeyG');
        await sleep(6000);
        await key('keyUp', 'KeyG');
        await sleep(1000);
      } else await sleep(500);
    }
    // The ending, then back to the lobby (Bot Match: its setup page).
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'lobby' || duty.driver?.over`, 60_000))) throw new Error('no lobby after the match');
    await sleep(1500);
  }
  const spawns = JSON.parse(await chrome.evaluate(`JSON.stringify(globalThis.__spawns)`));
  writeFileSync(out, JSON.stringify({ map, mode, online: ONLINE, spawns }, null, 1));
  const count = {};
  for (const s of spawns) {
    const k = `team ${s.team} ${s.kind}`;
    const place = `${s.at[0]},${s.at[2]}`;
    ((count[k] ??= {})[place] ??= 0), count[k][place]++;
  }
  console.log(JSON.stringify({ map, mode, online: ONLINE, matches: MATCHES, spawns: spawns.length, count, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
