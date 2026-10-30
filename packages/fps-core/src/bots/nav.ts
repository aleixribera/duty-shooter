import { raycastWorld, segmentSolid } from '../combat/projectiles';
import type { Vec3 } from '../math';
import { standingHeight, sweepY, type Hull } from '../movement/collision';
import { createMoveState, pmove } from '../movement/pmove';
import { TICK_SECONDS } from '../simulation';
import { STATS } from '../stats';
import { usercmd } from '../usercmd';
import type { Ladder, World } from '../world';

/**
 * The nav graph: where bots can stand and how they get from one place to the
 * next. It is generated from the world's collision, so it always matches the
 * map: nodes on every surface a player fits on (floors, upper storeys, roofs,
 * vehicle tops), linked where a player can walk, drop, mantle or use a ladder.
 */

/** How a bot crosses a link: walking, dropping, mantling, or using a ladder. */
export type NavLinkKind = 'walk' | 'drop' | 'climb' | 'ladder';

export interface NavLink {
  readonly to: number;
  readonly kind: NavLinkKind;
  /** Travel cost in metres, with climbs counted longer for the time they take. */
  readonly cost: number;
}

export interface NavNode {
  /** Where a player's feet stand. */
  readonly position: Vec3;
  /** Under a roof: no open sky above head height. */
  readonly indoor: boolean;
  /** Placed by the map at a doorway, stair or climb: a bot passes close to it, rather than cutting the corner. */
  readonly precise: boolean;
  /** The longest clear view from here at eye height (m, up to {@link SIGHTLINE_MAX}), and the yaw it looks along. */
  readonly sightline: number;
  readonly sightYaw: number;
}

/** How far a node's sightline is measured. */
export const SIGHTLINE_MAX = 80;
/** A node with a clear view this long (m) is a spot to hold a lane from with a sniper rifle. */
export const LONG_SIGHTLINE = 35;

export interface NavGraph {
  readonly nodes: readonly NavNode[];
  /** Outgoing links per node. */
  readonly links: readonly (readonly NavLink[])[];
}

/** What a map supplies to generate its graph. */
export interface NavOptions {
  /** The playable outline (x, z); nodes outside it are left out. */
  readonly area: readonly (readonly [number, number])[];
  /** Grid spacing (m) for the sampled nodes. Defaults to 2. */
  readonly spacing?: number;
  /** Extra nodes where the grid would miss a way through: doorways, stairs, climbs. The y is a hint; the node stands on the surface at or just below it. */
  readonly hints?: readonly Vec3[];
  /** Highest surface considered (m). Defaults to 10. */
  readonly ceiling?: number;
  /** Keep every node, not just the part a player can get round (for tuning a map's hints). */
  readonly keepAll?: boolean;
}

const ST = STATS.stance;
const MV = STATS.movement;
const STAND: Hull = { halfWidth: ST.hullHalfWidth.value, height: ST.standHullHeight.value };
const STEP = MV.stepHeight.value;
const MAX_CLIMB = STATS.mantle.highClimbMaxHeight.value;
/** Longest drop a bot will take on purpose, well short of any fall damage. */
const MAX_DROP = Math.min(3.2, STATS.fallDamage.minHeight.value - 0.5);
/** Sample spacing along a link when checking it is walkable. */
const SAMPLE = 0.15;
/** Probes this far out from a node's centre must all find floor, so nodes sit on real floor, not a fence top or an edge. */
const SUPPORT = 0.22;
/** Hint nodes link to anything this close; grid nodes only to their neighbours. */
const HINT_REACH = 4.5;
/** Climbs are tried between grid nodes at most this far apart on the ground plane, and from a hint a little further. */
const CLIMB_REACH = 2.6;
const HINT_CLIMB_REACH = 3.6;
/** A climb takes about this many metres' worth of walking. */
const CLIMB_COST = 4;

