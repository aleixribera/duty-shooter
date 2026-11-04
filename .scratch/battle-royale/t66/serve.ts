// Tickets 66, 70 and 71 harness: the real server with a control port (PORT + 1) that can
// place seats, keep some healed, read the Battle Royale state, and run one enemy client
// over a real socket that fires real shots. No rule changes: drops, Cards and Reboots
// come from the mode, outs from those shots.
import { createServer } from 'node:http';
import { Button, anglesOf } from '@duty-shooter/fps-core';
import { WebSocket } from 'ws';
import { optionsFromEnv, startServer } from '../../../apps/server/src/server';

const options = optionsFromEnv(process.env, process.env['STATIC_DIR']!);
const server = await startServer(options);
const game = server.game;
const sim = () => game.simulation;
const port = server.port;

let target: string | null = null;
/** A seat kept out of other bots' way: the 59 others would otherwise end the run with a wipe. */
let guard = new Set<string>();
let seq = 0;
const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json() as Promise<{ protocol: number }>);
// Squads fill in joining order: Filler and Enemy make one, so the person's mate is a bot.
const filler = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise((done) => filler.on('open', done));
filler.send(JSON.stringify({ t: 'join', name: 'Filler', passphrase: '', protocol: health.protocol, script: true }));
await new Promise((done) => setTimeout(done, 300));
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Enemy', passphrase: '', protocol: health.protocol, script: true })));
const enemy = () => [...game.names].find(([, n]) => n === 'Enemy')?.[0] ?? null;

let next = performance.now();
const beat = () => {
  next += 1000 / 60;
  setTimeout(beat, Math.max(0, next - performance.now()));
  if (ws.readyState !== WebSocket.OPEN) return;
  const id = enemy();
  const players = game.latest.players;
  const me = players.find((p) => p.id === id);
  const them = players.find((p) => p.id === target);
  let cmd = { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] as number[] };
  if (me && them?.alive) {
    const h = them.downed ? 0.25 : 1.1;
    const { yaw, pitch } = anglesOf([them.position[0] - me.position[0], them.position[1] + h - me.position[1] - me.eyeHeight, them.position[2] - me.position[2]]);
    const press = seq % 12 === 0;
    cmd = { buttons: seq % 12 < 6 ? Button.Fire : 0, forward: 0, right: 0, yaw, pitch, firePresses: press ? [0] : [] };
  }
  if (!process.env['NO_HEAL'] && me?.alive && (me.health < 100 || me.downed)) sim().setPlayerState({ ...sim().playerState(id!)!, health: 100, downed: null });
  for (const kept of players) if (guard.has(kept.id) && kept.alive && (kept.downed || kept.health < 100)) sim().setPlayerState({ ...sim().playerState(kept.id)!, health: 100, downed: null });
  ws.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: ++seq, cmd }], seen: 0 }));
  filler.send(JSON.stringify({ t: 'cmds', cmds: [{ seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }], seen: 0 }));
};
beat();

const control = createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const q = (k: string) => url.searchParams.get(k);
  const n = (k: string) => Number(q(k));
  let body: unknown = 'ok';
  if (url.pathname === '/list') {
    body = { enemy: enemy(), phase: game.phase, players: game.latest.players.map((p) => ({ act: game.bots.get(p.id)?.bot.activity, primary: sim().primary?.(p.id)?.id, id: p.id, name: game.names.get(p.id), team: p.team, kind: p.kind, alive: p.alive, position: p.position, velocity: p.velocity, movement: p.movement, yaw: p.yaw, health: p.health, stance: p.stance, downed: p.downed, reviving: p.reviving, bot: game.bots.has(p.id) })) };
  } else if (url.pathname === '/place') {
    const s = sim().playerState(q('id')!)!;
    sim().setPlayerState({ ...s, move: { ...s.move, position: [n('x'), n('y'), n('z')], velocity: [0, 0, 0] } });
  } else if (url.pathname === '/guard') {
    guard = new Set((q('id') ?? '').split(',').filter(Boolean));
  } else if (url.pathname === '/state') {
    const o = game.mode.objective() ?? null;
    body = { phase: game.phase, time: sim().time, objective: o, events: game.modeEvents };
  } else if (url.pathname === '/fire') {
    target = q('at');
  } else if (url.pathname === '/out') {
    // Downed with its bleed-out nearly run: the simulation's own bleed-out puts it out a moment later.
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: 40, downed: { since: sim().time - 29.8, by: null, revive: null } });
  } else if (url.pathname === '/down') {
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: 40, downed: { since: sim().time, by: null, revive: null } });
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
control.listen(port + 1, '127.0.0.1');
console.log('harness on', port);
process.on('SIGTERM', () => process.exit(0));
