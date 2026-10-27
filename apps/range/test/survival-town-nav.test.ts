import { describe, expect, it } from 'vitest';
import { Simulation, buildNavGraph, createWorld, inSite, inZone } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { reachable } from './support/bots';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const map = buildSurvivalTown();
const solids = mapSolids(map);
const world = createWorld(solids);
const nav = buildNavGraph(world, map.nav!);

describe('Survival Town: nav graph', () => {
  it('covers the ground, the upstairs rooms and the roofs', () => {
    const at = (lo: number, hi: number) => nav.nodes.filter((n) => n.position[1] >= lo && n.position[1] < hi).length;
    expect(at(-1, 0.5)).toBeGreaterThan(400);
    expect(at(2.5, 3.3)).toBeGreaterThan(40);
    expect(at(3.3, 20)).toBeGreaterThan(80);
  });

  it('lets a bot get from anywhere to anywhere', () => {
    expect(reachable(nav, false).size).toBe(nav.nodes.length);
    expect(reachable(nav, true).size).toBe(nav.nodes.length);
  });

  it('puts every node inside the boundary, where a player can stand still', () => {
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'p', team: 1, position: nav.nodes[0]!.position, yaw: 0 });
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const p = n.position;
      if (!insidePolygon(BOUNDARY, p[0], p[2])) bad.push(`${p} outside`);
      sim.respawn('p', p, 0);
      let out = sim.step({ p: usercmd() });
      for (let i = 0; i < 20; i++) out = sim.step({ p: usercmd() });
      const q = out.players[0]!.position;
      if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 0.1) bad.push(`${p.map((v) => v.toFixed(2))} moved to ${q.map((v) => v.toFixed(2))}`);
    }
    expect(bad).toEqual([]);
  });

  it('has nav nodes on the floor of every Outposts zone, so bots can stand in each', () => {
    expect(map.zones.map((z) => z.id)).toEqual(['A', 'B', 'C']);
    for (const z of map.zones) {
      const inside = nav.nodes.filter((n) => inZone(z, n.position));
      expect(inside.length, z.name).toBeGreaterThanOrEqual(3);
    }
  });

  it('has nav nodes on the floor of both Charge sites, on the second team set side', () => {
    expect(map.sites.map((s) => s.id)).toEqual(['A', 'B']);
    for (const s of map.sites) {
      const inside = nav.nodes.filter((n) => inSite(s, n.position));
      expect(inside.length, s.name).toBeGreaterThanOrEqual(4);
      expect(s.min[2]).toBeGreaterThan(0);
    }
  });

  it('has a node near every spawn point', () => {
    for (const s of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const near = nav.nodes.some((n) => Math.hypot(n.position[0] - s.position[0], n.position[2] - s.position[2]) < 3 && Math.abs(n.position[1] - s.position[1]) < 0.5);
      expect(near, `spawn ${s.position}`).toBe(true);
    }
  });
});
