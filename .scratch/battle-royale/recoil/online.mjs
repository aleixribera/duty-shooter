// Runs browser-recoil.mjs online: this checkout's server (built to node_modules/.cache/r34-server) on 3101, free-for-all with no bots,
// behind a second dev server on 5174 whose proxy points at it. Both stop when the run ends.
import { spawn } from 'node:child_process';
import { sleep } from '../../../apps/range/scripts/chrome.mjs';

const seconds = process.argv[2] ?? '200';
const kids = [];
const run = (cmd, args, opts) => {
  const p = spawn(cmd, args, { stdio: 'ignore', shell: process.platform === 'win32', ...opts });
  kids.push(p);
  return p;
};
run(process.execPath, ["node_modules/.cache/r34-server/main.js"], { env: { ...process.env, PORT: '3101', HOST: '127.0.0.1', MODE: 'ffa', MAP: 'range', BOTS_PER_TEAM: '0', MAX_BOTS_PER_TEAM: '0' }, shell: false });
run('npx', ['vite', '--port', '5174', '--strictPort'], { cwd: 'apps/range', env: { ...process.env, DUTY_SERVER: 'http://localhost:3101' } });
let code = 1;
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch('http://localhost:5174/status')).ok) break;
    } catch {}
    await sleep(400);
  }
  console.log('status', await (await fetch('http://localhost:5174/status')).text());
  const child = spawn(process.execPath, ['.scratch/battle-royale/recoil/browser-recoil.mjs', 'http://localhost:5174/?online&nolock', seconds], { stdio: 'inherit' });
  code = await new Promise((done) => child.on('exit', done));
} finally {
  for (const k of kids) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(k.pid), '/t', '/f'], { stdio: 'ignore' });
    else k.kill();
  }
  await sleep(1000);
}
process.exit(code);
