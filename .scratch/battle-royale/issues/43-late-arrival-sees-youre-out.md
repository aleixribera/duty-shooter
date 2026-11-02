# A late arrival's HUD says "You're out / Your Squad fights on"

Status: resolved
Release: v2.108.12
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

## Comments
- Fix: `RoyaleHudState` gains `seated` (the page has a seat in the match's scores; a late arrival has none). Out without a seat gets no out card, only the watch bar: "Watching <name> · Esc Menu · M Map".
- Regression test in `royale-hud-dom.test.ts`: a late arrival (`seated: false`) gets no `.ds-out`, and its watch bar says nothing of being out. A seat that is out still gets "You're out / Your Squad fights on" or its place.
- Seen live (server on 3241, 3 people + bots): the late page's out card is empty, watch bar "WATCHING WWWWWWWWWWWWWWWW ESC MENU M MAP". Shots `shots/bugs/t43/before-late-watching.jpg`, `after-late-watching.jpg`.
