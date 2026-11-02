import { raycastWorld } from '../combat/projectiles';
import type { Vec3 } from '../math';
import { hullBlocked, standingHeight, sweepY, type Hull } from '../movement/collision';
import { hashString } from '../random';
import { STATS } from '../stats';
import type { World } from '../world';
import { MinHeap, SIGHTLINE_MAX, climbable, climbs, insidePolygon, restingHeight, type NavGraph, type NavIndex, type NavLink, type NavLinkKind, type NavNode } from './nav';

/**
 * Nav for a map too big to build at start or to search node by node: the same
 * graph of nodes and links, generated ahead of time from the collision
 * (terrain as well as solids), packed into typed arrays and shipped as data.
 *
 * Three levels answer a route. A table says which Regions it passes; A* over
 * clusters finds its way through those; A* over nodes runs only in the clusters
 * along that way. A cluster is a set of nodes in one chunk of the map that can
 * all reach each other inside it, so a way through clusters is always a way
 * through nodes. Nothing a bot asks walks every node.
 */

export interface LargeNavOptions {
  /** The playable outline (x, z); nodes outside it are left out. */
  readonly area: readonly (readonly [number, number])[];
  /** Grid spacing (m) on open ground. Defaults to 4. */
  readonly spacing?: number;
  /** Grid spacing (m) beside solids and steep ground, where the open grid would miss a way through. Divides `spacing`. Defaults to 2. */
  readonly fine?: number;
  /** How near (m) a solid or steep ground has to be to call for the fine grid. Defaults to 3. */
  readonly detail?: number;
  /** Metres a side of a chunk. Defaults to 48. */
  readonly chunk?: number;
  /** Highest surface considered (m). Defaults to 200. */
  readonly ceiling?: number;
  /** Ground lower than this is sea: no node stands on it and no link wades it. */
  readonly shore?: number;
  /** The Regions, each with a place in its middle that routes between Regions are measured from. */
  readonly regions?: { readonly hubs: readonly (readonly [number, number])[]; readonly of: (x: number, z: number) => number };
}

/** A built large map: a graph any bot can use, and the arrays it ships as. */
export interface LargeNav extends NavGraph {
  readonly index: NavIndex;
  readonly packed: PackedNav;
}

/** Everything a large map's nav holds, in the arrays it is stored in. Nodes are in chunk order. */
export interface PackedNav {
  readonly chunk: number;
  readonly originX: number;
  readonly originZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly regions: number;
  /** The fingerprint of the world it was built from, so a server can tell a stale file. */
  readonly world: number;
  /** Per chunk, row by row: where its nodes start (one more entry than chunks). */
  readonly chunkStart: Uint32Array;
  /** x, y, z per node. */
  readonly positions: Float32Array;
  /** Per node: bit 0 indoor; the rest is free. */
  readonly flags: Uint8Array;
  /** Per node: its clear view in whole metres, and the sixteenth of a turn it looks along. */
  readonly sightlines: Uint8Array;
  readonly sightYaws: Uint8Array;
  /**
   * Per node, one bit per eighth of a turn (bit k looks along (cos, sin) of k/8
   * of a turn in x, z): something in that direction close enough to stand
   * behind. `coverFull` hides someone standing, `coverLow` someone crouched.
   */
  readonly coverFull: Uint8Array;
  readonly coverLow: Uint8Array;
  /** Per node: where its links start (one more entry than nodes). */
  readonly linkStart: Uint32Array;
  readonly linkTo: Uint32Array;
  readonly linkCost: Float32Array;
  readonly linkKinds: Uint8Array;
  /** Per node: its cluster. */
  readonly clusterOf: Uint32Array;
  /** Per cluster: its Region, and the node that stands for it. */
  readonly clusterRegion: Uint8Array;
  readonly clusterNode: Uint32Array;
  /** Per cluster: where its links to other clusters start (one more entry than clusters). */
  readonly clusterStart: Uint32Array;
  readonly clusterTo: Uint32Array;
  readonly clusterCost: Float32Array;
  /** Per pair of Regions (from × regions + to): the Regions on the best way between them, one bit each. */
  readonly regionRoutes: Uint32Array;
}

const KINDS: readonly NavLinkKind[] = ['walk', 'drop', 'climb', 'ladder'];
const INDOOR = 1;
const ST = STATS.stance;
const MV = STATS.movement;
const STAND: Hull = { halfWidth: ST.hullHalfWidth.value, height: ST.standHullHeight.value };
const STEP = MV.stepHeight.value;
const MAX_CLIMB = STATS.mantle.highClimbMaxHeight.value;
const MAX_DROP = Math.min(3.2, STATS.fallDamage.minHeight.value - 0.5);
const WADE_COST = 1 / STATS.terrain.wadeMultiplier.value;
/** Sample spacing along a link. */
const SAMPLE = 0.2;
/** Solids and steep ground this near (m) call for the fine grid, by default. */
const DETAIL_REACH = 3;
/** Climbs are tried between nodes at most this far apart: across a fine cell, as a roof's edge has no node of its own. */
const CLIMB_REACH = 4.1;
const CLIMB_COST = 4;

