import { describe, expect, it } from 'vitest';
import { buildNavGraph, createWorld } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { buildMap, collisionSolids } from '../src/map/map';
import { mapSolids } from '../src/map/definition';
import { buildSurvivalTown } from '../src/map/survival-town';

/**
 * Server CPU benchmark: 8 scripted players who move, turn and fire at 60 Hz,
 * like apps/server/scripts/load-test.mjs, through the in-memory network. It
 * reports the server's share of one core. Run it with BENCH=1; the normal
 * test run skips it.
 */
describe.skipIf(!process.env['BENCH'])('server CPU', () => {
  it('8 players on the Practice Range', () => {
    const map = buildMap();
    measure(createNetworkedMatch({ solids: collisionSolids(map), spawns: [map.rangeSpawn], dummies: map.dummies, passphrase: '', latency: 0.03 }));
  });

  it('8 players in team deathmatch on Survival Town', () => {
    const town = buildSurvivalTown();
    measure(createNetworkedMatch({ solids: mapSolids(town), spawns: town.spawns.ffa, teamSpawns: town.spawns.teams!, mode: 'tdm', passphrase: '', latency: 0.03 }));
  });

  it('2 players and 6 bots in team deathmatch on Survival Town', () => {
    const town = buildSurvivalTown();
    const solids = mapSolids(town);
    const nav = buildNavGraph(createWorld(solids), town.nav!);
    measure(createNetworkedMatch({ solids, spawns: town.spawns.ffa, teamSpawns: town.spawns.teams!, mode: 'tdm', passphrase: '', latency: 0.03, bots: { nav, perTeam: 4 } }), 2);
  });
});

/** Joins `players` scripted players who move, turn and fire (bots fill the rest), and logs the server's share of one core over 20 s. */
function measure(m: ReturnType<typeof createNetworkedMatch>, players = 8): void {
  const names = Array.from({ length: players }, (_, i) => `player${i}`);
  for (const n of names) m.join(n);
  const script = (t: number) =>
    Object.fromEntries(
      names.map((n, i) => [n, usercmd({ forward: 1, right: Math.sin(t / 40 + i), yaw: i + t * 0.01 * Math.sin(i + t / 90), buttons: (t + i * 7) % 16 < 8 ? ['Fire'] : [] })]),
    );
  m.run(120, script);
  const seconds = 20;
  let serverMs = 0;
  const tick = m.server.tick.bind(m.server);
  m.server.tick = () => {
    const start = performance.now();
    const out = tick();
    serverMs += performance.now() - start;
    return out;
  };
  m.run(seconds * 60, script);
  const percent = (serverMs / (seconds * 1000)) * 100;
  console.log(`server: ${(serverMs / (seconds * 60)).toFixed(3)} ms per tick, ${percent.toFixed(2)} % of one core at 60 Hz`);
  expect(m.server.playerCount + m.server.bots.size).toBe(8);
}
