# Ping readout overlaps the Alive counter at 390 px in Battle Royale

Status: resolved
Release: v2.108.12
Severity: S3
Found by: 35

## Repro
Battle Royale online at 390 px wide; look at the top of the screen.

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/09-phone-in-match.jpg`.

## Suspected area
`packages/fps-client/src/hud/hud.ts` ~629 (the ping stat) against the Alive counter in `royale-hud.ts` (`.ds-br-top` is `min(640px, calc(100vw - 32px))` wide, line ~16).

## Comments
- Fix in `hud.ts` CSS: at 960 px and under, the ping/FPS box moves from the top-left (under the Battle Royale compass and the TDM match bar) to just over the health, `bottom: 118px; left: 16px`. Desktop keeps it top-left.
- Seen at 390x844 in a Battle Royale: `.ds-stats` 16..62 y706..726, clear of the compass (y18..66) and the health label (y742 on). Shots `shots/bugs/t45/before-phone-in-match.jpg`, `after-phone-in-match.jpg`.
- Edge markers on a narrow screen keep above it too (see 50).