const flat = (ax: number, az: number, bx: number, bz: number) => Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
/**
 * The search leans on the straight line this much harder than a true A*. Open
 * ground is full of equally good ways, and an exact search looks at nearly all
 * of them; this looks at a tenth, for routes a few percent longer.
 */
const GREED = 1.3;

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The spacing of the grid it came from. */
  readonly spacing: number;
}

/** True when there are solids within `reach` of the box round a and b. */
function solidsNear(world: World, ax: number, az: number, bx: number, bz: number, reach: number): boolean {
  return world.movement.inRect(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach).length > 0;
}

/** Whether a player can stand on the bare ground at (x, z). */
function groundAt(world: World, x: number, z: number, shore: number): number | null {
  const t = world.terrain;
  if (!t) return null;
  const y = t.heightAt(x, z);
  if (y < shore || t.steepAt(x, z) || hullBlocked(world, [x, y, z], STAND)) return null;
  return y;
}

function surfaces(world: World, x: number, z: number, ceiling: number, shore: number): number[] {
  const out: number[] = [];
  const ground = groundAt(world, x, z, shore);
  if (ground !== null) out.push(ground);
  const tops = new Set<number>();
  for (const i of world.movement.inRect(x, z, x, z)) {
    const top = world.solids[i]!.max[1];
    if (top <= ceiling) tops.add(top);
  }
  for (const y of [...tops].sort((a, b) => a - b)) {
    const h = restingHeight(world, x, y, z);
    if (h !== null && !out.some((o) => Math.abs(o - h) < 0.1)) out.push(h);
  }
  return out;
}

/** True when anything within `reach` of (x, z) calls for the fine grid. */
function detailed(world: World, x: number, z: number, reach: number): boolean {
  if (solidsNear(world, x, z, x, z, reach)) return true;
  const t = world.terrain;
  if (!t) return false;
  for (const [dx, dz] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) if (t.steepAt(x + dx, z + dz)) return true;
  return false;
}

interface Walked {
  readonly kind: 'walk' | 'drop';
  /** The share of the way in water. */
  readonly wet: number;
}

/**
 * Walks from `a` to `b` as the movement code would: up anything a step high
 * unless the ground there is past the slope limit (ADR 0007), down anything
 * a fall can take, never into the sea. Null when it can't get there.
 */
function walkLink(world: World, a: Point, b: Point, shore: number): Walked | null {
  const t = world.terrain;
  const open = !solidsNear(world, a.x, a.z, b.x, b.z, STAND.halfWidth + 0.05);
  const n = Math.max(1, Math.ceil(flat(a.x, a.z, b.x, b.z) / SAMPLE));
  let y = a.y;
  let fell = false;
  let wet = 0;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = a.x + (b.x - a.x) * k;
    const z = a.z + (b.z - a.z) * k;
    if (open) {
      const ground = t!.heightAt(x, z);
      const rise = ground - y;
      if (ground < shore || rise > STEP || (rise > 1e-6 && t!.steepAt(x, z))) return null;
      if (-rise > MAX_DROP) return null;
      if (-rise > STEP + 1e-6) fell = true;
      y = ground;
    } else {
      const up = standingHeight(world, [x, y, z], STAND, y + STEP);
      if (up === null) return null;
      const onGround = t !== null && Math.abs(up - t.heightAt(x, z)) < 1e-4;
      if (onGround && up > y + 1e-6 && t.steepAt(x, z)) return null;
      y = up;
      const down = sweepY(world, [x, y, z], STAND, -(MAX_DROP + STEP));
      if (!down.hit) return null;
      const fall = -down.moved;
      if (fall > STEP + 1e-6) fell = true;
      y -= fall;
      if (t !== null && y < shore && Math.abs(y - t.heightAt(x, z)) < 1e-4) return null;
    }
    if (t !== null && t.waterAbove(x, y, z) >= STATS.terrain.wadeDepth.value) wet += 1;
  }
  if (Math.abs(y - b.y) > 0.08) return null;
  return { kind: fell ? 'drop' : 'walk', wet: wet / n };
}

/** Strongly connected components along the links `keep` allows (Tarjan, iterative): each node's component, and how many there are. */
function components(count: number, links: readonly (readonly NavLink[])[], keep: (from: number, to: number) => boolean): { of: Int32Array; total: number } {
  const of = new Int32Array(count).fill(-1);
  const order = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const stack: number[] = [];
  let counter = 0;
  let total = 0;
  for (let root = 0; root < count; root++) {
    if (order[root] !== -1) continue;
    const work: [number, number][] = [[root, 0]];
    order[root] = low[root] = counter++;
    stack.push(root);
    while (work.length) {
      const top = work[work.length - 1]!;
      const [v, li] = top;
      const out = links[v]!;
      if (li < out.length) {
        top[1] += 1;
        const w = out[li]!.to;
        if (!keep(v, w)) continue;
        if (order[w] === -1) {
          order[w] = low[w] = counter++;
          stack.push(w);
          work.push([w, 0]);
        } else if (of[w] === -1) low[v] = Math.min(low[v]!, order[w]!);
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1]![0];
        low[parent] = Math.min(low[parent]!, low[v]!);
      }
      if (low[v] === order[v]) {
        for (;;) {
          const w = stack.pop()!;
          of[w] = total;
          if (w === v) break;
        }
        total += 1;
      }
    }
  }
  return { of, total };
}

