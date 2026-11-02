# Health and ammo stay on screen after you are out in Battle Royale

Status: open
Severity: S3
Found by: 35

## Repro
1. Battle Royale, get eliminated (or reload after being eliminated and rejoin to watch).
2. Look at the bottom of the screen while spectating and on the end screen.

Health 0 and the M4A1 ammo stay up.

## Evidence
- Screenshots `.scratch/battle-royale/shots/bugs/17-host-rejoin-dead.jpg`, `.scratch/battle-royale/shots/bugs/24-host-dead-spectating.jpg`.

## Suspected area
`packages/fps-client/src/hud/hud.ts` ~604 and ~611 show health and ammo whenever `self` exists, without checking it is alive.
