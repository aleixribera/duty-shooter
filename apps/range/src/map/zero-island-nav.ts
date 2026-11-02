import { buildLargeNav, createWorld, encodeLargeNav, type LargeNav } from '@duty-shooter/fps-core';
import { mapSolids, type MapDefinition } from './definition';
import { buildZeroIsland } from './zero-island';
import { CORES, REGION_IDS, regionAt } from './zero-island-terrain';

/** Ground lower than this is the sea and its shallows: bots stay out, and take the bridges. A stream stands higher. */
const SHORE = 0.3;
/** How near a solid the fine grid reaches: less than the default, to hold the node count down under the island's cover. */
const DETAIL = 2;

/** Generates Zero Island's nav from its collision. Too slow for a server's start: it runs in the build (`nav/plugin.ts`). */
export function buildZeroIslandNav(map: MapDefinition): LargeNav {
  const world = createWorld(mapSolids(map), { terrain: map.terrain });
  return buildLargeNav(world, {
    area: map.playArea!,
    shore: SHORE,
    detail: DETAIL,
    regions: {
      hubs: REGION_IDS.map((id) => [CORES[id].x, CORES[id].z] as const),
      of: (x, z) => REGION_IDS.indexOf(regionAt(x, z)),
    },
  });
}

/** The bytes the build ships as `nav/zero-island.nav`. */
export function zeroIslandNavFile(): Uint8Array {
  return encodeLargeNav(buildZeroIslandNav(buildZeroIsland()));
}
