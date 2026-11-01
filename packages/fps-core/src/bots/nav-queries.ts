import type { Vec3 } from '../math';
import { LONG_SIGHTLINE, type NavGraph } from './nav';

/**
 * What the bot brain asks about nodes in bulk. A large map answers from its
 * index and shares one copy between bots; a small map's walk over its nodes
 * stays what it was, so its bots choose exactly as they did.
 */

const everyNode = new WeakMap<NavGraph, readonly number[]>();
const longViews = new WeakMap<NavGraph, readonly number[]>();
const middles = new WeakMap<NavGraph, Vec3>();

/** The nodes to look through for anything within `radius` (m) of `p` on the ground plane, ascending. */
export function nodesNear(graph: NavGraph, p: Vec3, radius: number): readonly number[] {
  if (graph.index) return graph.index.near(p, radius);
  let all = everyNode.get(graph);
  if (!all) {
    all = graph.nodes.map((_, i) => i);
    everyNode.set(graph, all);
  }
  return all;
}

/** The nodes with a long view, for holding a lane with a sniper rifle. */
export function longSightlines(graph: NavGraph): readonly number[] {
  let found = longViews.get(graph);
  if (!found) {
    found = graph.nodes.flatMap((n, i) => (n.sightline >= LONG_SIGHTLINE ? [i] : []));
    longViews.set(graph, found);
  }
  return found;
}

/** The middle of the map, as the average of its nodes. */
export function navMiddle(graph: NavGraph): Vec3 {
  let middle = middles.get(graph);
  if (!middle) {
    let cx = 0;
    let cz = 0;
    for (const n of graph.nodes) {
      cx += n.position[0];
      cz += n.position[2];
    }
    middle = [cx / graph.nodes.length, 0, cz / graph.nodes.length];
    middles.set(graph, middle);
  }
  return middle;
}
