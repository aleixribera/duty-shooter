# Streaming, LOD and soldier levels

Status: resolved
Release: v2.114.0
Blocked by: 05

Spec: `../spec.md`

Spec: Client rendering. Chunked terrain and models with distance LOD, per-chunk bake, imposters for far Regions, three soldier levels, nameplates near only, snapshot decoding off the main thread if needed. Download budget measured.

## Comments

- Shape (ADR 0011, glossary "Distance detail", "Soldier level"):
  - **Soldier levels** (`players-view.ts`, `SOLDIER_LEVELS`), set by the distance from the camera divided by a scope's magnification, with a 6 m margin at each line:
    - Full out to 60 m (the server's every-snapshot range).
    - Cheap animated out to 150 m: the same skinned soldier, posed every third frame and placed every frame, with no shadow.
    - Past 150 m, a far stand-in: a box per body piece of the real model, posed per stance. Every far soldier of a look and stance is one `InstancedMesh` draw.
  - **Far ground in blocks** (`terrain-view.ts`, `TERRAIN_BLOCK`): 4 x 4 chunks merged into one mesh once all of them are at step 4 or coarser, with the same triangles.
  - **Surfaces in 512 m blocks on a terrain map** (`surface-blocks.ts`): culled per block, so only nearby blocks go into the shadow map. Past 400 m a block keeps only solids 6 m and up.
  - **Nameplates** were already near only: ally names out to 40 m (ticket 52).
- Measured on the same match, `?seed=7` and `?seed=11` with `?lod=off` against on (headless Chrome on this PC, production build, 1920x1080, Local bots Solos, 30 s of play):

  | | Off | On |
  | --- | --- | --- |
  | Frame time (mean) | 2.58 / 3.20 ms | 2.21 / 2.39 ms |
  | Frame time (p99) | 4.2 / 4.8 ms | 3.9 / 4.1 ms |
  | Main thread per frame | 2.54 / 3.17 ms | 2.18 / 2.35 ms |
  | Draw calls in play | 150 / 194 | 97 / 121 |
  | Triangles in play | 373k / 515k | 324k / 402k |
  | Draw calls, Preparation over the whole island | 379 / 372 | 116 / 128 |
  | Triangles, Preparation | 307k / 312k | 217k / 239k |
  | Live renderer geometries | 677 / 684 | 530 / 533 |
  | JS heap after a collection | 32 MB | 32 MB |

  Against the build before the change, the first baseline run had 186 draw calls in play, 396 in the Preparation and 3.47 ms on the main thread.
- Download, measured from what the page fetched before the Local bots match could start: 19.3 MB gzip (40.9 MB raw), including the island's nav at 5.8 MB. Online, that is about 13.5 MB. The whole build is 24.2 MB gzip (53.4 MB raw). Both are well under the 40 MB and 150 MB targets, and the server sends brotli, which is smaller still. The island is built in the page from code, so there is nothing of it to stream yet. Ticket 16's Region art should load per surface block.
- Snapshot decoding stays on the main thread: profiled with 59 bots, `decodeSnapshot` is 0.1 % of it. The renderer's per-draw work was most of the cost, which is what this ticket cut.
- Per-chunk bake: split out as ticket 55, with the numbers behind it.
  - The island's surfaces are 24.5 M lightmap texels: one 2048 x 17492 atlas, past GPU texture limits.
  - That's about 72 CPU-minutes of baking.
  - The result would be about 40 MB, so it has to be committed and streamed per block, and it outgrows the normal build, as the spec foresaw.
- Seen in the game:
  - Shots in `.scratch/battle-royale/shots/local-bots/`. `lod2-s1-03-preparation-1s` is the island from above, drawn in blocks. `far-03-preparation` uses `?soldiers=far`, which puts the stand-in up close.
  - Full Local bots match `final-s1` (seed 7), with every check passing: Preparation with 60 alive, the worker at 60 ticks a second, the end back on the lobby with your place, and no page errors.
- New URL parameters, in the README:
  - `?stats` puts draw calls, triangles and live geometries and textures on `document.body.dataset.render`.
  - `?lod=off` turns the distance detail off.
  - `?seed=<n>` fixes a Local bots match's spawns and circles.
  - `?soldiers=near|mid|far` forces one level for every soldier.
- Tests:
  - `soldier-levels.test.ts` (8): the levels, pose rate, shadows, instancing, hysteresis, scope and shader warm-up.
  - `terrain-view.test.ts` (3) and `surface-blocks.test.ts` (3).
  - Suites: core and client 1063 passed (2 skipped); range 351 passed (12 skipped); server 53 passed; typecheck clean.
- Integrated graphics are still unmeasured on real hardware (ticket 27).
