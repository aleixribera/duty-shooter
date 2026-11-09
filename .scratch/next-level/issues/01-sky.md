# A sky worth looking at

Status: open

Spec: `../spec.md`

The clouds are a 64-level texture cut by a 0.09-wide threshold, so they posterise (tools/textures/tiles.mjs, packages/fps-client/src/surface-sky.ts). Smooth 8-bit cloud field, soft lit edges, depth toward the horizon, a real sun disc and halo. Same cost: two reads on sky pixels. Check every map and ?webgl.

## Comments
