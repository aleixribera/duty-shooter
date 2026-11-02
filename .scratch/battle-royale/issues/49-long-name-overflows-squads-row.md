# A 16-character name in "Other squads" pushes the phone page sideways

Status: open
Severity: S3
Found by: 35

## Repro
1. Two or more pages in a Battle Royale lobby with 16-character names (`MAX_NAME`), e.g. `WWWWWWWWWWWWWWWW`.
2. View the lobby at 390 px.

The "Other squads" row doesn't truncate, and the page scrolls sideways.

## Evidence
- `document.body.scrollWidth` 542 against a 390 px viewport; with short names it is 390.
- Screenshots `.scratch/battle-royale/shots/bugs/27-phone-long-names-lobby.jpg`, `.scratch/battle-royale/shots/bugs/28-desktop-long-names-lobby.jpg`.

## Suspected area
The Battle Royale lobby view's squads row CSS (`min-width: 0` and `text-overflow: ellipsis` on the names).