/** The sample at which a node's view is measured, with the same sixteen directions as a small map's. */
function viewFrom(world: World, p: Vec3): { sightline: number; turn: number } {
  const eye: Vec3 = [p[0], p[1] + 1.5, p[2]];
  let best = { sightline: 0, turn: 0 };
  for (let k = 0; k < 16; k++) {
    const yaw = (k / 16) * Math.PI * 2;
    const far: Vec3 = [eye[0] - Math.sin(yaw) * SIGHTLINE_MAX, eye[1], eye[2] - Math.cos(yaw) * SIGHTLINE_MAX];
    const hit = raycastWorld(world, eye, far);
    const d = hit ? hit.t * SIGHTLINE_MAX : SIGHTLINE_MAX;
    if (d > best.sightline) best = { sightline: d, turn: k };
  }
  return best;
}

/** Heights (m) a standing head and a crouched one are at, and how near (m) something has to be to shelter them. */
const COVER_HEAD = 1.55;
const COVER_CROUCH = 0.95;
const COVER_REACH = 2.5;
const COVER_SIDES = 8;

/** Which ways a node at `p` is sheltered at height `y` above it, as bits. */
function shelter(world: World, p: Vec3, y: number): number {
  let bits = 0;
  for (let k = 0; k < COVER_SIDES; k++) {
    const turn = (k / COVER_SIDES) * Math.PI * 2;
    const from: Vec3 = [p[0], p[1] + y, p[2]];
    if (raycastWorld(world, from, [from[0] + Math.cos(turn) * COVER_REACH, from[1], from[2] + Math.sin(turn) * COVER_REACH])) bits |= 1 << k;
  }
  return bits;
}

/**
 * Generates a large map's nav. Only the biggest part a player can get round
 * in both directions is kept, which leaves out anything a walk can't reach,
 * a summit above a cliff among them.
 */
