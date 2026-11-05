import { describe, expect, it } from 'vitest';
import { buildLargeNav, coverNear, coverOf, coveredFrom, createWorld, decodeLargeNav, encodeLargeNav, findPath, linkKind, nearestNode, startNode, type NavGraph, type TerrainData, type Vec3 } from '@duty-shooter/fps-core';
import { box } from '@duty-shooter/fps-core/harness';
import { playGround } from '@duty-shooter/fps-core/modes';

/**
 * A small island: two shores with a shallow channel between them and one
 * deck over it, a cone too steep to climb on the west shore, a walkable hill
 * on the east one, a stream to wade, and a walled yard with a block to mantle.
 */
const HALF = 120;
const SHORE = 0.2;
const CHANNEL = 14;
const CONE = { x: -70, z: 30, radius: 26 };
const HILL = { x: 70, z: 50, radius: 40 };
const STREAM_Z = -60;

function height(x: number, z: number): number {
  if (Math.abs(x) < CHANNEL) return -0.6;
  if (Math.abs(x) > 110 || Math.abs(z) > 110) return -0.6;
  const cone = Math.hypot(x - CONE.x, z - CONE.z);
  if (cone < CONE.radius) return 3 + (CONE.radius - cone) * 1.6;
  const hill = Math.hypot(x - HILL.x, z - HILL.z);
  if (hill < HILL.radius) return 3 + (HILL.radius - hill) * 0.3;
  if (x > CHANNEL && Math.abs(z - STREAM_Z) < 4) return 2.6;
  return 3;
}

function terrain(): TerrainData {
  const n = 2 * HALF;
  const heights = new Float32Array((n + 1) * (n + 1));
  const water = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const [x, z] = [i - HALF, j - HALF];
      heights[j * (n + 1) + i] = height(x, z);
      water[j * (n + 1) + i] = x > CHANNEL && Math.abs(z - STREAM_Z) < 4 ? 3 : 0;
    }
  }
  return { origin: [-HALF, -HALF], cell: 1, columns: n, rows: n, heights, water, palette: ['dirt'] };
}

const DECK = box({ min: [-CHANNEL - 3, 2.5, -3], max: [CHANNEL + 3, 3.02, 3], material: 'concrete' });
/** A block on the east shore, low enough to mantle, and a tall one nobody gets onto. */
const BLOCK = box({ min: [40, 0, -30], max: [46, 4.3, -24], material: 'concrete' });
const TOWER = box({ min: [-60, 0, -40], max: [-54, 30, -34], material: 'concrete' });
const world = createWorld([DECK, BLOCK, TOWER], { terrain: terrain() });
const area: [number, number][] = [[-112, -112], [112, -112], [112, 112], [-112, 112]];
const regions = { hubs: [[-60, -60], [60, 0]] as const, of: (x: number) => (x < 0 ? 0 : 1) };
const large = buildLargeNav(world, { area, shore: SHORE, ceiling: 40, chunk: 32, regions });

const near = (nav: NavGraph, x: number, z: number) => nearestNode(nav, world, [x, height(x, z), z]);
const pos = (nav: NavGraph, i: number) => nav.nodes[i]!.position;
const plan = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function length(nav: NavGraph, path: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(pos(nav, path[i]!)[0] - pos(nav, path[i - 1]!)[0], pos(nav, path[i]!)[1] - pos(nav, path[i - 1]!)[1], pos(nav, path[i]!)[2] - pos(nav, path[i - 1]!)[2]);
  return total;
}

describe('A large map: what the nav covers', () => {
  it('stands on terrain every few metres, at the ground', () => {
    expect(large.nodes.length).toBeGreaterThan(1500);
    const ground = large.nodes.filter((n) => Math.abs(n.position[0]) > CHANNEL + 4);
    for (const n of ground) if (n.position[1] < 10 && !inside(n.position, BLOCK)) expect(Math.abs(n.position[1] - height(n.position[0], n.position[2]))).toBeLessThan(0.6);
  });

  it('never stands in the sea, on the steep cone or on a tower nobody reaches', () => {
    for (const n of large.nodes) {
      const [x, y, z] = n.position;
      expect(y, `${x},${z}`).toBeGreaterThan(SHORE);
      expect(Math.hypot(x - CONE.x, z - CONE.z), `${x},${z}`).toBeGreaterThan(CONE.radius - 3);
      expect(inside(n.position, TOWER)).toBe(false);
    }
  });

  it('covers a walkable hill to its top, and the top of a block a mantle reaches', () => {
    const top = large.nodes.some((n) => plan(n.position, [HILL.x, 0, HILL.z]) < 3 && n.position[1] > 13);
    expect(top).toBe(true);
    expect(large.nodes.some((n) => inside(n.position, BLOCK))).toBe(true);
  });

  it('only keeps ground a bot can come back from', () => {
    const start = near(large, -60, -60);
    for (const [x, z] of [[60, 80], [20, 0], [80, -60], [-100, 100]] as const) {
      const there = near(large, x, z);
      expect(findPath(large, start, there), `${x},${z}`).not.toBeNull();
      expect(findPath(large, there, start), `${x},${z}`).not.toBeNull();
    }
  });
});

