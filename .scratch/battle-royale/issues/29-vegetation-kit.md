# Vegetation, ground materials and environment kit for every Region

Status: resolved
Release: v2.119.1
Blocked by: 10,28

Spec: `../spec.md`, "Density and sightlines"

Trees, shrubs, tall grass and rocks for each Region, built in Blender from generator scripts, seen in renders and in game. Instanced placement with distance LOD inside the frame budget. Trunks and rocks are hard cover, foliage is soft cover that hides players and blocks bots' sight but not bullets. Ground materials for every Region are made here too (spec: Ground materials), with the `game-textures` skill, as is every texture on the kit. The full island gets filled here, not only the Cores, and no area is left bare.

## Comments

- Shipped in v2.116.0 (ground layers), v2.117.0 (plant kit models), v2.118.0 (soft cover in the core) and v2.119.0 (placement and renderer); this write-up is v2.119.1.
- **Ground materials** (`tools/textures/ground.py`, game-textures skill): thirteen CC0 photo layers (Poly Haven/ambientCG), hex-tiled per terrain cell in one texture array and tinted to the Region's palette. The layer index rides in the terrain colour texture's alpha. Ground steeper than the slope limit shows cliff rock, triplanar, at 9 m a tile.
- **Plant kit** (`tools/map/vegetation.py`, built in Blender with previews looked at): three rocks, pine and broadleaf trunks and crowns, a leafy bush, a dry bush, juniper, fern, tall grass, dry grass and two ground tufts. Each has a cheap distance model (rock 30 tris, trunk 13, bush 40, grass 7). Everything is in one 158 kB GLB, with colours from materials and occlusion baked into the vertices. No textures: rocks borrow the ground's rock layer, triplanar.
- **Hard cover is unchanged.** Ticket 28's rocks and trunks keep their solids exactly (same nav, same bullets); the models are scaled into them and their box faces aren't drawn (`Plants.modelled`). The meaning stays "what's seen is what stops a bullet".
- **Soft cover** (`softConcealment`): upright cylinders of foliage. A look is hidden after 0.8 m of foliage summed along it. A bush the eye stands in doesn't count, so a bot in a bush sees out. Tree canopies count, at their height. Lookups use a 6 m grid with a DDA walk, about 0.5 µs per query over 19,218 patches. Wired into the server, Local bots, the page and the test harness.
- **Placement**: a 3 m candidate grid with patch noise (38 m), and spacing and chance per ground layer. It keeps clear of routes, spawns, the runway and solids. Neon City and Rogue Harbor are paved and keep only their hard cover. I judged that more natural than shrubs on asphalt.
- **Drawing**: one instanced draw per kind and level, with 3D distance rings (near 20-50 m; far 45 m for tufts, 220-320 m for soft plants, 600 m for trunks, 2 km for crowns and big rocks). The rings are multiplied by the scope's zoom in half-octave steps, so a bush a sniper hides in is drawn through the scope. Refills happen once a frame, after the camera moves 6-24 m, and upload only the slots in use. Two three.js traps cost 3 ms before they were found: a DynamicDraw attribute is uploaded again on every draw, and an instance matrix under 64 kB becomes a uniform buffer that is also re-uploaded on every draw. Plant buffers are static, with at least 1,100 slots. `?plants=off` measures the cost.
- **Sightlines** (6,467 land points): hard cover within 15 m stays at 99.8% and the median view at 20 m (by design: hard cover unchanged). Crouched with foliage: median 10 m, p90 120 m, 7.5% past 150 m. Crouched without foliage: p90 140 m, 8.8%. Soft cover within 6 m: 55.4% of land (Ground Zero 74%, Dustlands 67%, Frostbite 73%, Jungle 81%, Neon 0.4%, Harbor 4%).
- **Client** (headless Chrome on this PC, production build, 30 s Local bots Solos, before → after), seed 7 / seed 11:
  - Frame mean: 2.22 → 2.24 ms / 2.86 → 3.28 ms.
  - Draws in play: 96 → 60 / 150 → 130.
  - Triangles in play: 324k → 245k / 483k → 586k.
  - Preparation frame: 1.96 → 2.50 / 1.96 → 2.98 ms.
  - Preparation max draws: 121 → 115 / 135 → 135.
  - Preparation triangles: 180k → 344k / 192k → 341k.
  - Seed 11 with `?plants=off`: 2.47 ms.
  - Draw calls stay inside ticket 10's budget. Frame time on seed 11 and in the Preparation is 0.4-1.0 ms over it.
- **Download**: 19.3 → 21.7 MB gzip before a Local bots match (the ground layers are most of it). That is under 40 MB.
- **Server**: 60-seat load test (2 clients, 58 bots, 40 s, under remote-test). Tick mean 1.85 → 1.96 ms, p99 3.0 → 3.5, 0 late. The worst tick, 9.7 ms, came under remote-test's CPU cap.
- **Bots**: island soak 275 → 231 crossings; the longest stuck spell fell from 8.1 → 4.8 s. The test passes.
- Shots are in `../shots/t29/final` (WebGPU) and `final-webgl`, near, grazing and far for every Region.
- **Not done / limitations**:
  - Foliage is solid low-poly masses; there are no alpha-card leaves. The dry bush reads lumpy.
  - Unscoped, soft plants vanish past 220-320 m, while bots' concealment has no range limit.
  - `TerrainView` and `SurfaceBlocks` still update twice a frame when spectating (`follow` runs for you and for whom you watch). That predates this ticket and wasn't changed.
