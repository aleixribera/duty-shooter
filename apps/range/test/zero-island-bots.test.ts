import { describe, expect, it } from 'vitest';
import { Terrain, WIDE_MAP, WIDE_SCALE, createWorld, nearestNode, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { buildMapById, insidePolygon, mapSolids } from '../src/map/maps';
import { buildZeroIslandNav } from '../src/map/zero-island-nav';
import { CORES, REGION_IDS, SUMMIT, SUMMIT_RADIUS, regionAt, type RegionId } from '../src/map/zero-island-terrain';

const map = buildMapById('zero-island');
const nav = buildZeroIslandNav(map);
const SEATS = 60;
const world = createWorld(mapSolids(map), { terrain: map.terrain });
const terrain = new Terrain(map.terrain!);

/** A node on the ground just outside a Core, by bearing. */
function nearCore(id: RegionId, turn: number): Vec3 {
  const { x, z } = CORES[id];
  const [sx, sz] = [x + Math.cos(turn) * 62, z + Math.sin(turn) * 62];
  return nav.nodes[nearestNode(nav, world, [sx, terrain.heightAt(sx, sz), sz])]!.position;
}

function match(mode: 'tdm' | 'ffa') {
  const spawns = REGION_IDS.flatMap((id) => Array.from({ length: 10 }, (_, k) => ({ position: nearCore(id, k), yaw: 0 })));
  return createNetworkedMatch({
    solids: mapSolids(map),
    terrain: map.terrain!,
    spawns,
    teamSpawns: [spawns, spawns],
    mode,
    modes: { ffa: { killLimit: null, timeLimit: null }, tdm: { killLimit: null, timeLimit: null } },
    maxPlayers: SEATS,
    net: WIDE_MAP,
    scale: WIDE_SCALE,
    bots: { nav, perTeam: SEATS / 2, maxPerTeam: SEATS / 2, alwaysOn: true },
  });
}

describe('Zero Island: bots on the ground', () => {
  it('sixty bots keep to the land, and cross Regions as they are sent', () => {
    const m = match('ffa');
    let crossings = 0;
    const last = new Map<string, RegionId>();
    const wet: string[] = [];
    const lost: string[] = [];
    const cost: number[] = [];
    const still = new Map<string, { x: number; z: number; since: number }>();
    let stuck = 0;
    let stuckAt = '';
    const index = nav.index;
    const route = index.route.bind(index);
    const routes: number[] = [];
    index.route = (from, to, extra) => {
      const t0 = performance.now();
      const path = route(from, to, extra);
      routes.push(performance.now() - t0);
      return path;
    };
    for (let i = 0; i < 150 * 60; i++) {
      // Every bot is sent to another Region now and then, as the Ring will send it.
      if (i % (30 * 60) === 60) {
        let k = 0;
        for (const [, seat] of m.server.bots) {
          seat.bot.goTo(nearCore(REGION_IDS[(k + Math.floor(i / 1800)) % 6]!, k));
          k += 1;
        }
      }
      const t0 = performance.now();
      const out = m.step();
      cost.push(performance.now() - t0);
      for (const p of out.players) {
        if (!p.alive) continue;
        const [x, y, z] = p.position;
        if (!insidePolygon(map.playArea!, x, z)) lost.push(`${p.id} at ${x},${z}`);
        if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT_RADIUS) lost.push(`${p.id} on the summit`);
        if (y < -0.1) wet.push(`${p.id} at ${x.toFixed(0)},${z.toFixed(0)}`);
        const r = regionAt(x, z);
        const was = last.get(p.id);
        if (was && was !== r) crossings += 1;
        last.set(p.id, r);
        // Fighting or holding is standing still on purpose; only roaming in place is stuck.
        const s = still.get(p.id);
        if (!s || m.server.bots.get(p.id)?.bot.activity !== 'roam' || Math.hypot(x - s.x, z - s.z) > 1.5) still.set(p.id, { x, z, since: i });
        else if ((i - s.since) / 60 > stuck) {
          stuck = (i - s.since) / 60;
          stuckAt = `${p.id} at ${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)}`;
        }
      }
    }
    index.route = route;
    if (process.env['BENCH']) {
      const worstTick = cost.indexOf(Math.max(...cost));
      cost.sort((a, b) => a - b);
      routes.sort((a, b) => a - b);
      const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      console.log(`SOAK ${crossings} crossings, stuck ${stuck.toFixed(1)} s (${stuckAt}), tick mean ${mean(cost).toFixed(2)} p99 ${cost[Math.floor(cost.length * 0.99)]!.toFixed(2)} worst ${cost.at(-1)!.toFixed(2)} ms at tick ${worstTick}`);
      console.log(`ROUTES ${(routes.length / 150).toFixed(1)} a second, mean ${mean(routes).toFixed(3)} p99 ${routes[Math.floor(routes.length * 0.99)]!.toFixed(2)} worst ${routes.at(-1)!.toFixed(2)} ms, ${((mean(routes) * routes.length) / 150 / 10).toFixed(2)}% of a core`);
    }
    expect(m.history.at(-1)!.players.length).toBe(SEATS);
    expect(lost.slice(0, 5)).toEqual([]);
    expect(wet.slice(0, 5)).toEqual([]);
    expect(crossings).toBeGreaterThan(30);
    expect(stuck, stuckAt).toBeLessThan(15);
  }, 300000);
});
