// The real server with a control port (PORT + 1) for the play-through: it can
// place seats, and it runs one enemy client over a real socket that fires real
// shots. Nothing here changes a rule: Downed and Finished come from those shots.
import { createServer } from 'node:http';
import { Button, STATS, anglesOf } from '@duty-shooter/fps-core';
import { WebSocket } from 'ws';
import { optionsFromEnv, startServer } from '../../../apps/server/src/server';

const options = optionsFromEnv(process.env, process.env['STATIC_DIR']!);
const server = await startServer(options);
const game = server.game;
const sim = () => game.simulation;
const port = server.port;

let target: string | null = null;
/** Hold the trigger every tick (a real full-auto burst) instead of short taps. */
let auto = false;
/** Leave the enemy as it is: no heal, so it can lie Downed. */
let heal = true;
/** The target's health each tick from the first shot of a burst, as the server has it. */
let trace: { t: number; health: number; downed: boolean; alive: boolean; hits: number[] }[] = [];
/** A seat kept out of other bots' way: the 59 others would otherwise end the run with a wipe. */
let guard: string | null = null;
let seq = 0;
const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json() as Promise<{ protocol: number }>);
// Squads fill in joining order: Filler and Enemy make one, so the person's mate is a bot.
const filler = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise((done) => filler.on('open', done));
filler.send(JSON.stringify({ t: 'join', name: process.env['MATE_A'] ?? 'Filler', passphrase: '', protocol: health.protocol, script: true }));
await new Promise((done) => setTimeout(done, 300));
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: process.env['MATE_B'] ?? 'Enemy', passphrase: '', protocol: health.protocol, script: true })));
const enemy = () => [...game.names].find(([, n]) => n === (process.env['MATE_B'] ?? 'Enemy'))?.[0] ?? null;

let next = performance.now();
let lastAim = { yaw: 0, pitch: 0 };
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
    const press = auto ? trace.length === 0 : seq % 12 === 0;
    // Pull down against the recoil, as a person would: the view is the command plus a kick that stays.
    const aim = { yaw: yaw - (me.yaw - lastAim.yaw), pitch: pitch - (me.pitch - lastAim.pitch) };
    lastAim = aim;
    cmd = { buttons: auto || seq % 12 < 6 ? Button.Fire : 0, forward: 0, right: 0, yaw: aim.yaw, pitch: aim.pitch, firePresses: press ? [0] : [] };
  }
  if (target && them) {
    const hits = game.latest.events.filter((e) => e.type === 'hit' && e.victim === target).map((e) => (e as { damage: number }).damage);
    const shots = game.latest.events.filter((e) => e.type === 'shot' || e.type === 'impact').length;
    trace.push({ t: sim().time, health: them.health, downed: them.downed !== null, alive: them.alive, hits, ammo: me?.weapon.ammo, shots, my: me?.position, their: them.position, stance: them.stance } as never);
  }
  if (heal && !process.env['NO_HEAL'] && me?.alive && (me.health < 100 || me.downed)) sim().setPlayerState({ ...sim().playerState(id!)!, health: 100, downed: null });
  const kept = players.find((p) => p.id === guard);
  if (kept?.alive && (kept.downed || kept.health < 100)) sim().setPlayerState({ ...sim().playerState(guard!)!, health: 100, downed: null });
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
    body = { enemy: enemy(), phase: game.phase, players: game.latest.players.map((p) => ({ act: game.bots.get(p.id)?.bot.activity, health: p.health, downed: p.downed, id: p.id, name: game.names.get(p.id), team: p.team, kind: p.kind, alive: p.alive, position: p.position, velocity: p.velocity, movement: p.movement, yaw: p.yaw, health: p.health, stance: p.stance, downed: p.downed, reviving: p.reviving, bot: game.bots.has(p.id) })) };
  } else if (url.pathname === '/place') {
    const s = sim().playerState(q('id')!)!;
    sim().setPlayerState({ ...s, move: { ...s.move, position: [n('x'), n('y'), n('z')], velocity: [0, 0, 0] } });
  } else if (url.pathname === '/guard') {
    guard = q('id');
  } else if (url.pathname === '/fire') {
    target = q('at');
    auto = q('auto') === '1';
    if (q('keep') !== '1') trace = [];
  } else if (url.pathname === '/trace') {
    body = trace;
  } else if (url.pathname === '/heal') {
    heal = q('on') === '1';
  } else if (url.pathname === '/hp') {
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: n('hp') });
  } else if (url.pathname === '/up') {
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: 100, downed: null });
  } else if (url.pathname === '/time') {
    body = { time: sim().time };
  } else if (url.pathname === '/down') {
    sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: STATS.royale.downedHealth.value, downed: { since: sim().time, by: null, revive: null } });
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
control.listen(port + 1, '127.0.0.1');
console.log('harness on', port);
process.on('SIGTERM', () => process.exit(0));
