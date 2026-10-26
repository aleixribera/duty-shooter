// Starts the built server with LOG_STATS=1, connects N simulated clients that
// move, turn and fire at 60 Hz like real players, and prints the server's CPU
// and memory lines. Usage: node scripts/load-test.mjs [clients=8] [seconds=40]
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const clients = Number(process.argv[2] ?? 8);
const seconds = Number(process.argv[3] ?? 40);
const port = 3999;
const passphrase = 'load-test';

const server = spawn(process.execPath, ['dist/main.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PASSPHRASE: passphrase, MAX_PLAYERS: String(clients), LOG_STATS: '1', STATIC_DIR: '.' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
await new Promise((r) => setTimeout(r, 800));

const sockets = [];
for (let i = 0; i < clients; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let seq = 0;
  let yaw = Math.random() * 6;
  const pending = [];
  let received = 0;
  ws.on('message', () => (received += 1));
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'join', name: `bot${i}`, passphrase, protocol: 1 }));
    const timer = setInterval(() => {
      seq += 1;
      yaw += (Math.random() - 0.5) * 0.1;
      const fire = Math.random() < 0.5;
      pending.push({ seq, cmd: { buttons: fire ? 1 : 0, forward: 1, right: Math.sin(seq / 40), yaw, pitch: 0, firePresses: fire && seq % 8 === 0 ? [0.3] : [] } });
      if (pending.length > 8) pending.shift();
      ws.send(JSON.stringify({ t: 'cmds', cmds: pending }));
    }, 1000 / 60);
    ws.on('close', () => clearInterval(timer));
  });
  sockets.push({ ws, stats: () => received });
}

setTimeout(() => {
  console.log(`snapshots received per client: ${sockets.map((s) => s.stats()).join(', ')}`);
  for (const s of sockets) s.ws.close();
  server.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}, seconds * 1000);
