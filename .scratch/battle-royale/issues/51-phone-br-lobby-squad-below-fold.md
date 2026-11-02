# Phone Battle Royale lobby puts "Your Squad" below the fold

Status: resolved
Release: v2.108.15
Severity: S3
Found by: 35

## Repro
Open the Battle Royale screen at 390x844 and Join server.

The Play Online / Local bots blurb comes first; "Your Squad" and Start need a scroll.

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/05-phone-br-lobby.jpg`.

## Suspected area
The Battle Royale lobby view's phone layout: put the squad and Start above the explanation at narrow widths.

## Comments
- Fix: at 960 px and under, the screen's two columns dissolve (`display: contents`) and its sections reorder: where it stands (the connection line, or the name field before joining), Your Squad, Other Squads, the last match, the Squad size, Play on, then the island. Desktop keeps its two columns.
- Seen at 390x844: the state line at y121, Your Squad at y210, Other Squads at y356, all above the fold with the main button in the footer. Shots `shots/bugs/t51/before-phone-br-lobby.jpg`, `after-phone-br-lobby.jpg`.
- Known trade-off: on a phone the visual order differs from the DOM order, so Tab moves in the desktop order (as the island did before with `order: -1`). Pad and touch don't use Tab.
