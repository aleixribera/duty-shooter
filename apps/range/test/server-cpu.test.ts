import { describe, expect, it } from 'vitest';
import { WIDE_MAP, WIDE_SCALE, box, buildNavGraph, createWorld, type Solid } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { buildMap, collisionSolids } from '../src/map/map';
import { mapSolids } from '../src/map/definition';
import { buildSurvivalTown } from '../src/map/survival-town';
import { buildSwitchyard } from '../src/map/switchyard';

/**
 * Server CPU benchmark: 8 scripted players who move, turn and fire at 60 Hz,
 * like apps/server/scripts/load-test.mjs, through the in-memory network. It
 * reports the server's share of one core. Run it with BENCH=1; the normal
 * test run skips it.
 */
// Each case simulates 22 s of match: well past the default test timeout.
describe.skipIf(!process.env['BENCH'])('server CPU', { timeout: 180_000 }, () => {
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

  // A full lobby (6v6) on each map, with the mix of people and bots a big night brings.
  it.each([
    ['Survival Town', 'tdm', 12, buildSurvivalTown],
    ['Survival Town', 'outposts', 2, buildSurvivalTown],
    ['Switchyard', 'tdm', 12, buildSwitchyard],
    ['Switchyard', 'outposts', 2, buildSwitchyard],
    ['Switchyard', 'charge', 4, buildSwitchyard],
  ] as const)('12 seats on %s in %s: %i players, bots in the rest', (_name, mode, players, build) => {
    const map = build();
    const solids = mapSolids(map);
    const nav = buildNavGraph(createWorld(solids), map.nav!);
    const m = createNetworkedMatch({ solids, spawns: map.spawns.ffa, teamSpawns: map.spawns.teams!, zones: map.zones, sites: map.sites, mode, passphrase: '', latency: 0.03, maxPlayers: 12, bots: { nav, perTeam: 6 } });
    measure(m, players, 12);
  });

  // The worst a tick can be asked for: everyone on one small map, always in a fight.
  it.each([['Survival Town', buildSurvivalTown], ['Switchyard', buildSwitchyard]] as const)('60 seats crowded onto %s: 2 players, bots in the rest', (_name, build) => {
    const map = build();
    const solids = mapSolids(map);
    const nav = buildNavGraph(createWorld(solids), map.nav!);
    const m = createNetworkedMatch({ solids, spawns: map.spawns.ffa, mode: 'ffa', modes: { ffa: { killLimit: null, timeLimit: null } }, passphrase: '', latency: 0.03, maxPlayers: 60, scale: WIDE_SCALE, net: WIDE_MAP, bots: { nav, perTeam: 30, maxPerTeam: 30 } });
    measure(m, 2, 60);
  });

  // How 60 seats really stand: spread over open ground, the fights far apart and most bots far from a person.
  it('60 seats spread over 600 m: 2 players, bots in the rest', () => {
    const solids = openGround(600);
    const nav = buildNavGraph(createWorld(solids), { area: [[-300, -300], [300, -300], [300, 300], [-300, 300]], spacing: 12, ceiling: 3 });
    const spawns = Array.from({ length: 60 }, (_, i) => ({ position: nav.nodes[Math.floor((i + 0.5) * (nav.nodes.length / 60))]!.position, yaw: i }));
    const m = createNetworkedMatch({ solids, spawns, mode: 'ffa', modes: { ffa: { killLimit: null, timeLimit: null } }, passphrase: '', latency: 0.03, maxPlayers: 60, scale: WIDE_SCALE, net: WIDE_MAP, bots: { nav, perTeam: 30, maxPerTeam: 30 } });
    measure(m, 2, 60);
  });
});

/** A square of ground `size` m across with a wall every 30 m or so to hide behind. */
function openGround(size: number): Solid[] {
  const half = size / 2;
  const solids: Solid[] = [box({ min: [-half, -1, -half], max: [half, 0, half], material: 'concrete' })];
  for (let x = -half + 15; x < half; x += 30) {
    for (let z = -half + 15; z < half; z += 30) solids.push(box({ min: [x, 0, z], max: [x + 6, 2.5, z + 1], material: 'concrete' }));
  }
  return solids;
}

/** Joins `players` scripted players who move, turn and fire (bots fill the rest, to `seats` in all), and logs the server's share of one core over 20 s. */
function measure(m: ReturnType<typeof createNetworkedMatch>, players = 8, seats = 8): void {
  const names = Array.from({ length: players }, (_, i) => `player${i}`);
  for (const n of names) m.join(n);
  const script = (t: number) =>
    Object.fromEntries(
      names.map((n, i) => [n, usercmd({ forward: 1, right: Math.sin(t / 40 + i), yaw: i + t * 0.01 * Math.sin(i + t / 90), buttons: (t + i * 7) % 16 < 8 ? ['Fire'] : [] })]),
    );
  m.run(120, script);
  const seconds = 20;
  let serverMs = 0;
  const tickTimes: number[] = [];
  const tick = m.server.tick.bind(m.server);
  m.server.tick = () => {
    const start = performance.now();
    const out = tick();
    const elapsed = performance.now() - start;
    tickTimes.push(elapsed);
    serverMs += elapsed;
    return out;
  };
  m.run(seconds * 60, script);
  const percent = (serverMs / (seconds * 1000)) * 100;
  tickTimes.sort((a, b) => a - b);
  const percentile = (q: number) => tickTimes[Math.min(tickTimes.length - 1, Math.floor(q * tickTimes.length))]!;
  const missed = tickTimes.filter((ms) => ms > 1000 / 60).length;
  console.log(`server: ${(serverMs / (seconds * 60)).toFixed(3)} ms mean, ${percentile(0.95).toFixed(3)} ms p95, ${percentile(0.99).toFixed(3)} ms p99, ${tickTimes.at(-1)!.toFixed(3)} ms max; ${missed}/${tickTimes.length} over 16.7 ms; ${percent.toFixed(2)} % of one core at 60 Hz`);
  expect(m.server.playerCount + m.server.bots.size).toBe(seats);
  // 60 Hz needs each tick well inside its 16.7 ms.
  expect(serverMs / (seconds * 60)).toBeLessThan(8);
}
