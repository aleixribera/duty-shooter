# Squad win reads "Ada, Mate wins"

Status: resolved
Release: v2.108.13
Severity: S3
Found by: 35 (known leftover)

## Repro
Win a Battle Royale as a Duo or Trio (or watch one end with a squad left).

The toast reads "Ada, Mate wins the match.", the end screen "Ada, Mate wins", and the last-match card "Ada, Mate won".

## Evidence
- `packages/fps-core/src/modes/battle-royale.ts:183` sets `winnerName: names.join(', ')`.
- Shown by `packages/fps-client/src/game.ts:1278`, `packages/fps-client/src/hud/hud.ts:849` and `packages/fps-client/src/ui/model.ts:262`.

## Suspected area
Those four lines. Name the squad ("Ada's Squad wins", or "Ada and Mate win"), with the grammar picked by squad size, per the glossary.

## Comments
- Decision: name the Squad's people as a line reads them and make the verb agree: "Ada wins", "Ada and Mate win", "Ada, Mate and Joan win". Names rather than "Ada's Squad", because the end screen is where you learn who beat you.
- Fix: `BattleRoyale#won` uses `nameList(names)` and sets a new optional `MatchResult.winners` (the count, only when over one). An older page ignores it and reads "Ada and Mate wins"; the codec carries unknown keys spelled out (round trip tested). Client: `winVerb(result)` in `ui/model.ts`, used by the end screen's headline (`EndSummary.headline.verb`) and the matchEnd toast. The lobby's last-match card says "won", which needs no agreement.
- Tests: `battle-royale.test.ts` (a Duo's win reads "nX and nY", `winners: 2`, survives the codec; `nameList`), `royale-hud.test.ts` and `ui-model.test.ts` (verb).
- Seen: a Squad win can't be forced live, so `.scratch/battle-royale/t37/t42-end.mjs` gives the real page (explore mode on Zero Island) a finished Battle Royale and the game's own matchEnd event. Before (the old result, "Ada, Mate"): "ADA, MATE WINS" and "Ada, Mate wins the match." After: "ADA AND MATE WIN" and "Ada and Mate win the match.", at 1920 and 390. Shots `shots/bugs/t42/before-end-1920.jpg`, `after-end-1920.jpg`, `after-end-phone.jpg`.
