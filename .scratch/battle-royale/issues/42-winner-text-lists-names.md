# Squad win reads "Ada, Mate wins"

Status: open
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
