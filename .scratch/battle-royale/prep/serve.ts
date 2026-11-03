// Ticket 32: Enemy reloads an empty magazine, to put out more than one.
// Ticket 14's copy of ticket 11's harness: Mate can also say 'loaded' and 'ready'.
// Ticket 11's copy of ticket 08's harness: beside Filler and Enemy, a second
// person (Mate, not a script, so the match doesn't end when the browser's seat
// is out) who joins before the browser and so shares its Squad. Guards are a set.
// The real server with a control port (PORT + 1) for the play-through: it can
// place seats, and it runs one enemy client over a real socket that fires real
// shots. Nothing here changes a rule: Downed and Finished come from those shots.
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
const guards = new Set<string>();
let seq = 0;
const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json() as Promise<{ protocol: number }>);
// Squads fill in joining order: Filler and Enemy make one, so the person's mate is a bot.
const filler = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise((done) => filler.on('open', done));
filler.send(JSON.stringify({ t: 'join', name: 'Filler', passphrase: '', protocol: health.protocol, script: true }));
await new Promise((done) => setTimeout(done, 300));
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Enemy', passphrase: '', protocol: health.protocol, script: true })));
// Mate joins on /mate, after the browser has the lobby (the first person in hosts it).
let mate: WebSocket | null = null;
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
    cmd = { buttons: me.weapon.ammo === 0 ? Button.Reload : seq % 12 < 6 ? Button.Fire : 0, forward: 0, right: 0, yaw, pitch, firePresses: press ? [0] : [] };
  }
  if (!process.env['NO_HEAL'] && me?.alive && (me.health < 100 || me.downed)) sim().setPlayerState({ ...sim().playerState(id!)!, health: 100, downed: null });
  for (const kept of players) if (guards.has(kept.id) && kept.alive && (kept.downed || kept.health < 100)) sim().setPlayerState({ ...sim().playerState(kept.id)!, health: 100, downed: null });
  ws.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: ++seq, cmd }], seen: 0 }));
  if (mate?.readyState === WebSocket.OPEN) mate.send(JSON.stringify({ t: 'cmds', cmds: [{ seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }], seen: 0 }));
  filler.send(JSON.stringify({ t: 'cmds', cmds: [{ seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }], seen: 0 }));
};
beat();

const control = createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const q = (k: string) => url.searchParams.get(k);
  const n = (k: string) => Number(q(k));
  let body: unknown = 'ok';
  if (url.pathname === '/list') {
    body = { mate: [...game.names].find(([, n]) => n === 'Mate')?.[0] ?? null, enemy: enemy(), phase: game.phase, players: game.latest.players.map((p) => ({ act: game.bots.get(p.id)?.bot.activity, health: p.health, downed: p.downed, id: p.id, name: game.names.get(p.id), team: p.team, kind: p.kind, alive: p.alive, position: p.position, velocity: p.velocity, movement: p.movement, yaw: p.yaw, health: p.health, stance: p.stance, downed: p.downed, reviving: p.reviving, weapon: p.weapon, bot: game.bots.has(p.id) })) };
  } else if (url.pathname === '/place') {
    const s = sim().playerState(q('id')!)!;
    sim().setPlayerState({ ...s, move: { ...s.move, position: [n('x'), n('y'), n('z')], velocity: [0, 0, 0] } });
  } else if (url.pathname === '/mate') {
    mate = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    mate.on('open', () => mate!.send(JSON.stringify({ t: 'join', name: 'Mate', passphrase: '', protocol: health.protocol })));
  } else if (url.pathname === '/ground') {
    // Places a seat on the ground at (x, z), at least at the sea's surface, and says where.
    const s = sim().playerState(q('id')!)!;
    const y = Math.max(0.2, (sim().world.terrain?.heightAt(n('x'), n('z')) ?? 0) + 0.3);
    sim().setPlayerState({ ...s, move: { ...s.move, position: [n('x'), y, n('z')], velocity: [0, 0, 0] } });
    body = { y };
  } else if (url.pathname === '/mate-say') {
    // Mate's page: 'loaded' or 'ready', as a real page sends them.
    mate?.send(JSON.stringify({ t: q('t') }));
  } else if (url.pathname === '/all-say') {
    // Filler and Enemy: 'ready', as their pages would.
    for (const c of [filler, ws]) c.send(JSON.stringify({ t: q('t') }));
  } else if (url.pathname === '/prep') {
    body = game.matchStatus();
  } else if (url.pathname === '/guard') {
    if (q('on') === '0') guards.delete(q('id')!);
    else guards.add(q('id')!);
  } else if (url.pathname === '/fire') {
    target = q('at');
  } else if (url.pathname === '/down') {
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: 40, downed: { since: sim().time, by: null, revive: null } });
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
control.listen(port + 1, '127.0.0.1');
console.log('harness on', port);
process.on('SIGTERM', () => process.exit(0));
