import { describe, expect, it } from 'vitest';
import { Simulation, buildNavGraph, createWorld, findPath, inSite, inZone, nearestNode } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { reachable } from './support/bots';
import { BOUNDARY, CAR_ROOF, SIGNAL_BOX, TRACKS, buildSwitchyard } from '../src/map/switchyard';

const map = buildSwitchyard();
const solids = mapSolids(map);
const world = createWorld(solids);
const nav = buildNavGraph(world, map.nav!);

describe('Switchyard: nav graph', () => {
  it('covers the ground, the car roofs, the lever room and the platforms', () => {
    const count = (f: (p: readonly number[]) => boolean) => nav.nodes.filter((n) => f(n.position)).length;
    expect(count((p) => p[1]! < 0.5)).toBeGreaterThan(900);
    expect(count((p) => Math.abs(p[1]! - CAR_ROOF) < 0.1)).toBeGreaterThan(12);
    const box = SIGNAL_BOX;
    expect(count((p) => Math.abs(p[1]! - box.floor) < 0.1 && p[0]! > box.x0 && p[0]! < box.x1 && p[2]! > box.z0 && p[2]! < box.z1)).toBeGreaterThanOrEqual(4);
    expect(count((p) => p[1]! > 0.9 && p[1]! < 1.3)).toBeGreaterThan(20);
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

  it('has a node near every spawn point', () => {
    for (const s of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const near = nav.nodes.some((n) => Math.hypot(n.position[0] - s.position[0], n.position[2] - s.position[2]) < 3 && Math.abs(n.position[1] - s.position[1]) < 0.5);
      expect(near, `spawn ${s.position}`).toBe(true);
    }
  });

  it('tags spots along the long lane with long sightlines, for snipers to hold', () => {
    // 35 m is the bots' long sightline (LONG_SIGHTLINE in the nav graph).
    const lane = nav.nodes.filter((n) => n.position[2] < -12 && n.sightline >= 35);
    expect(lane.length).toBeGreaterThan(30);
    expect(lane.filter((n) => n.sightline >= 60).length).toBeGreaterThan(10);
  });

  it('has nav nodes on the floor of every Outposts zone: the long lane, between the cars and in the shed', () => {
    expect(map.zones.map((z) => z.id)).toEqual(['A', 'B', 'C']);
    expect(map.zones[0]!.center[2]).toBeLessThan(TRACKS.south + 2);
    for (const z of map.zones) expect(nav.nodes.filter((n) => inZone(z, n.position)).length, z.name).toBeGreaterThanOrEqual(3);
  });

  it('has nav nodes in both Charge sites, at team 2\'s end, where the defenders start', () => {
    expect(map.sites.map((s) => s.id)).toEqual(['A', 'B']);
    for (const s of map.sites) {
      expect(nav.nodes.filter((n) => inSite(s, n.position)).length, s.name).toBeGreaterThanOrEqual(4);
      expect(s.min[0]).toBeGreaterThan(0);
    }
  });

  it('reaches every zone and site from both teams\' spawns', () => {
    const targets = [...map.zones.map((z) => ({ name: z.name, inside: (p: readonly number[]) => inZone(z, p as [number, number, number]) })), ...map.sites.map((s) => ({ name: s.name, inside: (p: readonly number[]) => inSite(s, p as [number, number, number]) }))];
    for (const [team, set] of map.spawns.teams!.entries()) {
      const from = nearestNode(nav, world, set[0]!.position);
      for (const t of targets) {
        const goal = nav.nodes.findIndex((n) => t.inside(n.position));
        expect(findPath(nav, from, goal), `team ${team + 1} to ${t.name}`).not.toBeNull();
      }
    }
  });
});
