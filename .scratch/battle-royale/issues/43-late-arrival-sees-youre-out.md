# A late arrival's HUD says "You're out / Your Squad fights on"

Status: open
Severity: S3
Found by: 35 (known leftover)

## Repro
1. Page A starts a Battle Royale.
2. Page B opens the Battle Royale screen after the match has started and watches.

Page B, who was never in the match, gets the out card: "You're out" and "Your Squad fights on".

## Evidence
- DOM on the late page: `ds-out=none:You're outYour Squad fights on`, and the card shows for its 6 s (`OUT_SHOWN_MS`).
- Screenshots `.scratch/battle-royale/shots/bugs/13-late-watching.jpg`, `.scratch/battle-royale/shots/bugs/15-late-watch-1s.jpg`.

## Suspected area
`packages/fps-client/src/hud/royale-hud.ts` ~239: the out text when out with no placement. A watcher with no seat should get a "Watching" line, not the out card.