export function buildLargeNav(world: World, options: LargeNavOptions): LargeNav {
  const spacing = options.spacing ?? 4;
  const fine = options.fine ?? 2;
  const reach = options.detail ?? DETAIL_REACH;
  const chunk = options.chunk ?? 48;
  const ceiling = options.ceiling ?? 200;
  const shore = options.shore ?? -Infinity;
  const every = Math.round(spacing / fine);
  if (every * fine !== spacing) throw new Error(`Nav spacing ${spacing} must be a multiple of ${fine}`);

  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of options.area) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const points: Point[] = [];
  const first = (v: number) => Math.ceil(v / fine);
  for (let i = first(x0); i * fine <= x1; i++) {
    for (let j = first(z0); j * fine <= z1; j++) {
      const x = i * fine;
      const z = j * fine;
      if (!insidePolygon(options.area, x, z)) continue;
      const open = i % every === 0 && j % every === 0;
      const close = detailed(world, x, z, reach);
      if (!open && !close) continue;
      for (const y of surfaces(world, x, z, ceiling, shore)) points.push({ x, y, z, spacing: close ? fine : spacing });
    }
  }

  // Neighbours through a coarse bucket on the ground plane.
  const size = spacing * Math.SQRT2 + 0.5;
  const key = (x: number, z: number) => Math.floor(x / size) * 100_000 + Math.floor(z / size);
  const buckets = new Map<number, number[]>();
  points.forEach((p, i) => {
    const k = key(p.x, p.z);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  });
  const links: NavLink[][] = points.map(() => []);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const bx = Math.floor(a.x / size);
    const bz = Math.floor(a.z / size);
    for (let u = -1; u <= 1; u++) {
      for (let v = -1; v <= 1; v++) {
        for (const j of buckets.get((bx + u) * 100_000 + bz + v) ?? []) {
          if (j === i) continue;
          const b = points[j]!;
          const d = flat(a.x, a.z, b.x, b.z);
          // Off an edge may span the cell where the edge itself has no node, as a climb onto it does.
          const offEdge = d <= CLIMB_REACH && b.y < a.y - STEP;
          const walked = d <= Math.max(a.spacing, b.spacing) * Math.SQRT2 + 0.01 || offEdge ? walkLink(world, a, b, shore) : null;
          const length = Math.hypot(d, b.y - a.y);
          if (walked) {
            links[i]!.push({ to: j, kind: walked.kind, cost: length * (1 + (WADE_COST - 1) * walked.wet) });
            continue;
          }
          const rise = b.y - a.y;
          const from: Vec3 = [a.x, a.y, a.z];
          const to: Vec3 = [b.x, b.y, b.z];
          // Onto something, or over something in the way. Only solids: a bank of ground has a trail round it.
          if (d > 0.3 && d <= CLIMB_REACH && rise <= MAX_CLIMB + 0.6 && rise > -1 && solidsNear(world, a.x, a.z, b.x, b.z, 0.6) && climbable(world, from, to) && climbs(world, from, to)) {
            links[i]!.push({ to: j, kind: 'climb', cost: d + CLIMB_COST });
          }
        }
      }
    }
  }

  // The biggest part a player can get round, in chunk order.
  const whole = components(points.length, links, () => true);
  const sizes = new Int32Array(whole.total);
  for (let i = 0; i < points.length; i++) sizes[whole.of[i]!]! += 1;
  const main = sizes.indexOf(Math.max(...sizes));
  const chunkOrigin = { x: Math.floor(x0 / chunk) * chunk, z: Math.floor(z0 / chunk) * chunk };
  const columns = Math.floor((x1 - chunkOrigin.x) / chunk) + 1;
  const rows = Math.floor((z1 - chunkOrigin.z) / chunk) + 1;
  const chunkAt = (p: Point) => Math.floor((p.z - chunkOrigin.z) / chunk) * columns + Math.floor((p.x - chunkOrigin.x) / chunk);
  const kept = points.flatMap((p, i) => (whole.of[i] === main ? [{ i, c: chunkAt(p) }] : [])).sort((a, b) => a.c - b.c || a.i - b.i);
  const newIndex = new Int32Array(points.length).fill(-1);
  kept.forEach((k, i) => (newIndex[k.i] = i));
  const count = kept.length;
  const nodeLinks: NavLink[][] = kept.map((k) => links[k.i]!.filter((l) => newIndex[l.to]! >= 0).map((l) => ({ ...l, to: newIndex[l.to]! })));
  const chunkOf = Int32Array.from(kept, (k) => k.c);

  const chunkStart = new Uint32Array(columns * rows + 1);
  for (const c of chunkOf) chunkStart[c + 1]! += 1;
  for (let c = 0; c < columns * rows; c++) chunkStart[c + 1]! += chunkStart[c]!;

  const positions = new Float32Array(count * 3);
  const flags = new Uint8Array(count);
  const sightlines = new Uint8Array(count);
  const sightYaws = new Uint8Array(count);
  const coverFull = new Uint8Array(count);
  const coverLow = new Uint8Array(count);
  for (let n = 0; n < count; n++) {
    const p = points[kept[n]!.i]!;
    positions.set([p.x, p.y, p.z], n * 3);
    const at: Vec3 = [p.x, p.y, p.z];
    flags[n] = raycastWorld(world, [p.x, p.y + 1.8, p.z], [p.x, p.y + 8, p.z]) !== null ? INDOOR : 0;
    const view = viewFrom(world, at);
    sightlines[n] = Math.floor(view.sightline);
    sightYaws[n] = view.turn;
    coverFull[n] = shelter(world, at, COVER_HEAD);
    coverLow[n] = coverFull[n]! | shelter(world, at, COVER_CROUCH);
  }

  const linkStart = new Uint32Array(count + 1);
  for (let n = 0; n < count; n++) linkStart[n + 1] = linkStart[n]! + nodeLinks[n]!.length;
  const linkTo = new Uint32Array(linkStart[count]!);
  const linkCost = new Float32Array(linkStart[count]!);
  const linkKinds = new Uint8Array(linkStart[count]!);
  for (let n = 0; n < count; n++) {
    nodeLinks[n]!.forEach((l, k) => {
      const at = linkStart[n]! + k;
      linkTo[at] = l.to;
      linkCost[at] = l.cost;
      linkKinds[at] = KINDS.indexOf(l.kind);
    });
  }

  // Clusters: what can reach each other without leaving its chunk.
  const inChunk = components(count, nodeLinks, (a, b) => chunkOf[a] === chunkOf[b]);
  const clusterOf = Uint32Array.from(inChunk.of);
  const clusters = inChunk.total;
  const clusterNode = new Uint32Array(clusters);
  const sumX = new Float64Array(clusters);
  const sumZ = new Float64Array(clusters);
  const members = new Uint32Array(clusters);
  for (let n = 0; n < count; n++) {
    const c = clusterOf[n]!;
    sumX[c]! += positions[n * 3]!;
    sumZ[c]! += positions[n * 3 + 2]!;
    members[c]! += 1;
  }
  const bestD = new Float64Array(clusters).fill(Infinity);
  for (let n = 0; n < count; n++) {
    const c = clusterOf[n]!;
    const d = flat(positions[n * 3]!, positions[n * 3 + 2]!, sumX[c]! / members[c]!, sumZ[c]! / members[c]!);
    if (d < bestD[c]!) {
      bestD[c] = d;
      clusterNode[c] = n;
    }
  }
  const regionsOf = options.regions;
  const regions = regionsOf ? regionsOf.hubs.length : 1;
  if (regions > 32) throw new Error('Nav holds at most 32 Regions');
  const clusterRegion = new Uint8Array(clusters);
  if (regionsOf) for (let c = 0; c < clusters; c++) clusterRegion[c] = regionsOf.of(positions[clusterNode[c]! * 3]!, positions[clusterNode[c]! * 3 + 2]!);

  const between = linkClusters(count, clusters, clusterOf, clusterNode, linkStart, linkTo, linkCost);
  const hubs = (regionsOf?.hubs ?? [[positions[0]!, positions[2]!] as const]).map(([x, z]) => {
    let best = 0;
    let far = Infinity;
    for (let c = 0; c < clusters; c++) {
      const n = clusterNode[c]! * 3;
      const d = flat(positions[n]!, positions[n + 2]!, x, z);
      if (d < far) {
        far = d;
        best = c;
      }
    }
    return best;
  });
  const packed: PackedNav = {
    chunk,
    originX: chunkOrigin.x,
    originZ: chunkOrigin.z,
    columns,
    rows,
    regions,
    chunkStart,
    positions,
    flags,
    sightlines,
    sightYaws,
    coverFull,
    coverLow,
    linkStart,
    linkTo,
    linkCost,
    linkKinds,
    clusterOf,
    clusterRegion,
    clusterNode,
    clusterStart: between.start,
    clusterTo: between.to,
    clusterCost: between.cost,
    regionRoutes: regionRoutes(clusters, regions, hubs, clusterRegion, between),
    world: worldFingerprint(world),
  };
  return largeNav(packed);
}

