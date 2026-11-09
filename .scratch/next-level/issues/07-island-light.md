# Zero Island's light

Status: resolved

Release: v2.147.0

Spec: `../spec.md`

The island is unbaked: flat ambient 0.42. Either the per-block bake (battle-royale ticket 55) or a cheaper sky-visibility term per surface vertex and per terrain cell. Pick by cost; the island must stop looking flat.

## Comments

- Chose neither of the two the ticket names, by cost. The per-block bake is hours of baking and megabytes to ship for 1440 x 1340 m; a per-vertex term can't shade the ground between vertices of a 60 m wall. Built a **sky field** instead (`packages/fps-client/src/sky-field.ts`): one picture of the island from above, 2 m a cell, made as the map loads in a few passes over its cells (about 0.3 s on this PC with 56 000 solids, no rays). Four heights a cell: the sun's shadow as it reaches the cell, the same from casters 12 m off or more, and the heights round about averaged close (a few metres) and wide (a few tens).
- Every lit material reads it by world position (`skyLight` in `surface-materials.ts`): surfaces, the ground, plants and kit, leaves, soldiers and models. One texture read a fragment. Past the realtime shadow map's 45 m everything now casts: hills, mesas, buildings, walls. Inside its reach the field keeps to casters 12 m off or more, so the shadow map's crisp shadows aren't doubled by a soft copy. The two averages take up to half and a third of the sky's light at a wall's foot, in an alley, under a roof: interiors are dim with sun through the doors, where they were as bright as the yard.
- The shadow stored is the one reaching a cell, not the cell's own top: the picture is read between cells, and a roof's height spilled a dark skirt onto the sunlit ground at its foot. A post thinner than a cell casts nothing far off (it would cast a road's width). Water casts and stands in nothing: the first cut put a shadow band on the sea round the coast.
- Not casters: trees (a plant carries no size the field can read) and props (they can be shot away). The gun in hand still asks an 80 m ray for the sun. A map with a bake turns the field off when the bake arrives.
- Seen on WebGPU and WebGL: the island from above, Ground Zero, the Dustlands, Neon City, the Harbor's warehouse, the Peaks. 11 tests on the field itself (shadow length by the sun's height, a sun across the grid, a lit roof, hills, the far shade, a thin wall against a post, clip and props, a turned box, the two averages).
