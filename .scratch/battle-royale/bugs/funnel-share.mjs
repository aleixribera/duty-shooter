// Ticket 35: do two outside clients share one address through Funnel?
// Opens N unjoined sockets from this machine through the public route and holds them for HOLD ms.
// Usage: node funnel-share.mjs [n=12] [hold=25000] [url=wss://aleix.tailfef0f7.ts.net:10000/ws]
import { WebSocket } from 'ws';
const n = Number(process.argv[2] ?? 12);
const hold = Number(process.argv[3] ?? 25000);
const url = process.argv[4] ?? 'wss://aleix.tailfef0f7.ts.net:10000/ws';
const results = [];
const sockets = [];
for (let i = 0; i < n; i++) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const t0 = Date.now();
  ws.on("close", (code, why) => console.log(`socket ${i} closed after ${Date.now() - t0} ms: ${code} ${why}`));
  results.push(await new Promise((done) => {
    ws.on('open', () => done('open'));
    ws.on('unexpected-response', (_req, res) => done(`http ${res.statusCode}`));
    ws.on('error', (e) => done(`error ${e.message}`));
  }));
}
console.log(new Date().toISOString(), 'socket results:', JSON.stringify(results));
await new Promise((r) => setTimeout(r, hold));
console.log(new Date().toISOString(), 'still open:', sockets.filter((s) => s.readyState === 1).length);
for (const s of sockets) s.close();
setTimeout(() => process.exit(0), 500);
