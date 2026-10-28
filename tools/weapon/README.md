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

# The v2 arsenal

The remodelled weapons each have a generator built on `gunsmith.py`: it models
in the M4A1's gun space, bakes procedural finishes (edge wear, cavity grime,
stipple, wood grain, normals) in Cycles into one 2048 texture set per weapon,
and writes the game GLB, the editable `.blend` (every piece with its modifiers,
before the bake) and a preview sheet under `previews/`. Each exported material
carries its flat colour as the glTF extra `tint` for the third-person view.
From the repository root:

```text
blender --background --factory-startup --python tools/weapon/pistol.py
```

In the Blender session, `bkit.run(r"tools/weapon/pistol.py", draft=True)`
renders a quick flat-shaded sheet without baking. The rig numbers in
`packages/fps-client/src/viewmodel/kit.ts` follow the landmarks at the top of
each generator; check idle, aim, reload and inspect in the viewer after editing.

- `pistol.py`: the Warden 9 (slide and magazine pivots match the rig).
- `smg.py`: the Wasp 9 (the bolt in the port is the `slide` part; the magazine
  runs through the grip).
- `arms.py`: the first-person arms (sleeve and tactical glove), skinned to the
  client's arm rig in `packages/fps-client/src/viewmodel/arms.ts`, including
  the three forearm twist bones; the bone numbers at the top must match it.

The Harrow 12 replacement is built with
`blender --background --factory-startup --python tools/weapon/harrow.py`.
It writes `tools/weapon/shotgun.blend` and the game GLB. Its pump and support
hand sit farther forward so the full pump stroke clears the receiver; keep
the pump pivot and `KIT_RIGS.shotgun.left` aligned when changing the model.

The Ridgeline replacement is built with
`blender --background --factory-startup --python tools/weapon/ridgeline.py`.
It writes `tools/weapon/sniper.blend` and the game GLB; the scope eye position,
`bolt` pivot and `mag` pivot match the existing rig. Check the viewer's bolt,
reload and inspect clips after editing.

`arsenal.py` builds the shotgun, sniper and frag grenade until they get their own generators, one per
run, in the M4A1's gun space (Blender: muzzle along +Y, which the glTF export
turns into game -Z; the right palm near the origin). Each GLB holds the body
grouped by material plus the moving parts (`mag`, `slide`, `pump`, `bolt`,
`spoon`, `ring`) with their pivots as origins. The palm, sight, muzzle and
ejection-port numbers the client needs live in
`packages/fps-client/src/viewmodel/kit.ts`, measured from the same script.

Run it in the Blender session (the `blender` skill's bkit helpers):

```text
bkit.reset(); bkit.run(r"tools/weapon/arsenal.py", weapon="shotgun")
bkit.preview(r"tools/weapon/previews/shotgun.png", None, ["side", "three_quarter", "top", "front"])
bkit.export_glb(r"packages/fps-client/src/viewmodel/assets/shotgun.glb", None)
bkit.save_blend(r"tools/weapon/shotgun.blend")
```

Then check every clip in the viewer: `?viewer&weapon=shotgun`, one clip with
`&clip=shell`, held at a moment with `&t=0.9`.
