// Ticket 38: join a Battle Royale lobby as host, stop the server, read the lobby.
// Needs Vite on 5191 proxying to 3211 (DUTY_SERVER=http://localhost:3211 npx vite --port 5191 in apps/range).
// Usage: node .scratch/battle-royale/t38/server-down.mjs [tag] [page=royale|lobby]
import { spawn } from 'node:child_process';
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const page = process.argv[3] ?? 'royale';
const env = { ...process.env, PORT: '3211', HOST: '127.0.0.1', STATIC_DIR: 'apps/range/dist', EVENT_LOG: '.scratch/battle-royale/t38/events.jsonl' };
const startServer = () => {
  const p = spawn(process.execPath, ['.scratch/battle-royale/t38/server-dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write(d));
  return p;
};
const killTree = (p) => (process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGKILL'));
let server = startServer();
await L.sleep(4000);
const c = await L.open('t38', { url: 'http://localhost:5191/?online&nolock', phone: tag.includes('phone') });
const read = async () => ({
  status: await c.evaluate('duty.game?.driver?.status ?? null'),
  state: await c.evaluate(`[...document.querySelectorAll('.ds-royale:not([hidden]) .ds-state, .ds-lobby:not([hidden]) .who, .ds-lobby:not([hidden]) .ds-state')].map((e) => e.className + ': ' + e.innerText.trim()).join(' | ')`),
  buttons: await L.buttons(c),
});
try {
  await c.must(`!!duty.menu && duty.menu.open`, 60000);
  await L.sleep(2000);
  if (page === 'royale') {
    await L.click(c, 'Battle Royale');
    await c.must(`!![...document.querySelectorAll('input[name=name]')].find((i) => i.getClientRects().length)`, 30000);
    await c.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name=name]'); i.value = 'Host'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await c.must(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Join server' && !b.disabled)`, 30000);
    await L.click(c, 'Join server');
    await c.must(`document.querySelector('.ds-royale .ds-state.up')?.innerText.includes('You are the host')`, 90000);
  } else {
    await L.setName(c, 'Host');
    await L.click(c, 'Play Online');
    await L.sleep(8000); L.log('after join', JSON.stringify(await read()), await c.evaluate('duty.menu.screen + " " + duty.menu.open'));
  }
  L.log('joined:', JSON.stringify(await read()));
  await L.shoot(c, `t38/${tag}-0-joined`);
  killTree(server);
  L.log('server stopped');
  for (const s of [5, 20]) {
    await L.sleep(s === 5 ? 5000 : 15000);
    L.log(`${s}s after stop:`, JSON.stringify(await read()));
  }
  await L.shoot(c, `t38/${tag}-1-down`);
  server = startServer();
  L.log('server restarted');
  await L.sleep(15000);
  L.log('15s after restart:', JSON.stringify(await read()));
  await L.shoot(c, `t38/${tag}-2-back`);
} finally {
  await c.close();
  killTree(server);
}
