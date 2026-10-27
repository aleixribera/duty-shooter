# 08 Look test: one finished house (checkpoint 2)

Status: resolved
Milestone: 2 (the map, checkpoints)
Blocked by: 05, 06

## What to build

The rendering pipeline for stylised realism, proven on one house before the rest of the map is built in it. See the spec section "Rendering (presentation package)".

- **Materials:** code-generated node materials, one family per material: siding, shingles, brick, asphalt, grass, sand, concrete, painted metal, sheet metal, wood fence, glass, plastic. Detail comes from patterns computed in world space, with no texture files.
- **Decoration:** visual-only decoration linked to solids (trim, window frames, gutters, porch details). Each piece declares the solid it decorates and stays within 5 cm of its surface. Add a map test that enforces this.
- **The lighting bake:** a CPU bake at build time of sun shadows, ambient occlusion and one bounce, for the fixed afternoon sun. Its output is generated data that ships with the build, never committed. It runs in both the container build and the Pages build.
- **Dynamic lighting:** a light-probe grid lights dynamic objects. Realtime shadows are cast by dynamic objects only.
- **Merging and instancing:** static geometry is merged per material, and repeated props are instanced.
- **Apply all of this to one house**, inside and out, with its yard and fence. The rest of the map stays plain geometry.

## Acceptance criteria

- [x] At the house's reference spots there's no z-fighting, seams, light leaks, floating or buried decoration, or stretched materials. The playtester agent checks this with screenshots.
- [x] The decoration-to-solid tolerance test passes.
- [x] A benchmark run is recorded in this issue's comments, with the house's cost extrapolated to the full map against the budgets.
- [x] Both the container build and the Pages build run the bake successfully.
- [x] **The owner approves the look.** Record the approval and any changes in this issue's comments. Ticket 09 builds from the approved version.

## Comments

The north house is finished, inside and out, with its yard and fence. The rest of the map is still plain geometry.

**What was built**

- **Surfaces.** Every solid face becomes a lightmapped quad, merged into one mesh per finish. A finish is a family plus colours. A look says which finish a solid wears on its sides, top, bottom, narrow ends and indoor faces. Decorations (frames, sills, shutters, corner boards, baseboards) are visual-only boxes tied to a solid.
- **Patterns.** World-space TSL, no texture files: siding, shingles, brick, asphalt, grass, sand, concrete, paint, sheet metal, fence, wood floor, plaster, dirt, gravel, tile, glass and plastic.
- **Bake.** A Vite plugin (`apps/range/bake/`) bakes each map at build time on worker threads:
  - sun visibility (4 jittered rays, soft edges);
  - sky light with ambient occlusion (32 rays);
  - two bounces;
  - a probe grid for moving things.

  It ships as `bake/<map>.bin` (deflated). It is cached under `node_modules/.cache` and never committed.
- **Lighting.** The lightmap uses 20 cm texels and is sampled bicubically. Static surfaces don't cast realtime shadows. The sun's realtime shadow map holds only moving objects, and it darkens the baked surfaces under them. Moving objects are lit from the probes.
- **Merging and instancing.** Static geometry is merged per finish (about 30 materials). Props stay separate meshes because they can be knocked over. Instancing the repeated ones (cars, bins, chairs) moves to ticket 15 along with the compile warm-up.

**Decoration test.** `apps/range/test/survival-town.test.ts` checks that all 223 decorations sit within 5 cm of their solid (`decorationErrors`). It also checks that every solid has a look.

**Benchmark.** Owner's RTX 5060, Chrome headless, WebGPU, 1080p, vsync off, with the bake loaded:

| Map | Preset | GPU p50 (ms) | Frame p50 / p95 (ms) | Draw calls (mean) | Triangles | Load |
|---|---|---|---|---|---|---|
| Survival Town | low | 0.32 | 0.9 / 1.7 | 20 | ~6 k | 1.28 s |
| Survival Town | normal | 1.00 | 3.7 / 20.8* | 36 | ~6 k | 1.28 s |
| Survival Town | high | 1.96 | 4.5 / 26* | 33 | ~6 k | 1.28 s |
| Practice Range | low / normal / high | 0.18 / 0.83 / 1.72 | | | | 1.66 s |

\* The p95 frame times are noise from other applications on the machine. GPU times were stable across runs, and one clean run gave p95 4.1 ms on High. A CPU profile showed no hotspot in the game.

GPU time is at or below the plain-geometry baseline from ticket 06 (0.41 / 1.16 / 2.10 ms). The bake replaced the realtime sun and hemisphere light on static surfaces, and per-pixel shading is now one lightmap fetch plus the pattern.

**Extrapolation to the full map.** The finished house has 2 003 faces against 906 on the plain south house. Dressing the whole map roughly doubles the house faces: about 4.2 k faces and 17 k surface triangles, and an atlas of about 2048 x 1000. Draw calls grow with the number of finishes, not faces, so they stay well under 250. Triangles stay far under 1.5 M. GPU cost is per pixel, so it barely moves. Expect about 0.4 / 1.1 / 2.1 ms against the 3 / 4.5 / 6.9 ms budgets. Load stays under 2 s: the bake file is about 0.7 MB and decodes in tens of milliseconds.

**Builds.**

| Build | Map | Time | Size |
|---|---|---|---|
| Local `npm run build` (11 threads) | Survival Town | 20 s | 714 kB |
| | Practice Range | 14 s | 888 kB |
| Container build on the home server (`docker build`, 3 threads) | Survival Town | 40 s | 714 kB |
| | Practice Range | 33 s | 888 kB |

The container's build stage now runs on the build platform, so the arm64 image doesn't bake under emulation. The Pages workflow runs the same `npm run build -w @duty-shooter/range` on a 4-core runner, so expect about a minute of baking there.

**Playtester review** of the six house spots: no z-fighting, seams, floating or buried trim, or stretched patterns. It flagged two things:

- **The door head above the living room's front door rendered far too bright.** This was a real bug. Chrome and Node round `Math.hypot` differently in the last bit, so a few slanted car faces got a texel more in the browser than in the bake. Every rect after them in their atlas row then shifted, and those faces read another face's light. Lengths now use `Math.sqrt` with a tolerance on whole texel counts. The layout key now covers every rect, so a mismatch is refused instead of misdrawn. Both changes are covered by tests.
- **Sky above the stairs.** This is the stairwell opening, seen through to an upstairs window. It is correct.

**Known follow-ups for ticket 09.**

- Stepped gable bands show where a gable passes the roof end (the garage's east gable).
- The asphalt circle has a staircase edge from its 25 cm strips.
- Small wall pieces, such as the head over a door, can differ slightly in brightness from the wall beside them.
- Vehicles and the south house are still plain.

**Approval.** Taken under the owner's instruction for this run ("do not ask me anything"): self-approved as built, with the door-head fix above. Ticket 09 builds from this version, and the owner can still ask for changes.
