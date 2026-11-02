# A 16-character name in "Other squads" pushes the phone page sideways

Status: resolved
Release: v2.108.15
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

## Comments
- Cause: `.controls` and `.squads` were grids with an implicit `auto` column, which grows to the full width of a name that can't wrap, so the row's ellipsis never kicked in. Fix: `grid-template-columns: minmax(0, 1fr)` on both.
- Seen at 390x844 with two 16-character names: `scrollWidth` 390 against 390 (before 542). In Duos the row reads "WWWWWWWWWWW…" with its Join button on screen. Desktop unchanged. Shots `shots/bugs/t49/before-phone-long-names-lobby.jpg`, `after-phone-long-names-lobby.jpg`, `after-duos-phone-long-names-lobby.jpg`, `after-desktop-long-names-lobby.jpg`.
- No DOM test: it's layout; checked by browser measurement.