function insidePolygon(poly: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/** Floor directly under (x, y, z) within `reach`, as its height, or null. */
function floorUnder(world: World, x: number, y: number, z: number, reach: number): number | null {
  const probe: Hull = { halfWidth: 0.02, height: 0.1 };
  const r = sweepY(world, [x, y, z], probe, -reach);
  return r.hit ? y + r.moved : null;
}

/**
 * Where a standing player rests if put at height `y` in the column (x, z):
 * on a stepped slope (a sloped roof's clip steps) that is the top of the
 * highest step under the hull, as the movement code has it. Null unless the
 * hull fits there with floor under its centre and all four quarters, so
 * nodes sit on real floor, not a fence top or an edge.
 */
function restingHeight(world: World, x: number, y: number, z: number): number | null {
  const h = standingHeight(world, [x, y, z], STAND, y + 0.35);
  if (h === null) return null;
  if (floorUnder(world, x, h + 0.02, z, h - y + 0.06) === null) return null;
  for (const [dx, dz] of [[SUPPORT, SUPPORT], [-SUPPORT, SUPPORT], [SUPPORT, -SUPPORT], [-SUPPORT, -SUPPORT]] as const) {
    if (floorUnder(world, x + dx, h + 0.02, z + dz, 0.25) === null) return null;
  }
  return h;
}

/** Every height a player can stand at in the column (x, z), lowest first. */
function surfacesAt(world: World, x: number, z: number, ceiling: number): number[] {
  const tops = new Set<number>();
  for (const i of world.movement.inRect(x, z, x, z)) {
    const s = world.solids[i]!;
    if (s.max[1] <= ceiling && s.max[1] > -0.5) tops.add(s.max[1]);
  }
  const out: number[] = [];
  for (const y of [...tops].sort((a, b) => a - b)) {
    const h = restingHeight(world, x, y, z);
    if (h !== null && !out.some((o) => Math.abs(o - h) < 0.1)) out.push(h);
  }
  return out.sort((a, b) => a - b);
}

/** The surface a hint stands on: the highest one at or a little below its y. */
function snapHint(world: World, hint: Vec3, ceiling: number): Vec3 | null {
  const ys = surfacesAt(world, hint[0], hint[2], ceiling).filter((y) => y <= hint[1] + 0.6);
  const y = ys.at(-1);
  return y === undefined ? null : [hint[0], y, hint[2]];
}

/**
 * Walks a straight line from `a` toward `b` the way the movement code would:
 * stepping up anything a step high, following the floor down, falling off
 * edges. 'walk' if it arrives at `b` with no fall, 'drop' if it arrives after
 * a fall, null if a wall, a gap or too big a fall stops it.
 */
function traverse(world: World, a: Vec3, b: Vec3): 'walk' | 'drop' | null {
  const len = flat(a, b);
  const n = Math.max(1, Math.ceil(len / SAMPLE));
  let y = a[1];
  let fell = false;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const up = standingHeight(world, [x, y, z], STAND, y + STEP);
    if (up === null) return null;
    y = up;
    const down = sweepY(world, [x, y, z], STAND, -(MAX_DROP + STEP));
    if (!down.hit) return null;
    const fall = -down.moved;
    if (fall > STEP + 1e-6) fell = true;
    y -= fall;
  }
  if (Math.abs(y - b[1]) > 0.08) return null;
  return fell ? 'drop' : 'walk';
}

/** True when nothing between `a` and `b` stands taller than a mantle reaches (a cheap test before trying the climb). */
function climbable(world: World, a: Vec3, b: Vec3): boolean {
  const y = a[1] + MAX_CLIMB + 0.3;
  const from: Vec3 = [a[0], y, a[2]];
  const to: Vec3 = [b[0], y, b[2]];
  return world.movement.firstHit(from, to, (i) => segmentSolid(from, to, world.solids[i]!)) === null;
}

/**
 * Tries the climb from `a` up to `b` with the real movement code: walk at it,
 * jump when blocked (a mantle), and see whether the player ends up standing
 * on `b`.
 */
