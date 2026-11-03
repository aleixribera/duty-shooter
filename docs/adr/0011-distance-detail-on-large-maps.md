# 0011 Distance detail on large maps

Status: accepted (2026-11-03, Battle Royale spec "Client rendering", ticket 10). Builds on 0006 (interest-managed snapshots) and 0007 (terrain heightfield).

## Context

Zero Island is about 2.3 by 2.1 km, with 60 soldiers on it and 9,000 cover solids. As drawn before this decision, every soldier in the snapshot was fully skinned, posed with two-bone IK every frame and cast a shadow. Every 64 m ground chunk was its own draw call. The island's surfaces were merged per finish into eight island-wide meshes. Because those meshes are as big as the island, nothing in them was ever culled, and all of them were drawn into the sun's shadow map as well.

Measured headless on this PC (Chrome, production build, 1920 x 1080, Local bots, same seeds): the Preparation's view of the whole island cost 372 to 400 draw calls. Play cost 150 to 290. The main thread spent 2.5 to 3.7 ms a frame, nearly all of it in the renderer's per-draw work. The target is an integrated-graphics laptop.

## Decision

- **Soldier levels, aligned with the snapshot tiers.**
  - **Full, out to 60 m** (`WIDE_MAP`'s near, where the server sends a seat every snapshot): drawn as before.
  - **Cheap animated, out to 150 m:** the same skinned soldier, posed every third frame (taking turns, so a third of them pose each frame) but placed every frame, with no shadow.
  - **Far stand-in, past 150 m:** a box per body piece of the real model, posed once per stance (stand, crouch, prone). Every far soldier of a look and stance is drawn by one `InstancedMesh`.
  - **Switching:** a soldier changes level 6 m past a line, so one standing on it doesn't flicker. A scope divides the distance by its magnification. Nameplates were already near-only (ally names to 40 m, ticket 52).
- **Far ground in blocks.** A block of 4 x 4 chunks whose chunks are all at step 4 or coarser (about 220 m and farther) is drawn as one mesh merged from them. It has the same triangles and is rebuilt only when a member chunk's step changes.
- **Surfaces in blocks on a map with terrain.** Faces are grouped into 512 m blocks by the middle of their solid, so a solid is never split between levels. Each block has a near set and a far set of meshes, one per finish. The far set keeps only solids at least 6 m across. A block switches at 400 m from its nearest point, with a 12 m hold. Out-of-view blocks are culled, and only the blocks within the shadow map's reach are drawn into it. Smaller maps keep their per-finish meshes: they are small enough to draw whole.
- **`?lod=off` and `?seed=`.** The first draws a large map without any of the above; the second fixes a Local bots match's spawns. Together they measure what this decision saves on the same match.

Rejected:
- Billboard imposters for far soldiers. They need a picture atlas per look and stance, and they light flat. At 150 m and more a soldier is a few pixels tall, and boxes cut from the real model are lit and coloured like it, in one draw.
- Far soldiers as the full skinned model at a lower pose rate. That still costs a draw call, a skeleton upload and 4,000 triangles per soldier.
- Snapshot decoding in a worker. Profiled, it is 0.1 % of the main thread's time.
- Streaming the island's art in chunks. The island is built from code in the page, and everything it downloads before a match is 13.5 MB compressed (19.3 MB with Local bots' nav), so there is nothing to stream yet. Ticket 16's Region art should load per block, on the same blocks.

## Consequences

- Same seeds, `?lod=off` against on: the Preparation's draw calls went from 372 to 400 down to 116 to 128, and play from 150 to 194 down to 97 to 121. Frame time went from 2.58 to 3.20 ms down to 2.21 to 2.39 ms, and main-thread time from 2.54 to 3.17 ms down to 2.18 to 2.35 ms a frame. The renderer's live geometries went from about 680 down to about 530. The JS heap is unchanged at 32 MB after a collection.
- A soldier at mid range moves its limbs at about 20 Hz, and a far one doesn't move its limbs at all. A far soldier who dies just disappears: there is no ragdoll that far out.
- The lighting bake isn't per chunk yet. The island's surfaces alone are 24.5 M texels in a 2048 x 17492 atlas, which is past any GPU's texture limit, and they would take about 72 CPU-minutes to bake. That work is ticket 55.
