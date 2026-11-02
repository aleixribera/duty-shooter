# Spectator bar says "Esc Leave" but Esc opens the pause menu

Status: open
Severity: S3
Found by: 35

## Repro
Battle Royale, get eliminated (or arrive late), and press Esc as the bar says.

The pause menu opens; nothing leaves.

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/14-late-after-esc.jpg`.

## Suspected area
`packages/fps-client/src/hud/royale-hud.ts` ~252 (the watch bar text). Either say "Esc Menu" or make Esc while watching leave.