function climbs(world: World, a: Vec3, b: Vec3): boolean {
  const yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
  const state = createMoveState(a, yaw);
  const limit = Math.ceil(3 / TICK_SECONDS);
  let blockedFor = 0;
  for (let i = 0; i < limit; i++) {
    const p = state.position;
    const d = flat(p, b);
    if (d < 0.35 && Math.abs(p[1] - b[1]) < 0.15 && state.grounded && state.movement !== 'mantle') return true;
    const moving = Math.hypot(state.velocity[0], state.velocity[2]) > 0.5;
    blockedFor = moving || state.movement === 'mantle' || !state.grounded ? 0 : blockedFor + 1;
    const towards = Math.atan2(-(b[0] - p[0]), -(b[2] - p[2]));
    pmove(state, usercmd({ yaw: towards, forward: d < 0.6 ? 0.4 : 1, buttons: blockedFor > 2 ? ['Jump'] : [] }), world, TICK_SECONDS);
  }
  return false;
}

/** Check a ladder in both directions with the same movement used in play. */
function traversesLadder(world: World, ladder: Ladder, up: boolean): boolean {
  const start = up ? ladder.bottom : ladder.landing;
  const end = up ? ladder.landing : ladder.bottom;
  const yaw = Math.atan2(-(end[0]-start[0]),-(end[2]-start[2]));
  const state = createMoveState(start,yaw);
  pmove(state,usercmd({yaw}),world,TICK_SECONDS);
  let attached = false;
  const limit = Math.ceil((Math.abs(end[1]-start[1])/1.8+4)/TICK_SECONDS);
  for (let i=0; i<limit; i++) {
    pmove(state,usercmd({yaw,forward:1}),world,TICK_SECONDS);
    attached ||= state.movement === 'ladder';
    if (attached && state.grounded && state.ladder === null && flat(state.position,end)<0.15 && Math.abs(state.position[1]-end[1])<0.15) return true;
  }
  return false;
}

/** Whether a node has a roof over it (anything that stops bullets up to 6 m above head height). */
function covered(world: World, p: Vec3): boolean {
  return raycastWorld(world, [p[0], p[1] + 1.8, p[2]], [p[0], p[1] + 8, p[2]]) !== null;
}

/**
 * Generates the nav graph for a world: a grid of nodes on every standable
 * surface inside the area, plus the hints, linked where the movement code
 * can walk, drop, mantle or use a ladder between them. Only the biggest part a player can
 * get round in both directions is kept, so no bot is ever sent somewhere it
 * can't come back from (a drop into it is kept only if the part it lands in is).
 */
