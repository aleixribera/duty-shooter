# M4A1 authored parts

The editable Blender scene is `packages/fps-client/src/viewmodel/assets/m4a1-model.blend`.
It contains the authored pieces and a hidden/visible reference collection built
from the original game geometry. The game loads `m4a1-details.glb`; it keeps
the original meshes as a fallback if that asset cannot be loaded.

The source generator uses metres, with game +Y up and the muzzle along -Z.
The magazine is authored in the existing magazine's local coordinates. Its
mesh and markings attach to the magazine mount, so the current reload tracks,
cartridges and visibility continue to work. The rear sight and muzzle retain
the original socket locations.

To rebuild from the repository root, with Node and Blender available:

```text
node tools/weapon/export-base.mjs
blender --background --factory-startup --python tools/weapon/build_details.py -- --overwrite-source
blender --background packages/fps-client/src/viewmodel/assets/m4a1-model.blend --python tools/weapon/check_model.py
```

On this workstation the portable Blender executable is available at
`tools/.blender/blender-5.2.2-windows-x64/blender.exe`. That installation is
ignored by Git; a fresh checkout needs its own Blender installation.

`export-base.mjs` writes an intermediate file under the ignored `node_modules`
directory. The Blender script regenerates the editable scene and exports the GLB;
preserve any manual edits to the scene before using `--overwrite-source`. It
also bakes a convex-edge mask into vertex colors; the client uses that mask
with its existing procedural materials. The first-person asset groups pieces by
material, while the code-built low-detail version remains suitable for other
players at a distance. After rebuilding, run the client tests and check the
viewer (`?viewer` and `?viewer&webgl`) through reload, inspect, and aim.
