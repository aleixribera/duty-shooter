# Ping readout overlaps the Alive counter at 390 px in Battle Royale

Status: open
Severity: S3
Found by: 35

## Repro
Battle Royale online at 390 px wide; look at the top of the screen.

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/09-phone-in-match.jpg`.

## Suspected area
`packages/fps-client/src/hud/hud.ts` ~629 (the ping stat) against the Alive counter in `royale-hud.ts` (`.ds-br-top` is `min(640px, calc(100vw - 32px))` wide, line ~16).