function inside(p: Vec3, s: { min: Vec3; max: Vec3 }): boolean {
  return p[0] > s.min[0] && p[0] < s.max[0] && p[2] > s.min[2] && p[2] < s.max[2];
}

describe('A large map: routes', () => {
  it('crosses the channel by the deck alone', () => {
    const path = findPath(large, near(large, -60, -60), near(large, 60, -80))!;
    const crossing = path.map((i) => pos(large, i)).filter((p) => Math.abs(p[0]) < CHANNEL);
    expect(crossing.length).toBeGreaterThan(3);
    for (const p of crossing) {
      expect(Math.abs(p[2])).toBeLessThan(3.1);
      expect(p[1]).toBeCloseTo(3.02, 1);
    }
  });

  it('every step of a route is a link of the graph', () => {
    const path = findPath(large, near(large, -100, 100), near(large, 100, 100))!;
    expect(path[0]).toBe(near(large, -100, 100));
    expect(path.at(-1)).toBe(near(large, 100, 100));
    for (let i = 1; i < path.length; i++) expect(linkKind(large, path[i - 1]!, path[i]!), `${i}`).not.toBeNull();
  });

  it('is close to the shortest way there is', () => {
    const graph: NavGraph = { nodes: large.nodes, links: Array.from({ length: large.nodes.length }, (_, i) => large.links[i]!) };
    const pairs = [[-100, -100, 100, 100], [-90, 80, 95, -90], [20, 100, 30, -100], [-30, -90, -100, 90]] as const;
    for (const [ax, az, bx, bz] of pairs) {
      const [from, to] = [near(large, ax, az), near(large, bx, bz)];
      const quick = length(large, findPath(large, from, to)!);
      const best = length(graph, findPath(graph, from, to)!);
      expect(quick / best, `${ax},${az}`).toBeLessThan(1.15);
    }
  });

  it('steers round a node marked dear', () => {
    const [from, to] = [near(large, -60, -90), near(large, -60, -50)];
    const direct = findPath(large, from, to)!;
    const mid = direct[Math.floor(direct.length / 2)]!;
    const round = findPath(large, from, to, (i) => (plan(pos(large, i), pos(large, mid)) < 6 ? 50 : 0))!;
    expect(round).not.toContain(mid);
  });

  it('wades the stream, at a higher cost than dry ground', () => {
    const path = findPath(large, near(large, 90, -80), near(large, 90, -40))!;
    expect(path.some((i) => Math.abs(pos(large, i)[2] - STREAM_Z) < 2)).toBe(true);
    const a = near(large, 50, -80);
    const dry = large.links[a]!.find((l) => plan(pos(large, l.to), pos(large, a)) > 3.9 && plan(pos(large, l.to), pos(large, a)) < 4.1)!;
    const b = near(large, 50, STREAM_Z);
    const wet = large.links[b]!.find((l) => plan(pos(large, l.to), pos(large, b)) > 3.9 && plan(pos(large, l.to), pos(large, b)) < 4.1)!;
    expect(wet.cost).toBeGreaterThan(dry.cost * 1.1);
  });

  it('names the Regions a route passes', () => {
    expect(large.index!.regionOf(near(large, -60, -60))).toBe(0);
    expect(large.index!.regionOf(near(large, 60, 0))).toBe(1);
    expect(large.index!.regionsBetween(0, 1)).toEqual([0, 1]);
    expect(large.index!.regionsBetween(0, 0)).toEqual([0]);
  });

});

describe('A large map: nearby nodes', () => {
  it('finds the same nearest node as a walk over all of them', () => {
    const graph: NavGraph = { nodes: large.nodes, links: large.links };
    for (const p of [[-60, 3, -60], [70, 12, 50], [0, 3.1, 0], [115, -0.6, 115], [-30, 3, 0]] as Vec3[]) {
      expect(plan(pos(large, nearestNode(large, world, p)), p)).toBeCloseTo(plan(pos(graph, nearestNode(graph, world, p)), p), 5);
    }
  });

  it('lists the nodes within a radius, in ascending order', () => {
    const p: Vec3 = [-60, 3, -60];
    const found = [...large.index!.near(p, 10)];
    const all = large.nodes.flatMap((n, i) => (plan(n.position, p) <= 10 ? [i] : []));
    expect(found).toEqual(all);
  });
});

