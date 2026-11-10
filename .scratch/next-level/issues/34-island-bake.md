# Zero Island's lighting baked per block

Status: open

Spec: `../spec.md`

Carried over from `.scratch/battle-royale/issues/55-island-bake-per-block.md` (read it for the measurements). The island draws unbaked: 24.5 M lightmap texels will not fit one atlas, and a whole-island bake costs about 72 CPU-minutes. Bake each 512 m surface block on its own atlas and key by a script outside the normal build, commit the results, stream a block's lightmap as it comes near (unbaked until it lands), and bake the ground's sun and sky visibility per terrain block.

## Comments