/**
 * The links between clusters, each costing the shortest way from the one's
 * standing node to the other's, through the first and the clusters beside it.
 */
function linkClusters(count: number, clusters: number, clusterOf: Uint32Array, clusterNode: Uint32Array, linkStart: Uint32Array, linkTo: Uint32Array, linkCost: Float32Array): { start: Uint32Array; to: Uint32Array; cost: Float32Array } {
  const next = Array.from({ length: clusters }, () => new Set<number>());
  for (let n = 0; n < count; n++) {
    for (let l = linkStart[n]!; l < linkStart[n + 1]!; l++) {
      const [a, b] = [clusterOf[n]!, clusterOf[linkTo[l]!]!];
      if (a !== b) next[a]!.add(b);
    }
  }
  const start = new Uint32Array(clusters + 1);
  for (let c = 0; c < clusters; c++) start[c + 1] = start[c]! + next[c]!.size;
  const to = new Uint32Array(start[clusters]!);
  const cost = new Float32Array(start[clusters]!);
  const dist = new Float64Array(count).fill(Infinity);
  for (let c = 0; c < clusters; c++) {
    const others = [...next[c]!].sort((p, q) => p - q);
    const touched: number[] = [];
    const heap = new MinHeap();
    const from = clusterNode[c]!;
    dist[from] = 0;
    touched.push(from);
    heap.push(from, 0);
    const allowed = new Set([c, ...others]);
    while (heap.size) {
      const n = heap.pop();
      for (let l = linkStart[n]!; l < linkStart[n + 1]!; l++) {
        const m = linkTo[l]!;
        if (!allowed.has(clusterOf[m]!)) continue;
        const d = dist[n]! + linkCost[l]!;
        if (d < dist[m]!) {
          if (dist[m] === Infinity) touched.push(m);
          dist[m] = d;
          heap.push(m, d);
        }
      }
    }
    others.forEach((o, k) => {
      to[start[c]! + k] = o;
      cost[start[c]! + k] = dist[clusterNode[o]!]!;
    });
    for (const t of touched) dist[t] = Infinity;
  }
  return { start, to, cost };
}

/** For each pair of Regions, the Regions on the best way between their hubs, by Dijkstra over the clusters. */
function regionRoutes(clusters: number, regions: number, hubs: readonly number[], clusterRegion: Uint8Array, between: { start: Uint32Array; to: Uint32Array; cost: Float32Array }): Uint32Array {
  const out = new Uint32Array(regions * regions);
  const dist = new Float64Array(clusters);
  const came = new Int32Array(clusters);
  for (let a = 0; a < regions; a++) {
    dist.fill(Infinity);
    came.fill(-1);
    dist[hubs[a]!] = 0;
    const heap = new MinHeap();
    heap.push(hubs[a]!, 0);
    while (heap.size) {
      const c = heap.pop();
      for (let l = between.start[c]!; l < between.start[c + 1]!; l++) {
        const o = between.to[l]!;
        const d = dist[c]! + between.cost[l]!;
        if (d < dist[o]!) {
          dist[o] = d;
          came[o] = c;
          heap.push(o, d);
        }
      }
    }
    for (let b = 0; b < regions; b++) {
      let mask = 1 << a;
      for (let c = hubs[b]!; c !== -1; c = came[c]!) mask |= 1 << clusterRegion[c]!;
      out[a * regions + b] = mask >>> 0;
    }
  }
  return out;
}

