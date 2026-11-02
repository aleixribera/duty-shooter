// Ticket 36: hold N unjoined sockets through the public URL; SPOOF=1 writes a different X-Forwarded-For on each.
// Usage: node hold.mjs [n=12] [hold=20000] [path=/ws]
import { WebSocket } from 'ws';
const n = Number(process.argv[2] ?? 12), hold = Number(process.argv[3] ?? 20000), path = process.argv[4] ?? '/ws';
const out = [], sockets = [];
for (let i = 0; i < n; i++) {
  const headers = process.env.SPOOF ? { 'x-forwarded-for': `198.51.100.${i + 1}` } : {};
  const ws = new WebSocket(`wss://aleix.tailfef0f7.ts.net:10000${path}`, { headers });
  sockets.push(ws);
  out.push(await new Promise((done) => { ws.on('open', () => done(101)); ws.on('unexpected-response', (_q, r) => done(r.statusCode)); ws.on('error', (e) => done(e.message)); }));
}
console.log(new Date().toISOString(), path, process.env.SPOOF ? 'spoofed' : 'plain', JSON.stringify(out));
await new Promise((r) => setTimeout(r, hold));
for (const s of sockets) s.terminate();
process.exit(0);
