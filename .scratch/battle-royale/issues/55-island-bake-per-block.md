# Zero Island's lighting baked per block

Status: open
Blocked by: 10

Spec: `../spec.md`

Spec: Client rendering, "Bake: lighting is baked per chunk. If that outgrows the build, baked results get committed and the bake moves out of the normal build." Split out of ticket 10, which drew the island in 512 m surface blocks (ADR 0011) but left it unbaked.

What was measured (ticket 10, on the home server):
- The island's surfaces lay out to 24.5 M lightmap texels: one atlas of 2048 x 17492, past any GPU's texture limit. Each block needs its own atlas.
- The build's baker costs about 13.5 µs a texel for the sun and about 81 µs a texel for each indirect bounce. Two bounces come to about 72 CPU-minutes for the island, or about 5 minutes on 16 threads. That's too long for every build.
- Going by Survival Town's bake (625 k texels in 1.0 MB), the island's would be about 40 MB. It has to stream per block, not load before the match (the budget before a match is 40 MB, and today's is 13.5 MB).
- The ground (terrain) isn't in the bake at all: it needs its own per-block lightmap or sun-visibility map.

To do:
- Lay out and bake each 512 m surface block on its own: its own atlas, its own file, and its own key, so a changed block re-bakes alone.
- Take the bake out of the normal build: a script bakes it, and the results are committed.
- Have the page fetch a block's lightmap as the block comes near, and draw unbaked until it arrives.
- Bake the ground's sun and sky visibility per terrain block.

## Comments
