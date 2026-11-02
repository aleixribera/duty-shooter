# Last-match card says "DRAW" after a Battle Royale where every person went out

Status: open
Severity: S2 (wrong rules shown: the spec places the squads, there is no draw)
Found by: 35

## Repro
1. Battle Royale, one person with bots, start, and get eliminated so no person is alive.
2. The match ends with result `noHumans` (by spec).
3. Back on the Battle Royale screen, read the last-match card.

It shows "DRAW · Last match · Battle Royale · no players left".

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/11-host-after-noHumans.jpg`.

## Suspected area
`packages/fps-client/src/ui/model.ts` `lastMatchLine` (~258-262): a null winner always becomes "Draw". A Battle Royale ended by `noHumans` should show the person's placement, not a draw. `packages/fps-core/src/modes/battle-royale.ts` `result()` (~185-210) decides the winner.
