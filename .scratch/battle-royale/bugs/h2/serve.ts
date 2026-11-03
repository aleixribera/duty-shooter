// Pass 2 of ticket 35: the real server with a control port (PORT + 1) to place
// seats and set health, so a Battle Royale can be brought to a human win.
import { createServer } from 'node:http';
import { STATS } from '@duty-shooter/fps-core';
import { optionsFromEnv, startServer } from '../../../../apps/server/src/server';

const options = optionsFromEnv(process.env, process.env['STATIC_DIR']!);
const server = await startServer(options);
const game = server.game;
const sim = () => game.simulation;
const control = createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const q = (k: string) => url.searchParams.get(k);
  const n = (k: string) => Number(q(k));
  let body: unknown = 'ok';
  try {
    if (url.pathname === '/list') {
      body = { phase: game.phase, players: game.latest.players.map((p) => ({ id: p.id, name: game.names.get(p.id), team: p.team, alive: p.alive, health: p.health, downed: p.downed, position: p.position.map((v) => +v.toFixed(1)), yaw: p.yaw, bot: game.bots.has(p.id) })) };
    } else if (url.pathname === '/place') {
      const s = sim().playerState(q('id')!)!;
      sim().setPlayerState({ ...s, move: { ...s.move, position: [n('x'), n('y'), n('z')], velocity: [0, 0, 0] } });
    } else if (url.pathname === '/hp') {
      sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: n('hp') });
    } else if (url.pathname === '/down') {
      sim().setPlayerState({ ...sim().playerState(q('id')!)!, health: STATS.royale.downedHealth.value, downed: { since: sim().time, by: null, revive: null } });
    }
  } catch (e) {
    body = String(e);
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
control.listen(server.port + 1, '127.0.0.1');
console.log('harness on', server.port);