export function buildNavGraph(world: World, options: NavOptions): NavGraph {
  const spacing = options.spacing ?? 2;
  const ceiling = options.ceiling ?? 10;
  const points: { p: Vec3; hint: boolean }[] = [];
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
  for (let x = Math.ceil(x0 / spacing) * spacing; x <= x1; x += spacing) {
    for (let z = Math.ceil(z0 / spacing) * spacing; z <= z1; z += spacing) {
      if (!insidePolygon(options.area, x, z)) continue;
      for (const y of surfacesAt(world, x, z, ceiling)) points.push({ p: [x, y, z], hint: false });
    }
  }
  for (const h of options.hints ?? []) {
    const p = insidePolygon(options.area, h[0], h[2]) ? snapHint(world, h, ceiling) : null;
    if (p && !points.some((q) => flat(q.p, p) < 0.2 && Math.abs(q.p[1] - p[1]) < 0.3)) points.push({ p, hint: true });
  }
  // Keep exact endpoints: a ladder is entered only close to its feet or its
  // landing. Invalid or blocked routes must not connect the graph.
  const ladderLinks: { bottom: number; top: number; cost: number }[] = [];
  for (const route of world.ladders) {
    if (!insidePolygon(options.area,route.bottom[0],route.bottom[2]) || !insidePolygon(options.area,route.landing[0],route.landing[2])) continue;
    const bottom = snapHint(world,route.bottom,ceiling), top = snapHint(world,route.landing,ceiling);
    if (!bottom || !top || Math.abs(bottom[1]-route.bottom[1])>0.1 || Math.abs(top[1]-route.landing[1])>0.1) continue;
    if (!traversesLadder(world,route,true) || !traversesLadder(world,route,false)) continue;
    const bottomIndex = points.length;
    points.push({p:bottom,hint:true},{p:top,hint:true});
    ladderLinks.push({bottom:bottomIndex,top:bottomIndex+1,cost:flat(bottom,top)+Math.abs(top[1]-bottom[1])*2.5});
  }

  // Neighbours by a coarse bucket on the ground plane.
  const bucket = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / HINT_REACH)},${Math.floor(z / HINT_REACH)}`;
  points.forEach((q, i) => {
    const k = key(q.p[0], q.p[2]);
    bucket.set(k, [...(bucket.get(k) ?? []), i]);
  });
  const near = (p: Vec3): number[] => {
    const out: number[] = [];
    const bx = Math.floor(p[0] / HINT_REACH);
    const bz = Math.floor(p[2] / HINT_REACH);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(bucket.get(`${bx + i},${bz + j}`) ?? []));
    return out;
  };

  const links: NavLink[][] = points.map(() => []);
  const gridReach = spacing * Math.SQRT2 + 0.01;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    for (const j of near(a.p)) {
      if (j === i) continue;
      const b = points[j]!;
      const d = flat(a.p, b.p);
      const hinted = a.hint || b.hint;
      const rise = b.p[1] - a.p[1];
      const walk = d <= (hinted ? HINT_REACH : gridReach) && rise <= STEP + 0.01 ? traverse(world, a.p, b.p) : null;
      if (walk) {
        links[i]!.push({ to: j, kind: walk, cost: d + Math.max(0, -rise) * 0.5 });
        continue;
      }
      // No way to walk it: up onto something (a mantle onto a roof edge, then up the slope), or over something in the way (a sill).
      if (d > 0.3 && d <= (hinted ? HINT_CLIMB_REACH : CLIMB_REACH) && rise <= MAX_CLIMB + 0.6 && rise > -1 && climbable(world, a.p, b.p) && climbs(world, a.p, b.p)) {
        links[i]!.push({ to: j, kind: 'climb', cost: d + CLIMB_COST });
      }
    }
  }
  for (const {bottom,top,cost} of ladderLinks) {
    links[bottom]!.push({to:top,kind:'ladder',cost});
    links[top]!.push({to:bottom,kind:'ladder',cost});
  }

  const keep = options.keepAll ? points.map((_, i) => i) : mainComponent(points.length, links);
  const index = new Map<number, number>();
  keep.forEach((old, i) => index.set(old, i));
  return {
    nodes: keep.map((old) => ({ position: points[old]!.p, indoor: covered(world, points[old]!.p), precise: points[old]!.hint, ...sightline(world, points[old]!.p) })),
    links: keep.map((old) => links[old]!.filter((l) => index.has(l.to)).map((l) => ({ ...l, to: index.get(l.to)! }))),
  };
}

/** The longest clear view from `p` at eye height, among 16 directions, and its yaw. */
function sightline(world: World, p: Vec3): { sightline: number; sightYaw: number } {
  const eye: Vec3 = [p[0], p[1] + 1.5, p[2]];
  let best = { sightline: 0, sightYaw: 0 };
  for (let k = 0; k < 16; k++) {
    const yaw = (k / 16) * Math.PI * 2;
    const far: Vec3 = [eye[0] - Math.sin(yaw) * SIGHTLINE_MAX, eye[1], eye[2] - Math.cos(yaw) * SIGHTLINE_MAX];
    const hit = raycastWorld(world, eye, far);
    const d = hit ? hit.t * SIGHTLINE_MAX : SIGHTLINE_MAX;
    if (d > best.sightline) best = { sightline: d, sightYaw: yaw };
  }
  return best;
}

/** The largest strongly connected set of nodes (Tarjan), in ascending order. */
function mainComponent(count: number, links: readonly (readonly NavLink[])[]): number[] {
  const order = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const onStack = new Uint8Array(count);
  const stack: number[] = [];
  let counter = 0;
  let best: number[] = [];
  for (let root = 0; root < count; root++) {
    if (order[root] !== -1) continue;
    // Iterative depth-first search: (node, next link to look at).
    const work: [number, number][] = [[root, 0]];
    order[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = 1;
    while (work.length) {
      const top = work[work.length - 1]!;
      const [v, li] = top;
      const out = links[v]!;
      if (li < out.length) {
        top[1] += 1;
        const w = out[li]!.to;
        if (order[w] === -1) {
          order[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          work.push([w, 0]);
        } else if (onStack[w]) low[v] = Math.min(low[v]!, order[w]!);
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1]![0];
        low[parent] = Math.min(low[parent]!, low[v]!);
      }
      if (low[v] === order[v]) {
        const comp: number[] = [];
        for (;;) {
          const w = stack.pop()!;
          onStack[w] = 0;
          comp.push(w);
          if (w === v) break;
        }
        if (comp.length > best.length) best = comp;
      }
    }
  }
  return best.sort((a, b) => a - b);
}

/**
 * The node nearest `p` that a player standing at `p` can walk straight to
 * (the movement code's way: steps, slopes, no walls in between). Falls back
 * to the nearest in sight, then the nearest at all.
 */
export function nearestNode(graph: NavGraph, world: World, p: Vec3): number {
  const order: { i: number; d: number }[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i]!.position;
    order.push({ i, d: flat(p, n) + Math.abs(n[1] - p[1]) * 3 });
  }
  order.sort((x, y) => x.d - y.d);
  const close = order.slice(0, 8);
  for (const { i } of close) {
    const n = graph.nodes[i]!.position;
    if (n[1] - p[1] <= STEP + 0.01 && traverse(world, p, n) !== null) return i;
  }
  for (const { i } of close) {
    const n = graph.nodes[i]!.position;
    if (raycastWorld(world, [p[0], p[1] + 0.5, p[2]], [n[0], n[1] + 0.5, n[2]]) === null) return i;
  }
  return order[0]?.i ?? 0;
}

/** A* from node `from` to node `to`; the nodes along the way (both ends included), or null when there is no way. `extra` adds cost per node (to steer round danger). */
export function findPath(graph: NavGraph, from: number, to: number, extra?: (node: number) => number): number[] | null {
  const goal = graph.nodes[to]!.position;
  const h = (i: number) => {
    const p = graph.nodes[i]!.position;
    return Math.hypot(p[0] - goal[0], p[1] - goal[1], p[2] - goal[2]);
  };
  const g = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const open = new MinHeap();
  open.push(from, h(from));
  const closed = new Set<number>();
  while (open.size) {
    const v = open.pop();
    if (v === to) {
      const path = [v];
      let c = v;
      while (came.has(c)) {
        c = came.get(c)!;
        path.push(c);
      }
      return path.reverse();
    }
    if (closed.has(v)) continue;
    closed.add(v);
    for (const l of graph.links[v]!) {
      const cost = g.get(v)! + l.cost + (extra ? extra(l.to) : 0);
      if (cost < (g.get(l.to) ?? Infinity)) {
        g.set(l.to, cost);
        came.set(l.to, v);
        open.push(l.to, cost + h(l.to));
      }
    }
  }
  return null;
}

/** The kind of the link from `a` to `b`, if there is one. */
export function linkKind(graph: NavGraph, a: number, b: number): NavLinkKind | null {
  return graph.links[a]!.find((l) => l.to === b)?.kind ?? null;
}

class MinHeap {
  readonly #items: number[] = [];
  readonly #keys: number[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(item: number, key: number): void {
    const items = this.#items;
    const keys = this.#keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const items = this.#items;
    const keys = this.#keys;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < items.length && keys[l]! < mk) {
          m = l;
          mk = keys[l]!;
        }
        if (r < items.length && keys[r]! < mk) m = r;
        if (m === i) break;
        items[i] = items[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
