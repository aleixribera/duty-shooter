# Foliage reads as low-poly blobs, not the spec's realistic look

Status: resolved
Release: v2.120.0
Blocked by: 29

Spec: `../spec.md` (realistic style, permanent dusk)

Seen by the lead in ticket 29's shots (`shots/t29/final/mutant-jungle-near.jpg`, `the-dustlands-grazing.jpg`): ground surfaces read as real photo materials, but bushes and tree crowns are solid faceted lumps and the jungle canopy goes near-black. Next to the photo ground the mismatch is the most visible thing on the island.

Make the plant kit match the ground: crowns and bushes built from alpha-tested leaf cards (atlas through the `game-textures` skill, Claude-only sources), generated in Blender (`blender` skill), with wrap/translucent lighting so dusk-lit foliage isn't black, and wind sway in the vertex shader. Keep the same instancing, distance levels, soft-cover rules and placement from ticket 29; keep inside its frame-time and draw-call numbers (alpha-test overdraw is the risk: measure). Also from 29: draw distance of bushes and grass (220-320 m unscoped) should match how far they hide players from bots, or bots get blind spots players don't share.

## Comments

Done (v2.120.0).

- **Foliage atlas** (`tools/textures/foliage.py` -> `apps/range/public/textures/foliage.webp`, 2048 px, 4x4 cells of 512, 1.97 MB). The cells are cut from CC0 photo-scanned Poly Haven plants by Rob Tuytel: island_tree_01, shrub_04, searsia_lucida, pine_tree_01, fern_02, grass_medium_02 and wild_rooibos_bush. They are composed in code into broadleaf and bush clusters, pine and juniper sprays, dry clusters, fern fronds, grass, straw and two tufts, plus one opaque white cell for bark and rock. Nothing is painted or generated. Colour bleeds past the leaf edges so mipmaps don't fringe.
- **Kit** (`tools/map/vegetation.py`, Blender through `build.py`; previews from `tools/map/vegetation-preview.py`, looked at in EEVEE with the alpha clip). Rocks and trunks are unchanged. Crowns, bushes, juniper, fern and grass are now leaf cards:
  - cluster cards are octagons round the leaf disc, so their empty corners cost no pixels;
  - fronds taper to their tip;
  - pines have a cone of crossed sprays under drooping whorls, plus a spire that covers the trunk's top.
  The cards carry volume normals and baked depth AO. The SOFT reach and height values are exactly ticket 29's, so concealment, placement and nav are unchanged. The GLB is 158 -> 173 kB.
- **Lighting** (`foliageLit`): the sun wraps round the mass (0.6), a leaf seen against the sun glows (0.55), and a sky floor keeps canopy shade off black. The same haze as the ground. Alpha test at 0.5, drawn from both sides; alpha grows with the mip level so far crowns don't thin out. The alpha test also cuts shadows.
- **Wind**: ticket 29's sway, plus a per-spot leaf flutter (3 cm) along the plant's normal in the vertex shader. Bark holds still.
- **Bot sight vs draw distance**: bots see 70 m (`SIGHT_RANGE`), and every bush, fern, grass and crown draws to at least 200 m unscoped. Within any range a bot can see, the player sees the same bush, so neither side has a blind spot. Past 220-320 m a bush isn't drawn, but no bot looks that far. A test pins far >= 70 m for every kind that hides.
- **Client** (headless Chrome on this PC, production build, 30 s Local bots Solos, before -> after):
  - Seed 7: frame 2.20 -> 2.20 ms; draws in play 60 -> 60; Preparation frame 2.43 -> 2.51 ms, draws 111 / max 115 both.
  - Seed 11: frame 3.49 -> 3.54 ms; draws 154 -> 154; Preparation frame 2.85 -> 2.82 ms, max draws 135 both.
- **Fixed views** (same build, 2 rounds, WebGPU / WebGL2, before -> after):
  - Whole island overhead: 2.58 -> 2.61 / 2.84 -> 2.92 ms.
  - South-west: 2.40 -> 2.42 / 2.67 -> 2.71 ms.
  - Inside the Mutant Jungle: 2.40 -> 2.75 / 2.87 -> 3.48 ms.
  Draws are unchanged.
- **Alpha-test overdraw** is the cost, and it shows only in the dense jungle (+0.35 ms WebGPU, +0.6 ms WebGL2, still 290+ fps here).
  - Not shadows: turning off leaf shadows changed nothing.
  - Octagon cards and fewer bush and canopy cards held it. Drawing near plants front to back gained nothing measurable, so it was left out.
- **Download**: 21.7 -> 23.7 MB gzip before a match, under 40 MB.
- **Server**: the 60-seat load test (2 clients, 58 bots, 40 s, under remote-test) gave tick mean 1.21 ms, p99 2.75, 0 late, against ticket 29's 1.96 / 3.5. The server path is unchanged; the only change it sees is the atlas URL.
- **Bots**: the island soak gives 231 crossings, stuck 4.8 s, which is identical to ticket 29's after.
- **Tests**: `zero-island-plants.test.ts` gained two:
  - every hiding kind draws at least as far as bots see;
  - every model carries atlas UVs (this fails on ticket 29's GLB).
  Full suite: 1516 passed, 14 skipped. Typecheck is clean.
- **Shots**: `../shots/t62/final` (WebGPU) and `final-webgl`, near, grazing and far for every Region. Sheets are `final-a.jpg` and `final-b.jpg`, against `t29-a.jpg` and `t29-b.jpg`. Fixed views are in `perf/`.
- **What I saw**:
  - Dustlands' dry bushes and grass read as real scrub on the photo ground.
  - The jungle canopy is green and leafy, not black.
  - Pines read as conifers.
  - Neon City and Rogue Harbor carry no soft plants (ticket 29's choice).
- **Limitations**:
  - Up close the cards' flat planes and repeated clusters can still be seen.
  - Pine spires lit against a low sun go pale.
  - Far canopy LODs are coarser than near.
  - WebGL2 pays roughly twice WebGPU's extra cost in the jungle.
