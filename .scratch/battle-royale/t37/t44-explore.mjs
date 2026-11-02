// Ticket 44: the real Ring wall over a hill on Zero Island, from fixed spots, before and after.
// Walks the island alone (?explore) and gives the offline driver a Battle Royale state with a
// 400 m circle round (4, 7), which crosses an 81 m hill at angle 3.578 (found by t44-find.mjs).
// Usage: node .scratch/battle-royale/t37/t44-explore.mjs <tag>
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const A = 3.578;
const R = 400;
const views = [
  { name: 'near', back: 140, pitch: 0.2, turn: 0 },
  { name: 'far', back: 260, pitch: 0.12, turn: 0 },
  { name: 'along', back: 140, pitch: 0.12, turn: 0.55 },
];
for (const v of views) {
  const x = 4 + Math.sin(A) * (R - v.back);
  const z = 7 + Math.cos(A) * (R - v.back);
  const yaw = A + Math.PI + v.turn;
  const c = await L.open(`ring-${v.name}`, { url: `http://localhost:5241/?explore=zero-island&nolock&at=${x.toFixed(1)},${z.toFixed(1)},${yaw.toFixed(3)}`, width: 1920, height: 1080 });
  try {
    await c.must('!!duty.game?.driver && !!duty.game.player', 120000, 500);
    await L.sleep(4000);
    await c.evaluate(`(() => {
      const d = duty.game.driver;
      Object.defineProperty(d, 'match', { configurable: true, writable: true, value: {
        phase: 'playing', mode: 'battle-royale', map: 'zero-island', phaseEnds: null, countdownEnds: null, timeLimit: null, killLimit: null, scoreLimit: null, respawnDelay: 0,
        teamScores: null, votes: { tdm: 0, ffa: 0 }, next: 'tdm', result: null, lobby: null,
        objective: { kind: 'battle-royale', squadSize: 1, stage: 1, circle: { x: 4, z: 7, radius: ${R} }, next: { x: 4, z: 7, radius: 250 }, shrinkAt: 1e9, shrinkEnd: 1e9 + 1, damage: 1, alive: 60, squads: 60 },
      } });
      return 'ok';
    })()`);
    for (let k = 0; k < 12; k++) {
      const p = Number(await c.evaluate('duty.game.player.pitch'));
      if (Math.abs(v.pitch - p) < 0.01) break;
      await L.look(c, 0, -(v.pitch - p) * 400, 2);
    }
    await L.sleep(2500);
    await L.shoot(c, `t44/${tag}-wall-${v.name}`);
  } finally {
    await c.close();
  }
}
