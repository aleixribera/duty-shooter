import { components } from './large-nav';
import type { NavGraph } from './nav';

const areas = new WeakMap<NavGraph, Int32Array>();

/**
 * Each nav node's area: the strongly connected part of the graph it lies in,
 * so two nodes of one area each have a route to the other. Found once a graph.
 */
export function navAreas(nav: NavGraph): Int32Array {
  let of = areas.get(nav);
  if (!of) {
    of = components(nav.nodes.length, nav.links, () => true).of;
    areas.set(nav, of);
  }
  return of;
}
