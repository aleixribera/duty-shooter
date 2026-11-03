# After a Battle Royale's Preparation, the loadout screen says a change applies from your next spawn

Status: resolved
Release: v2.114.4
Severity: S3
Found by: 35 (pass 2, coordinator review)

## Repro
In a Battle Royale after the drop, Esc, Loadout. The chip says "Applies from your next spawn." (`apps/range/src/main.ts` set it once per session). There is no next spawn in a Battle Royale, and the server dropped any pick made after the Preparation, so it didn't apply to the next match either.

## Comments
- Fix, server: a pick after the Preparation is kept (not equipped) and the next match's spawn carries it. Client: `loadoutNote` in `packages/fps-client/src/ui/model.ts` says when a change applies, updated every frame from the match: "Applies at once." offline, "Applies from your next spawn." in modes with respawns, and in a Battle Royale "Applies when you drop." in the lobby and the Preparation, then "Locked for this match. Applies from the next one."
- Seen in the browser: the lobby's loadout screen says "Applies when you drop."; after the drop, Esc, Loadout says "Locked for this match. Applies from the next one.", fitting the chip at 1600x900. `shots/bugs/t59/after-prep-loadout.jpg`.
- Tests: `packages/fps-core/test/battle-royale.test.ts` (a pick after the hold is kept for the next match) and `packages/fps-client/test/ui-model.test.ts`.