/** The graph over packed arrays, as a bot uses it. */
export function largeNav(packed: PackedNav): LargeNav {
  const count = packed.flags.length;
  const nodes: NavNode[] = new Array(count);
  for (let i = 0; i < count; i++) {
    nodes[i] = {
      position: [packed.positions[i * 3]!, packed.positions[i * 3 + 1]!, packed.positions[i * 3 + 2]!],
      indoor: (packed.flags[i]! & INDOOR) !== 0,
      precise: false,
      sightline: packed.sightlines[i]!,
      sightYaw: (packed.sightYaws[i]! / 16) * Math.PI * 2,
    };
  }
  return { nodes, links: linkView(packed), index: new Index(packed), packed };
}

/**
 * The links as `NavGraph` has them, unpacked when asked for: half a million
 * link objects are a lot for a collector to walk, so the routes read the arrays
 * and only tools read this.
 */
function linkView(p: PackedNav): readonly (readonly NavLink[])[] {
  const count = p.flags.length;
  const at = (i: number): NavLink[] => {
    const out: NavLink[] = [];
    for (let l = p.linkStart[i]!; l < p.linkStart[i + 1]!; l++) out.push({ to: p.linkTo[l]!, kind: KINDS[p.linkKinds[l]!]!, cost: p.linkCost[l]! });
    return out;
  };
  return new Proxy<NavLink[][]>([], {
    get(target, key, receiver) {
      if (key === 'length') return count;
      if (typeof key === 'string' && /^\d+$/.test(key)) return Number(key) < count ? at(Number(key)) : undefined;
      if (key === Symbol.iterator) return function* () { for (let i = 0; i < count; i++) yield at(i); };
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}

/** The queries of a large map. Its scratch arrays are stamped, not cleared, so a route costs what it visits; one per graph is enough, as a server runs one tick at a time. */
class Index implements NavIndex {
  readonly #p: PackedNav;
  readonly #cost: Float64Array;
  readonly #came: Int32Array;
  readonly #seen: Uint32Array;
  readonly #closed: Uint32Array;
  #stamp = 0;
  readonly #clusterCost: Float64Array;
  readonly #clusterCame: Int32Array;
  readonly #clusterSeen: Uint32Array;
  readonly #clusterClosed: Uint32Array;
  readonly #corridor: Uint32Array;
  #clusterStamp = 0;

  constructor(packed: PackedNav) {
    this.#p = packed;
    const nodes = packed.flags.length;
    const clusters = packed.clusterNode.length;
    this.#cost = new Float64Array(nodes);
    this.#came = new Int32Array(nodes);
    this.#seen = new Uint32Array(nodes);
    this.#closed = new Uint32Array(nodes);
    this.#clusterCost = new Float64Array(clusters);
    this.#clusterCame = new Int32Array(clusters);
    this.#clusterSeen = new Uint32Array(clusters);
    this.#clusterClosed = new Uint32Array(clusters);
    this.#corridor = new Uint32Array(clusters);
  }

  /** Visits the nodes of every chunk touching the square of half-size `r` round (x, z), in ascending order. */
  #square(x: number, z: number, r: number, visit: (node: number) => void): void {
    const { chunk, originX, originZ, columns, rows, chunkStart } = this.#p;
    const c0 = Math.max(0, Math.floor((x - r - originX) / chunk));
    const c1 = Math.min(columns - 1, Math.floor((x + r - originX) / chunk));
    const r0 = Math.max(0, Math.floor((z - r - originZ) / chunk));
    const r1 = Math.min(rows - 1, Math.floor((z + r - originZ) / chunk));
    for (let row = r0; row <= r1; row++) {
      for (let c = c0; c <= c1; c++) {
        const k = row * columns + c;
        for (let n = chunkStart[k]!; n < chunkStart[k + 1]!; n++) visit(n);
      }
    }
  }

  near(p: Vec3, radius: number): number[] {
    const out: number[] = [];
    const positions = this.#p.positions;
    this.#square(p[0], p[2], radius, (n) => {
      if (flat(p[0], p[2], positions[n * 3]!, positions[n * 3 + 2]!) <= radius) out.push(n);
    });
    return out;
  }

  closest(p: Vec3, count: number): number[] {
    const positions = this.#p.positions;
    const span = Math.max(this.#p.columns, this.#p.rows) * this.#p.chunk * 2;
    const close: number[] = [];
    const far: number[] = [];
    for (let r = this.#p.chunk / 2; ; r *= 2) {
      close.length = 0;
      far.length = 0;
      this.#square(p[0], p[2], r, (n) => {
        const d = flat(p[0], p[2], positions[n * 3]!, positions[n * 3 + 2]!) + Math.abs(positions[n * 3 + 1]! - p[1]) * 3;
        if (close.length === count && d >= far[count - 1]!) return;
        let at = Math.min(close.length, count - 1);
        while (at > 0 && far[at - 1]! > d) {
          close[at] = close[at - 1]!;
          far[at] = far[at - 1]!;
          at -= 1;
        }
        close[at] = n;
        far[at] = d;
      });
      // Anything unvisited is at least r away, and height only adds to that.
      if ((close.length === count && far[count - 1]! <= r) || r > span) return close.slice();
    }
  }

  linkKind(a: number, b: number): NavLinkKind | null {
    const p = this.#p;
    for (let l = p.linkStart[a]!; l < p.linkStart[a + 1]!; l++) if (p.linkTo[l] === b) return KINDS[p.linkKinds[l]!]!;
    return null;
  }

  regionOf(node: number): number {
    return this.#p.clusterRegion[this.#p.clusterOf[node]!]!;
  }

  regionsBetween(a: number, b: number): number[] {
    const mask = this.#p.regionRoutes[a * this.#p.regions + b]!;
    const out: number[] = [];
    for (let r = 0; r < this.#p.regions; r++) if (mask & (1 << r)) out.push(r);
    return out;
  }

  /** A* over clusters, inside the Regions in `mask`; marks the way found and the clusters beside it. False when there's none. */
  #findCorridor(from: number, to: number, mask: number): boolean {
    const p = this.#p;
    const stamp = ++this.#clusterStamp;
    const seen = this.#clusterSeen;
    const closed = this.#clusterClosed;
    const cost = this.#clusterCost;
    const came = this.#clusterCame;
    const goal = p.clusterNode[to]! * 3;
    const [gx, gz] = [p.positions[goal]!, p.positions[goal + 2]!];
    const h = (c: number) => {
      const n = p.clusterNode[c]! * 3;
      return flat(p.positions[n]!, p.positions[n + 2]!, gx, gz);
    };
    const open = new MinHeap();
    seen[from] = stamp;
    cost[from] = 0;
    came[from] = -1;
    open.push(from, h(from));
    while (open.size) {
      const c = open.pop();
      if (c === to) {
        const corridor = this.#corridor;
        for (let w = to; w !== -1; w = came[w]!) {
          corridor[w] = stamp;
          for (let l = p.clusterStart[w]!; l < p.clusterStart[w + 1]!; l++) corridor[p.clusterTo[l]!] = stamp;
        }
        return true;
      }
      if (closed[c] === stamp) continue;
      closed[c] = stamp;
      for (let l = p.clusterStart[c]!; l < p.clusterStart[c + 1]!; l++) {
        const o = p.clusterTo[l]!;
        if (!(mask & (1 << p.clusterRegion[o]!))) continue;
        const d = cost[c]! + p.clusterCost[l]!;
        if (seen[o] !== stamp || d < cost[o]!) {
          seen[o] = stamp;
          cost[o] = d;
          came[o] = c;
          open.push(o, d + h(o));
        }
      }
    }
    return false;
  }

  route(from: number, to: number, extra?: (node: number) => number): number[] | null {
    const p = this.#p;
    const [ca, cb] = [p.clusterOf[from]!, p.clusterOf[to]!];
    const everywhere = 0xffffffff | 0;
    const within = p.regionRoutes[p.clusterRegion[ca]! * p.regions + p.clusterRegion[cb]!]! | (1 << p.clusterRegion[ca]!) | (1 << p.clusterRegion[cb]!);
    if (!this.#findCorridor(ca, cb, within) && !this.#findCorridor(ca, cb, everywhere)) return null;
    const corridor = this.#corridor;
    const inside = this.#clusterStamp;
    const stamp = ++this.#stamp;
    const { positions, linkStart, linkTo, linkCost, clusterOf } = p;
    const seen = this.#seen;
    const closed = this.#closed;
    const cost = this.#cost;
    const came = this.#came;
    const [gx, gy, gz] = [positions[to * 3]!, positions[to * 3 + 1]!, positions[to * 3 + 2]!];
    const open = new MinHeap();
    seen[from] = stamp;
    cost[from] = 0;
    came[from] = -1;
    open.push(from, estimate(positions, from, gx, gy, gz));
    while (open.size) {
      const v = open.pop();
      if (v === to) {
        const path: number[] = [];
        for (let n = to; n !== -1; n = came[n]!) path.push(n);
        return path.reverse();
      }
      if (closed[v] === stamp) continue;
      closed[v] = stamp;
      for (let l = linkStart[v]!; l < linkStart[v + 1]!; l++) {
        const w = linkTo[l]!;
        if (corridor[clusterOf[w]!] !== inside) continue;
        const d = cost[v]! + linkCost[l]! + (extra ? extra(w) : 0);
        if (seen[w] !== stamp || d < cost[w]!) {
          seen[w] = stamp;
          cost[w] = d;
          came[w] = v;
          open.push(w, d + estimate(positions, w, gx, gy, gz));
        }
      }
    }
    return null;
  }
}