describe('A large map: as data', () => {
  const bytes = encodeLargeNav(large);
  const loaded = decodeLargeNav(bytes);

  it('loads what was built', () => {
    expect(loaded.nodes.length).toBe(large.nodes.length);
    for (const i of [0, 7, 500, large.nodes.length - 1]) {
      const [a, b] = [loaded.nodes[i]!, large.nodes[i]!];
      expect(a.position[0]).toBeCloseTo(b.position[0], 3);
      expect(a.position[1]).toBeCloseTo(b.position[1], 3);
      expect(a.position[2]).toBeCloseTo(b.position[2], 3);
      expect(a.indoor).toBe(b.indoor);
      expect(a.precise).toBe(b.precise);
      expect(loaded.links[i]).toEqual(large.links[i]!.map((l) => ({ ...l, cost: expect.closeTo(l.cost, 3) as number })));
    }
  });

  it('routes the same', () => {
    const [from, to] = [near(large, -100, 100), near(large, 100, -100)];
    expect(findPath(loaded, from, to)).toEqual(findPath(large, from, to));
  });

  it('refuses data of another format', () => {
    const wrong = bytes.slice();
    wrong[0] = 0;
    expect(() => decodeLargeNav(wrong)).toThrow(/nav/i);
  });

  it('takes a file built from the world it is given, and refuses one built from another', () => {
    expect(decodeLargeNav(bytes, world).packed.positions).toEqual(large.packed.positions);
    const moved = createWorld([...world.solids, box({ min: [0, 0, 0], max: [1, 1, 1], material: 'concrete' })], { terrain: terrain() });
    expect(() => decodeLargeNav(bytes, moved)).toThrow(/stale/);
  });
});

describe('cover spots in the nav', () => {
  // The tower on the west shore stands from x -60 to -54.
  const behind = nearestNode(large, world, [-62, 3, -37]);
  const east: Vec3 = [0, 4.6, -37];
  const west: Vec3 = [-110, 4.6, -37];

  it('knows which way a spot beside a solid is sheltered', () => {
    expect(coveredFrom(large, behind, east, true)).toBe(true);
    expect(coveredFrom(large, behind, west, true)).toBe(false);
  });

  it('marks nothing out on open ground', () => {
    expect(coverOf(large, nearestNode(large, world, [80, 3, -90]))).toEqual({ full: 0, low: 0 });
  });

  it('finds spots near a point, nearest first, only the ones sheltered from a threat', () => {
    const spots = coverNear(large, [-64, 3, -37], 10, east);
    expect(spots.length).toBeGreaterThan(2);
    expect(spots.map((s) => s.distance)).toEqual([...spots.map((s) => s.distance)].sort((a, b) => a - b));
    for (const s of spots) {
      expect(large.nodes[s.node]!.position[0]).toBeLessThan(-59);
      expect(coveredFrom(large, s.node, east)).toBe(true);
    }
    expect(spots.some((s) => s.full)).toBe(true);
  });

  it('ships them in the file', () => {
    const loaded = decodeLargeNav(encodeLargeNav(large));
    expect(coverOf(loaded, behind)).toEqual(coverOf(large, behind));
    expect(coverNear(loaded, [-64, 3, -37], 10, east)).toEqual(coverNear(large, [-64, 3, -37], 10, east));
  });

  it('finds none on a map built without them', () => {
    expect(coverNear({ nodes: [], links: [] } as NavGraph, [0, 0, 0], 50)).toEqual([]);
  });
});

/**
 * A coast (ticket 75): land at 3 m to the west; north of z = 30 a beach runs
 * gently down into the shallows; south of it the land ends in a cliff onto a
 * strip of beach at 0.5 m with the shallows beyond. Anyone can fall onto the
 * strip, and only wading out round the shallows to the beach leads back.
 */
