import { describe, expect, it } from 'vitest';
import { Terrain, coverNear, coveredFrom, createWorld, decodeLargeNav, encodeLargeNav, findPath, linkKind, nearestNode, sightBlocked, startNode, type Vec3 } from '@duty-shooter/fps-core';
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
    // ~160k nodes: gather the bad ones and assert once, as an expect per node outruns the timeout on CI.
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const [x, y, z] = n.position;
      // A way out (ticket 75) may stand in the shallows, but no deeper than wading.
      if (!(y > (n.escape ? -1.05 : 0.25))) bad.push(`${x},${z} in the sea (y ${y})`);
      if (!insidePolygon(map.playArea!, x, z)) bad.push(`${x},${z} past the Boundary`);
      if (!(Math.hypot(x - SUMMIT.x, z - SUMMIT.z) > SUMMIT_RADIUS)) bad.push(`${x},${z} near the summit`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
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

  it('has cover spots within a short run of nearly every node, in every Region', () => {
    let near = 0;
    let asked = 0;
    for (let i = 0; i < nav.nodes.length; i += 97) {
      asked += 1;
      if (coverNear(nav, at(i), 15).length > 0) near += 1;
    }
    expect(near / asked).toBeGreaterThan(0.97);
    for (const id of REGION_IDS) expect(coverNear(nav, at(coreNode(id)), 40).length, id).toBeGreaterThan(20);
  });

  it('marks spots that really hide a body from that side', () => {
    let tried = 0;
    let hidden = 0;
    for (let i = 0; i < nav.nodes.length && tried < 3000; i += 11) {
      const [x, y, z] = at(i);
      const threat: Vec3 = [x + 30, terrain.heightAt(x + 30, z) + 1.6, z];
      if (!coveredFrom(nav, i, threat, true) || threat[1] > y + 8) continue;
      tried += 1;
      if (sightBlocked(world, threat, [x, y + 1.4, z])) hidden += 1;
    }
    expect(tried).toBeGreaterThan(500);
    expect(hidden / tried).toBeGreaterThan(0.9);
  });

  it('ships as data that routes the same', () => {
    const bytes = encodeLargeNav(nav);
    const loaded = decodeLargeNav(bytes);
    const t0 = performance.now();
    const pairs = 2000;
    let hops = 0;
    const land = (i: number) => {
      while (nav.nodes[i]!.escape) i = (i + 1) % nav.nodes.length;
      return i;
    };
    for (let i = 0; i < pairs; i++) hops += findPath(loaded, (i * 7919) % nav.nodes.length, land((i * 104729 + 13) % nav.nodes.length))!.length;
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

describe('Zero Island: a way out of the shallows and the pits (ticket 75)', () => {
  // A Solos bot slid down the Frostbite sea cliff onto the beach strip at its foot, where no
  // node was in reach, and stood there 110 s.
  const PIT: Vec3 = [-431.6, terrain.heightAt(-431.6, -391.4), -391.4];
  const SHALLOWS: Vec3 = [-445, terrain.heightAt(-445, -400), -400];

  it('starts a route beside a bot stranded below the sea cliff, and leads it back to the Frostbite Core', () => {
    for (const p of [PIT, SHALLOWS]) {
      const from = startNode(nav, world, p);
      expect(Math.hypot(at(from)[0] - p[0], at(from)[2] - p[2]), `${p[0]},${p[2]}`).toBeLessThan(6);
      const path = findPath(nav, from, coreNode('frostbite-peaks'));
      expect(path, `${p[0]},${p[2]}`).not.toBeNull();
      for (let i = 1; i < path!.length; i++) expect(linkKind(nav, path![i - 1]!, path![i]!)).not.toBeNull();
    }
  });

  it('never sends a bot into the water: no way out is a goal, or reached from land', () => {
    const ways = nav.nodes.flatMap((n, i) => (n.escape ? [i] : []));
    expect(ways.length).toBeGreaterThan(1000);
    const { linkStart, linkTo } = nav.packed;
    const into: string[] = [];
    for (let i = 0; i < nav.nodes.length; i++) {
      if (nav.nodes[i]!.escape) continue;
      for (let l = linkStart[i]!; l < linkStart[i + 1]!; l++) if (nav.nodes[linkTo[l]!]!.escape) into.push(`${i} to ${linkTo[l]}`);
    }
    expect(into.slice(0, 10)).toEqual([]);
    expect(nav.nodes[nearestNode(nav, world, PIT)]!.escape).toBeFalsy();
    for (const i of nav.index!.near(PIT, 30)) expect(nav.nodes[i]!.escape).toBeFalsy();
  });

  it('leaves no standable ground in Ground Zero without a node in reach', () => {
    const holes: string[] = [];
    for (let x = -800; x <= 800; x += 4) {
      for (let z = -800; z <= 800; z += 4) {
        if (regionAt(x, z) !== 'ground-zero' || !insidePolygon(map.playArea!, x, z)) continue;
        const y = terrain.heightAt(x, z);
        if (y < 0.3 || terrain.steepAt(x, z) || nav.index!.near([x, y, z], 1).length > 0) continue;
        const c = at(startNode(nav, world, [x, y, z]));
        if (Math.hypot(c[0] - x, c[2] - z) > 8 || Math.abs(c[1] - y) > 4) holes.push(`${x},${z}`);
      }
    }
    expect(holes.length, holes.slice(0, 10).join(' ')).toBe(0);
  });
});
