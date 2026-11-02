# The Ring's foot glow sits at sea level

Status: open
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
