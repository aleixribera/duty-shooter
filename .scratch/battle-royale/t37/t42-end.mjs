// Ticket 42: the end of a Battle Royale won by a Squad of two, with the real end screen and toast.
// Walks Zero Island alone (?explore) and gives the offline driver a finished Battle Royale whose
// result is what the server sends: before, the old "Ada, Mate" with no count; after, what
// BattleRoyale#won now gives ("Ada and Mate", winners 2). The toast is the game's matchEnd line.
// Usage: node .scratch/battle-royale/t37/t42-end.mjs <tag> <old|new> [phone]
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const result = process.argv[3] === 'old' ? { winner: 2, winnerName: 'Ada, Mate', draw: false, reason: 'lastSquad' } : { winner: 2, winnerName: 'Ada and Mate', winners: 2, draw: false, reason: 'lastSquad' };
const phone = process.argv[4] === 'phone';
const c = await L.open('end', { url: 'http://localhost:5241/?explore=zero-island&nolock', ...(phone ? { phone: true } : { width: 1920, height: 1080 }) });
try {
  await c.must('!!duty.game?.driver && !!duty.game.player', 120000, 500);
  await L.sleep(3000);
  await c.evaluate(`(() => {
    const d = duty.game.driver;
    const now = d.serverTime;
    Object.defineProperty(d, 'match', { configurable: true, writable: true, value: {
      phase: 'nuke', mode: 'battle-royale', map: 'zero-island', phaseEnds: now + 60, countdownEnds: null, timeLimit: null, killLimit: null, scoreLimit: null, respawnDelay: 0,
      teamScores: null, votes: { tdm: 0, ffa: 0 }, next: 'tdm', result: ${JSON.stringify(result)}, lobby: null,
      objective: { kind: 'battle-royale', squadSize: 2, stage: 6, circle: { x: 0, z: 0, radius: 20 }, next: { x: 0, z: 0, radius: 0 }, shrinkAt: 1e9, shrinkEnd: 1e9 + 1, damage: 1, alive: 2, squads: 1 },
    } });
    return 'ok';
  })()`);
  // The toast the game shows on a matchEnd event, through its own handler.
  await c.evaluate(`(() => {
    const d = duty.game.driver;
    const tick = d.tick.bind(d);
    let once = true;
    d.tick = (cmd) => {
      const r = tick(cmd);
      if (!once) return r;
      once = false;
      return { ...r, events: [...r.events, { type: 'matchEnd', ...${JSON.stringify(result)} }] };
    };
    return 'ok';
  })()`);
  await L.sleep(700);
  L.log('end', await L.text(c, '.ds-end h2'), '| toast', await L.text(c, '.ds-toast'));
  await L.shoot(c, `t42/${tag}-end${phone ? '-phone' : '-1920'}`);
} finally {
  await c.close();
}
