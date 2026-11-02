# Last-match card says "DRAW" after a Battle Royale where every person went out

Status: resolved
Release: v2.108.7
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

## Comments

- Cause: `lastMatch()` (`packages/fps-client/src/ui/model.ts`) turned any null winner into "Draw". A Battle Royale ended by `noHumans` has no winner by design, so it read "DRAW".
- Fix: a Battle Royale with no winner gives your place instead: "37th of 60" (the HUD's "of N Squads" count), or "No winner" for someone who wasn't placed in it. It is never "Draw". The detail line keeps "Battle Royale · no players left".
- Where the place comes from: back in the lobby the bots have left the scores, so the count of Squads can't be read there (`scores` held only the person). `main.ts` keeps the placement from the match while it runs, as the HUD showed it, and clears it when the next match starts.
- Left a Battle Royale with a winner as "<names> won"; your own place there is the HUD's end screen's job.
- Before: `.scratch/battle-royale/t39/no-humans.mjs before`: "DRAW · Last match · Battle Royale · no players left" (own row `place: 37`). After: "57TH OF 60", then "39TH OF 60" on the final code (screenshot `.scratch/battle-royale/shots/bugs/t39/after-last-match.jpg`).
