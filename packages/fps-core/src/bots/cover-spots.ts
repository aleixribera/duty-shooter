import type { Vec3 } from '../math';
import type { LargeNav } from './large-nav';
import type { NavGraph } from './nav';

/**
 * Where a bot can get behind something, from the same build output as its
 * nav. A large map's nodes say which ways they're sheltered; a small map has no
 * such data, and this finds nothing there.
 */

/** A place to stand behind cover. */
export interface CoverSpot {
  readonly node: number;
  /** Metres from where the question was asked, on the ground plane. */
  readonly distance: number;
  /** It hides someone standing; otherwise only someone crouched. */
  readonly full: boolean;
}

const SIDES = 8;

/** Which eighth of a turn (x, z) lies in. */
function side(dx: number, dz: number): number {
  return ((Math.round((Math.atan2(dz, dx) / (Math.PI * 2)) * SIDES) % SIDES) + SIDES) % SIDES;
}

function packedOf(graph: NavGraph): LargeNav['packed'] | null {
  return (graph as Partial<LargeNav>).packed ?? null;
}

/** The cover bits of a node: `full` for standing, and `low` for crouched, 0 on a map without them. */
export function coverOf(graph: NavGraph, node: number): { full: number; low: number } {
  const p = packedOf(graph);
  return p ? { full: p.coverFull[node]!, low: p.coverLow[node]! } : { full: 0, low: 0 };
}

/** Per node, the sides it has cover on when crouched, for a route that hugs cover; null on a map without them. */
export function coverBits(graph: NavGraph): Uint8Array | null {
  return packedOf(graph)?.coverLow ?? null;
}

/** True when a body at `node` is sheltered from `threat`, crouched or (with `standing`) on its feet. */
export function coveredFrom(graph: NavGraph, node: number, threat: Vec3, standing = false): boolean {
  const p = packedOf(graph);
  if (!p) return false;
  const k = side(threat[0] - p.positions[node * 3]!, threat[2] - p.positions[node * 3 + 2]!);
  return (((standing ? p.coverFull : p.coverLow)[node]! >> k) & 1) === 1;
}

/**
 * The cover spots within `radius` (m) of `p`, nearest first. Given a `threat`,
 * only those sheltered from it. Walks the chunks round `p`, so it costs what's
 * near and not the map.
 */
export function coverNear(graph: NavGraph, p: Vec3, radius: number, threat?: Vec3): CoverSpot[] {
  const packed = packedOf(graph);
  if (!packed || !graph.index) return [];
  const out: CoverSpot[] = [];
  for (const node of graph.index.near(p, radius)) {
    const low = packed.coverLow[node]!;
    if (low === 0) continue;
    if (threat && !coveredFrom(graph, node, threat)) continue;
    const [x, z] = [packed.positions[node * 3]!, packed.positions[node * 3 + 2]!];
    out.push({ node, distance: Math.hypot(x - p[0], z - p[2]), full: threat ? coveredFrom(graph, node, threat, true) : packed.coverFull[node] !== 0 });
  }
  return out.sort((a, b) => a.distance - b.distance || a.node - b.node);
}
