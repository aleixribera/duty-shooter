// A stand-in for the Battle Royale process (ADR 0009) in royale-process.test.ts:
// the same IPC messages, and a WebSocket that greets with this process's pid.
// READY_MS delays its ready message; a socket that sends "crash" ends the process.
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });
let players = 0;
wss.on('connection', (ws, url) => {
  players += 1;
  ws.send(`pid ${process.pid} ${url}`);
  ws.on('message', (data) => {
    if (String(data) === 'crash') process.exit(3);
  });
  ws.on('close', () => (players -= 1));
});
process.on('message', (message, socket) => {
  if (message.t !== 'upgrade' || !socket) return;
  socket.resume();
  const req = { method: message.method, url: message.url, headers: message.headers, socket };
  wss.handleUpgrade(req, socket, Buffer.from(message.head, 'base64'), (ws) => wss.emit('connection', ws, message.url));
});
process.on('disconnect', () => process.exit(0));
const status = () => process.send({ t: 'status', status: { map: 'zero-island', mode: 'battle-royale', players, away: 0, capacity: 60, phase: 'lobby', bots: 0, botsPerTeam: 0, maxBotsPerTeam: 0, lobby: true, hvb: false, lobbyMode: 'battle-royale', squadSize: 1, royale: true } });
setTimeout(() => {
  process.send({ t: 'ready' });
  status();
  setInterval(status, 50);
}, Number(process.env.READY_MS ?? 0));
