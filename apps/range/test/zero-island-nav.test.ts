import { describe, expect, it } from 'vitest';
import { Terrain, createWorld, decodeLargeNav, encodeLargeNav, findPath, linkKind, nearestNode } from '@duty-shooter/fps-core';
import { buildMapById, insidePolygon, mapSolids } from '../src/map/maps';
import { buildZeroIslandNav } from '../src/map/zero-island-nav';
import { BRIDGES, CORES, REGION_IDS, SUMMIT, SUMMIT_RADIUS, regionAt } from '../src/map/zero-island-terrain';

const map = buildMapById('zero-island');
const terrain = new Terrain(map.terrain!);
const world = createWorld(mapSolids(map), { terrain: map.terrain });
const built = performance.now();
const nav = buildZeroIslandNav(map);
const buildSeconds = (performance.now() - built) / 1000;
const coreNode = (id: (typeof REGION_IDS)[number]) => {
  const { x, z } = CORES[id];
  // Beside what stands at its middle: the Core's ground, not the block's top.
  return nearestNode(nav, world, [x + 12, terrain.heightAt(x + 12, z + 12), z + 12]);
};
const at = (i: number) => nav.nodes[i]!.position;

describe('Zero Island: where bots can go', () => {
  it('has a route between every pair of Cores, both ways, link by link', () => {
    for (const a of REGION_IDS) {
      for (const b of REGION_IDS) {
        if (a === b) continue;
        const path = findPath(nav, coreNode(a), coreNode(b));
        expect(path, `${a} to ${b}`).not.toBeNull();
        for (let i = 1; i < path!.length; i++) expect(linkKind(nav, path![i - 1]!, path![i]!)).not.toBeNull();
      }
    }
  });

  it('takes a bridge to reach Rogue Harbor and Neon City', () => {
    const path = findPath(nav, coreNode('ground-zero'), coreNode('rogue-harbor'))!;
    const onDeck = (p: readonly number[]) =>
      BRIDGES.some((b) => {
        const [dx, dz] = [b.to[0] - b.from[0], b.to[1] - b.from[1]];
        const k = ((p[0]! - b.from[0]) * dx + (p[2]! - b.from[1]) * dz) / (dx * dx + dz * dz);
        const off = Math.hypot(b.from[0] + dx * k - p[0]!, b.from[1] + dz * k - p[2]!);
        return k >= 0 && k <= 1 && off < b.width / 2 + 0.5 && Math.abs(p[1]! - b.deck) < 0.5;
      });
    expect(path.map(at).filter(onDeck).length).toBeGreaterThan(5);
  });

  it('never stands in the sea, past the Boundary or near the summit', () => {
    for (const n of nav.nodes) {
      const [x, y, z] = n.position;
      expect(y, `${x},${z}`).toBeGreaterThan(0.25);
      expect(insidePolygon(map.playArea!, x, z)).toBe(true);
      expect(Math.hypot(x - SUMMIT.x, z - SUMMIT.z)).toBeGreaterThan(SUMMIT_RADIUS);
    }
  });

  it('covers the plateau and each Core, and nearly all the land', () => {
    const area = new Map<string, number>();
    for (const n of nav.nodes) area.set(regionAt(n.position[0], n.position[2]), (area.get(regionAt(n.position[0], n.position[2])) ?? 0) + 1);
    for (const id of REGION_IDS) {
      expect(area.get(id) ?? 0, id).toBeGreaterThan(1000);
      expect(nav.index!.near(at(coreNode(id)), 20).length, id).toBeGreaterThan(40);
    }
    expect(at(coreNode('frostbite-peaks'))[1]).toBeGreaterThan(40);
  });

  it('has a node beside every spawn', () => {
    for (const { position: p } of map.spawns.ffa) {
      const near = at(nearestNode(nav, world, p));
      expect(Math.hypot(near[0] - p[0], near[2] - p[2]), `${p[0]},${p[2]}`).toBeLessThan(6);
      expect(Math.abs(near[1] - p[1]), `${p[0]},${p[2]}`).toBeLessThan(2);
    }
  });

  it('labels Regions, and knows the Regions between them', () => {
    REGION_IDS.forEach((id, r) => expect(nav.index!.regionOf(coreNode(id)), id).toBe(r));
    const dust = REGION_IDS.indexOf('the-dustlands');
    const neon = REGION_IDS.indexOf('neon-city');
    expect(nav.index!.regionsBetween(dust, neon).length).toBeGreaterThan(2);
  });

  it('ships as data that routes the same', () => {
    const bytes = encodeLargeNav(nav);
    const loaded = decodeLargeNav(bytes);
    const t0 = performance.now();
    const pairs = 2000;
    let hops = 0;
    for (let i = 0; i < pairs; i++) hops += findPath(loaded, (i * 7919) % nav.nodes.length, (i * 104729 + 13) % nav.nodes.length)!.length;
    const query = (performance.now() - t0) / pairs;
    if (process.env['BENCH']) {
      const before = process.memoryUsage();
      const t1 = performance.now();
      const held = decodeLargeNav(bytes.slice());
      const decode = performance.now() - t1;
      const after = process.memoryUsage();
      const grown = after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers;
      console.log(`NAV ${buildSeconds.toFixed(1)} s, ${nav.nodes.length} nodes, ${nav.packed.linkTo.length} links, ${nav.packed.clusterNode.length} clusters, ${(bytes.length / 1e6).toFixed(2)} MB, ${query.toFixed(3)} ms a route, ${(hops / pairs).toFixed(0)} hops`);
      console.log(`LOAD ${decode.toFixed(0)} ms, ${(grown / 1e6).toFixed(1)} MB in memory for ${held.nodes.length} nodes`);
    }
    expect(findPath(loaded, coreNode('the-dustlands'), coreNode('mutant-jungle'))).toEqual(findPath(nav, coreNode('the-dustlands'), coreNode('mutant-jungle')));
  });
});
