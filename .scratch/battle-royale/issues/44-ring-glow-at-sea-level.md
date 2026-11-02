# The Ring's foot glow sits at sea level

Status: resolved
Release: v2.108.14
Severity: S3
Found by: 35 (known leftover)

## Repro
Battle Royale, look at the Ring wall where it crosses high ground.

The bright foot band is at world y = 0 (sea level), so on hills it is buried and the wall meets the ground with no glow.

## Evidence
- `packages/fps-client/src/ring-wall.ts`: `FOOT = -30`, `HEIGHT = 420`; the glow is `exp(up.sub(FOOT + 30).max(0).div(-14))`, which is fixed at y = 0.
- Screenshot `.scratch/battle-royale/shots/bugs/10-host-in-match.jpg`.

## Suspected area
`ring-wall.ts`: drive the glow from the terrain height under the wall (a height per wall column, or the island's heightmap in the shader).

## Comments
- Fix in `ring-wall.ts`: the cylinder gets one float a vertex, `ground`, the surface under its column (the ground, or the water over it, never under sea level; off the island's rectangle, sea level). The shader's foot glow fades up from that instead of from y = 0. Still one mesh, one draw call, no texture; the 514 floats refill only when the Ring moves (`groundUnderRing`, 257 height lookups).
- Tests in `packages/fps-client/test/ring-wall.test.ts`: the column heights (hill, lake surface, sea level), and that the real `RingWall`'s own vertices carry the ground under where each stands, before and after the Ring moves; no terrain keeps it at sea level as before.
- Seen: explore mode on Zero Island with the real wall given a 400 m Ring round (4, 7) that crosses an 81 m hill (`.scratch/battle-royale/t37/t44-explore.mjs`). Before, the wall meets the hill with no glow; after, the bright band follows the hill's line. Shots `shots/bugs/t44/before-wall-near.jpg`, `after-wall-near.jpg`, and the `-along` and `-far` pairs.
