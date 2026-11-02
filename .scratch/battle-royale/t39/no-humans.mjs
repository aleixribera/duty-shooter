// Ticket 39: a Battle Royale alone with bots, played until no person is left (result noHumans),
// then the last-match card on the Battle Royale screen. Vite on 5191 proxying to 3211, as in t38.
// Usage: node .scratch/battle-royale/t39/no-humans.mjs [tag]
import { spawn } from 'node:child_process';
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const env = { ...process.env, PORT: '3211', HOST: '127.0.0.1', STATIC_DIR: 'apps/range/dist', EVENT_LOG: '.scratch/battle-royale/t39/events.jsonl' };
const server = spawn(process.execPath, ['.scratch/battle-royale/t38/server-dist/main.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
const killTree = (p) => (process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGKILL'));
await L.sleep(4000);
const c = await L.open('t39', { url: 'http://localhost:5191/?online&nolock' });
try {
  await c.must(`!!duty.menu && duty.menu.open`, 60000);
  await L.sleep(2000);
  await L.click(c, 'Battle Royale');
  await c.must(`!!document.querySelector('.ds-royale input[name=name]')`, 30000);
  await c.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name=name]'); i.value = 'Solo'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await c.must(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Join server' && !b.disabled)`, 30000);
  await L.click(c, 'Join server');
  await c.must(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start match' && !b.disabled)`, 90000);
  await L.click(c, 'Start match');
  await c.must(`duty.game.driver?.match?.phase && duty.game.driver.match.phase !== 'lobby'`, 60000);
  L.log('match started');
  // Into the match, then wander and fire until out; the match ends at once with no person alive.
  const start = Date.now();
  while (Date.now() - start < 12 * 60_000) {
    const st = JSON.parse(await c.evaluate(`JSON.stringify({ phase: duty.game.driver?.match?.phase, reason: duty.game.driver?.match?.result?.reason ?? null, alive: duty.game.player?.alive, downed: duty.game.player?.downed, go: [...document.querySelectorAll('.ds-royale button[data-act=enter]')].length })`));
    if (st.reason) { L.log('result', st.reason); break; }
    if (st.go) await L.click(c, st.go ? 'Join the match' : '').catch(() => {});
    await L.play(c, 8000);
    L.log(JSON.stringify(st));
  }
  await c.must(`duty.game.driver?.match?.phase === 'lobby' && !!document.querySelector('.ds-royale:not([hidden]) .last')`, 120000, 500);
  await L.sleep(1500);
  L.log('last match card:', await c.evaluate(`document.querySelector('.ds-royale .last')?.innerText.replace(/\s+/g, ' ')`));
  L.log('my score row:', await c.evaluate(`JSON.stringify(duty.game.driver.scores.find((s) => s.id === duty.game.driver.selfId) ?? null)`), 'squads:', await c.evaluate(`new Set(duty.game.driver.scores.map((s) => s.team)).size`));
  await L.shoot(c, `t39/${tag}-last-match`);
} finally {
  await c.close();
  killTree(server);
}