/** The search's guess at the way left from `n`. A plain function: as a closure V8 compiled it afresh again and again, and a route met it cold. */
function estimate(positions: Float32Array, n: number, gx: number, gy: number, gz: number): number {
  const dx = positions[n * 3]! - gx;
  const dy = positions[n * 3 + 1]! - gy;
  const dz = positions[n * 3 + 2]! - gz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * GREED;
}

const MAGIC = 0x4e565344; // 'DSVN', little-endian.
const VERSION = 3;
const HEADER = 10;

/** The arrays in the order the file holds them. */
const SECTIONS = ['chunkStart', 'positions', 'flags', 'sightlines', 'sightYaws', 'linkStart', 'linkTo', 'linkCost', 'linkKinds', 'clusterOf', 'clusterRegion', 'clusterNode', 'clusterStart', 'clusterTo', 'clusterCost', 'regionRoutes', 'coverFull', 'coverLow'] as const;

/** The bytes a build ships: a header, then every array, each on a 4-byte boundary so loading reads them where they lie. */
export function encodeLargeNav(nav: LargeNav): Uint8Array {
  const p = nav.packed;
  const sizes = SECTIONS.map((s) => p[s].byteLength);
  const aligned = (n: number) => (n + 3) & ~3;
  const total = (HEADER + SECTIONS.length) * 4 + sizes.reduce((sum, n) => sum + aligned(n), 0);
  const bytes = new Uint8Array(total);
  const head = new Uint32Array(bytes.buffer, 0, HEADER + SECTIONS.length);
  const floats = new Float32Array(bytes.buffer, 0, HEADER);
  head[0] = MAGIC;
  head[1] = VERSION;
  head[2] = SECTIONS.length;
  head[3] = p.columns;
  head[4] = p.rows;
  head[5] = p.regions;
  floats[6] = p.chunk;
  floats[7] = p.originX;
  floats[8] = p.originZ;
  head[9] = p.world;
  sizes.forEach((n, i) => (head[HEADER + i] = n));
  let at = (HEADER + SECTIONS.length) * 4;
  for (const s of SECTIONS) {
    bytes.set(new Uint8Array(p[s].buffer, p[s].byteOffset, p[s].byteLength), at);
    at += aligned(p[s].byteLength);
  }
  return bytes;
}