describe('A large map: a way out of the shallows and the pits (ticket 75)', () => {
  const COVE = 30;
  const coast = (x: number, z: number): number => {
    if (x <= 0) return 3;
    if (z > COVE) return Math.max(-0.6, 3 - x * 0.09);
    if (x <= 1) return 0.5;
    return x <= 8 ? 0.5 : Math.max(-0.6, 0.5 - (x - 8) * 0.3);
  };
  const ground = (): TerrainData => {
    const [x0, z0, n] = [-40, -60, 120];
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) heights[j * (n + 1) + i] = coast(x0 + i, z0 + j);
    return { origin: [x0, z0], cell: 1, columns: n, rows: n, heights, water: new Float32Array((n + 1) * (n + 1)), palette: ['dirt'] };
  };
  const shoreWorld = createWorld([], { terrain: ground() });
  const shoreArea: [number, number][] = [[-38, -58], [78, -58], [78, 58], [-38, 58]];
  const plain = buildLargeNav(shoreWorld, { area: shoreArea, shore: SHORE, chunk: 32 });
  const nav = buildLargeNav(shoreWorld, { area: shoreArea, shore: SHORE, chunk: 32, wade: { floor: -1, reach: 12 } });
  const land: Vec3 = [-20, 3, 0];
  const strip: Vec3 = [5, 0.5, -20];
  const shallows: Vec3 = [20, -0.6, -40];

  it('had no way out of the strip below the cliff', () => {
    const from = startNode(plain, shoreWorld, strip);
    expect(plan(pos(plain, from), strip)).toBeGreaterThan(6);
  });

  it('a route leads from the strip and from the shallows back to the land', () => {
    for (const at of [strip, shallows]) {
      const from = startNode(nav, shoreWorld, at);
      expect(plan(pos(nav, from), at), `${at}`).toBeLessThan(4);
      const path = findPath(nav, from, nearestNode(nav, shoreWorld, land));
      expect(path, `${at}`).not.toBeNull();
      for (let i = 1; i < path!.length; i++) expect(linkKind(nav, path![i - 1]!, path![i]!)).not.toBeNull();
    }
  });

  it('no route leads into them, and nothing else treats them as somewhere to be', () => {
    const out = nav.nodes.flatMap((n, i) => (n.escape ? [i] : []));
    expect(out.length).toBeGreaterThan(20);
    for (let i = 0; i < nav.nodes.length; i++) if (!nav.nodes[i]!.escape) for (const l of nav.links[i]!) expect(nav.nodes[l.to]!.escape, `${i} to ${l.to}`).toBeFalsy();
    for (const at of [strip, shallows]) expect(nav.nodes[nearestNode(nav, shoreWorld, at)]!.escape).toBeFalsy();
    for (const i of nav.index!.near(strip, 15)) expect(nav.nodes[i]!.escape, 'near').toBeFalsy();
    const spots = playGround(nav, shoreWorld);
    for (let i = 0; i < spots.count; i++) expect(spots.spot(i)[0] <= 1 || spots.spot(i)[2] > COVE, `${spots.spot(i)}`).toBe(true);
  });

  it('keeps what it was on land, and ships the way out in the file', () => {
    const kept = (g: NavGraph) => g.nodes.filter((n) => !n.escape).map((n) => n.position.join());
    expect(kept(nav)).toEqual(kept(plain));
    const loaded = decodeLargeNav(encodeLargeNav(nav));
    expect(loaded.nodes.map((n) => !!n.escape)).toEqual(nav.nodes.map((n) => !!n.escape));
  });
});

describe('A large map: Region hubs', () => {
  // A flat strip in three Regions, west, middle and east, with a crate too tall to climb at the middle of a
  // west chunk. Its top is the cluster nearest the west hub, but nothing reaches it: you can only jump off.
  const W = 80;
  const flat = (): TerrainData => {
    const [columns, rows] = [2 * W, 32];
    const heights = new Float32Array((columns + 1) * (rows + 1)).fill(3);
    return { origin: [-W, -16], cell: 1, columns, rows, heights, water: new Float32Array(heights.length), palette: ['dirt'] };
  };
  const CRATE = box({ min: [-49.5, 3, 6.5], max: [-46.5, 5.4, 9.5], material: 'concrete' });
  const strip = createWorld([CRATE], { terrain: flat() });
  const regions = { hubs: [[-48, 8], [0, 0], [48, 0]] as [number, number][], of: (x: number) => (x < -32 ? 0 : x > 32 ? 2 : 1) };
  const nav = buildLargeNav(strip, { area: [[-78, -14], [78, -14], [78, 14], [-78, 14]], shore: SHORE, chunk: 32, wade: { floor: -1, reach: 12 }, regions });

  it('puts a hub on ground every cluster reaches, not on a crate top nobody climbs', () => {
    expect(nav.index!.regionsBetween(0, 2)).toEqual([0, 1, 2]);
    expect(nav.index!.regionsBetween(2, 0)).toEqual([0, 1, 2]);
  });
});
