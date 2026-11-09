# A sky worth looking at

Status: resolved
Release: v2.143.0

Spec: `../spec.md`

The clouds are a 64-level texture cut by a 0.09-wide threshold, so they posterise (tools/textures/tiles.mjs, packages/fps-client/src/surface-sky.ts). Smooth 8-bit cloud field, soft lit edges, depth toward the horizon, a real sun disc and halo. Same cost: two reads on sky pixels. Check every map and ?webgl.

## Comments

The cloud picture is now 7-bit and smooth (R heaps with billowed edges, G weather, B fine billows that eat the edge), and the shader reads it three times: the heap, the fine billows, and the heap toward the sun for light. The air behind has a pale band at the horizon, a glow round the sun and the sun's own disc, which burns through thin cloud. `Lighting.cloudCover` (0.45 if unset) says how much of the sky is cloud. Checked on Survival Town, Switchyard, Crash and Zero Island under WebGPU, and Survival Town under ?webgl.