/** A number that changes with what a map's nav is built from: its solids and its ground. */
function worldFingerprint(world: World): number {
  return (hashString(JSON.stringify(world.solids)) ^ (world.terrain?.fingerprint() ?? 0)) >>> 0;
}

/** Loads the bytes `encodeLargeNav` wrote; given the `world` they're for, refuses a file built from anything else. */
export function decodeLargeNav(data: Uint8Array, world?: World): LargeNav {
  // Typed views need the arrays on a boundary from the buffer's start, which a file read needn't give.
  const bytes = data.byteOffset % 4 === 0 ? data : new Uint8Array(data);
  const head = new Uint32Array(bytes.buffer, bytes.byteOffset, HEADER + SECTIONS.length);
  if (head[0] !== MAGIC || head[1] !== VERSION || head[2] !== SECTIONS.length) throw new Error('Not nav data of this version');
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, HEADER);
  let at = bytes.byteOffset + (HEADER + SECTIONS.length) * 4;
  const next = (i: number): { offset: number; size: number } => {
    const size = head[HEADER + i]!;
    const offset = at;
    at += (size + 3) & ~3;
    return { offset, size };
  };
  const u32 = (i: number) => {
    const s = next(i);
    return new Uint32Array(bytes.buffer, s.offset, s.size / 4);
  };
  const f32 = (i: number) => {
    const s = next(i);
    return new Float32Array(bytes.buffer, s.offset, s.size / 4);
  };
  const u8 = (i: number) => {
    const s = next(i);
    return new Uint8Array(bytes.buffer, s.offset, s.size);
  };
  if (world && head[9] !== worldFingerprint(world)) throw new Error('This nav data is stale: the map changed after it was built. Rebuild the range app.');
  return largeNav({
    world: head[9]!,
    columns: head[3]!,
    rows: head[4]!,
    regions: head[5]!,
    chunk: floats[6]!,
    originX: floats[7]!,
    originZ: floats[8]!,
    chunkStart: u32(0),
    positions: f32(1),
    flags: u8(2),
    sightlines: u8(3),
    sightYaws: u8(4),
    linkStart: u32(5),
    linkTo: u32(6),
    linkCost: f32(7),
    linkKinds: u8(8),
    clusterOf: u32(9),
    clusterRegion: u8(10),
    clusterNode: u32(11),
    clusterStart: u32(12),
    clusterTo: u32(13),
    clusterCost: f32(14),
    regionRoutes: u32(15),
    coverFull: u8(16),
    coverLow: u8(17),
  });
}
