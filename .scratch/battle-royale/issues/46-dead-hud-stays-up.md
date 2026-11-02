# Health and ammo stay on screen after you are out in Battle Royale

Status: resolved
Release: v2.108.12
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

## Comments
- Decision: health and ammo hide whenever you are not in play, in every mode, not only Battle Royale. Waiting to respawn in TDM they showed 0 HP and a gun you don't hold either. Downed still shows them (the Downed pool), since a Downed seat is alive.
- Fix: `barsShown(self)` in `hud.ts` (alive, or Downed) drives both. Test in `packages/fps-client/test/hud-corners.test.ts`.
- Seen live: after a frag cooked in hand put the host out, `.ds-health` and `.ds-ammo` have no client rects while watching; the reload-and-watch path too. Shots `shots/bugs/t46/before-host-out-1920.jpg`, `after-host-out-1920.jpg`, `t48/after-host-rejoined.jpg`.
