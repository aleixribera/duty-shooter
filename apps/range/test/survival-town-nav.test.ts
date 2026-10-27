import { describe, expect, it } from 'vitest';
import { Simulation, buildNavGraph, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { BOUNDARY, buildSurvivalTown } from '../src/map/survival-town';

const map = buildSurvivalTown();
const solids = mapSolids(map);
const world = createWorld(solids);
const nav = buildNavGraph(world, map.nav!);

/** Every node reachable from node 0 along the links (or against them, with `reverse`). */
function reachable(reverse: boolean): Set<number> {
  const into: number[][] = nav.nodes.map(() => []);
  for (const [i, links] of nav.links.entries()) for (const l of links) into[reverse ? l.to : i]!.push(reverse ? i : l.to);
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) for (const next of into[queue.pop()!]!) if (!seen.has(next)) seen.add(next), queue.push(next);
  return seen;
}

describe('Survival Town: nav graph', () => {
  it('covers the ground, the upstairs rooms and the roofs', () => {
    const at = (lo: number, hi: number) => nav.nodes.filter((n) => n.position[1] >= lo && n.position[1] < hi).length;
    expect(at(-1, 0.5)).toBeGreaterThan(400);
    expect(at(2.5, 3.3)).toBeGreaterThan(40);
    expect(at(3.3, 20)).toBeGreaterThan(80);
  });

  it('lets a bot get from anywhere to anywhere', () => {
    expect(reachable(false).size).toBe(nav.nodes.length);
    expect(reachable(true).size).toBe(nav.nodes.length);
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
});

describe('Survival Town: bots on their own', () => {
  it('play three minutes of 3v3 team deathmatch: both teams score, nobody wanders off or stands stuck', () => {
    const m = createNetworkedMatch({ solids, spawns: map.spawns.ffa, teamSpawns: map.spawns.teams!, mode: 'tdm', bots: { nav, perTeam: 3, alwaysOn: true } });
    /** Where each living bot was when it last moved 1.5 m, and since when it has only roamed there. */
    const still = new Map<string, { at: Vec3; since: number }>();
    let longest = 0;
    let where = '';
    const outside: string[] = [];
    for (let i = 0; i < 180 * 60; i++) {
      const out = m.step();
      for (const p of out.players) {
        const bot = m.server.bots.get(p.id)?.bot;
        if (!p.alive || !bot) {
          still.delete(p.id);
          continue;
        }
        if (!insidePolygon(BOUNDARY, p.position[0], p.position[2])) outside.push(`${p.id} at ${p.position}`);
        const s = still.get(p.id);
        // Fighting or holding an angle is standing still on purpose; only roaming in place is stuck.
        if (!s || bot.activity !== 'roam' || Math.hypot(p.position[0] - s.at[0], p.position[2] - s.at[2]) > 1.5) still.set(p.id, { at: p.position, since: i });
        else if ((i - s.since) / 60 > longest) {
          longest = (i - s.since) / 60;
          where = `${p.id} at ${p.position.map((v) => v.toFixed(1))}`;
        }
      }
    }
    expect(outside).toEqual([]);
    expect(longest, where).toBeLessThan(8);
    const scores = m.server.mode.teamScores()!;
    expect(scores.map((t) => t.score).every((n) => n > 0), JSON.stringify(scores)).toBe(true);
  }, 120_000);
});
