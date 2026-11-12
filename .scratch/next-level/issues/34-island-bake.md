# Zero Island's lighting baked per block

Status: resolved

Release: v2.171.0

Spec: `../spec.md`

Carried over from `.scratch/battle-royale/issues/55-island-bake-per-block.md` (read it for the measurements). The island draws unbaked: 24.5 M lightmap texels will not fit one atlas, and a whole-island bake costs about 72 CPU-minutes. Bake each 512 m surface block on its own atlas and key by a script outside the normal build, commit the results, stream a block's lightmap as it comes near (unbaked until it lands), and bake the ground's sun and sky visibility per terrain block.

## Comments

**Agent, 2026-11-12 (v2.171.0): re-scoped by a new count, and done.** The ticket's numbers (24.5 M texels, an atlas of 2048 x 17492, 72 CPU-minutes) are from before the island's cover became models. Counted again (`.scratch/next-level/island-bake/blocks.ts`, `faces.ts`): Zero Island draws 399 box faces now, the piers' decks and posts and a few concrete walls (`block`, 179 faces, 11,400 m²) and the sea cover (220 small faces): 337 k texels, one atlas of 2048 x 728. Everything else on it is GLB models and plants, lit by the sky field (ticket 07). So the island needs none of the ticket's machinery: no atlas or file per block, no bake outside the build, no streaming. It bakes in the normal build like the other maps, in 12 s on this PC's 11 threads, to a 419 kB file (`.scratch/next-level/island-bake/bake.mjs`).
- The baker's world has the island's ground in it: a hill shades what stands behind it, light comes back off the ground (its mean colour, lit by the sun as it faces it), and a texel under the ground is buried, filled from its neighbours. Tests in `surfaces.test.ts` ("lighting bake on terrain").
- A map on terrain bakes no probes: its sky field goes on lighting its ground, plants, models and soldiers. A baked surface there takes its sky light from the bake alone and keeps the field's far shadows on its sun (a hill's, past the bake's 160 m). Maps without terrain are unchanged (the field is off there).
- The cache key takes the ground's heights and colours, so a changed island bakes again.
- What it looks like: the walls and piers sit in the ground now, darker at their foot, their shaded faces lit by what is round them; nothing else changes (`island-bake/shots.mjs`, baked and with the bake's fetch blocked, at The Dustlands, Rogue Harbor and a walk to the walls by the harbour).
- Not done, by the same count: the ground's own sun and sky per terrain block. The sky field already shades the ground (2 m a cell, built in about 0.3 s at load); a ray-traced copy would add only finer detail, for a bake of the whole island's ground and megabytes to ship.
