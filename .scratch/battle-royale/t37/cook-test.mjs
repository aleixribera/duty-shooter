// Does a frag cooked in the hand put you out? (explore mode on Zero Island)
import * as L from '../bugs/lib.mjs';
const c = await L.open('cook', { url: 'http://localhost:5241/?explore=zero-island&nolock', width: 1280, height: 720 });
try {
  await c.must('!!duty.game?.driver && !!duty.game.player', 120000, 500);
  await L.sleep(3000);
  L.log(JSON.stringify(await L.state(c)), await c.evaluate('duty.game.player.grenades'));
  await L.keyDown(c, 'KeyG');
  for (let i = 0; i < 12; i++) { await L.sleep(500); L.log(i, JSON.stringify({ g: await c.evaluate('JSON.stringify(duty.game.player.grenade)'), hp: await c.evaluate('duty.game.player.health') })); }
  await L.keyUp(c, 'KeyG');
  await L.sleep(1000);
  L.log(JSON.stringify(await L.state(c)));
} finally { await c.close(); }
