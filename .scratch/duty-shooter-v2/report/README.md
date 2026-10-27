# Duty Shooter v2: release report

v2.0.0 closes the arc in `../spec.md`: the Switchyard map (layout, Blender art, the freight train and yard audio), Outposts and Charge, humans vs bots, the host's lobby with its vote, and offline Bot Match on either map.

## Browser runs

`npm run bot-runs` (`apps/range/scripts/bot-runs.mjs`): a 90 s Bot Match in headless Chrome on the dev server, one per row, checking for frame stalls (over 250 ms), console errors and kills. A full match of every mode runs headless in the suite's bot soaks (`apps/range/test/*-bots-*.test.ts`). The browser runs check the page around them.

| Map | Mode | Stalls | Console errors | Kills | Notes |
| --- | --- | --- | --- | --- | --- |
| Survival Town | TDM | 0 | 0 | 12 | |
| Survival Town | FFA | 0 | 0 | 26 | |
| Survival Town | Outposts | 0 | 0 | 14 | |
| Survival Town | Charge | 0 | 0 | 1 | The first try failed to start because the page reloaded from an edit made during the run. It passed on the rerun. |
| Switchyard | TDM | 0 | 0 | 16 | |
| Switchyard | FFA | 0 | 0 | 18 | |
| Switchyard | Outposts | 0 | 0 | 15 | |
| Switchyard | Charge | 0 | 0 | 4 | Rerun after the overlay fix below. |
| Survival Town | Outposts, humans vs bots | 0 | 0 | 0 | The bots took the zones and won; the match ended at the nuke. |
| Switchyard | Charge, humans vs bots | 0 | 0 | 1 | The player moved (`MOVE=1`). |
| Switchyard | TDM, humans vs bots | 0 | 0 | 3 | The player moved (`MOVE=1`). |

The runs found one bug. The Practice Range's time-to-kill panel showed on Switchyard, because Switchyard's west end lies in the range's lane coordinates. It was fixed in v1.14.0: a map now declares `rangeLanesWestOf`, and only the range sets it.

Screenshots: `survival-town-tdm.jpg`, `survival-town-outposts.jpg`, `survival-town-charge.jpg`, `switchyard-ffa.jpg`, `switchyard-charge.jpg`, `switchyard-tdm-hvb.jpg`. Video: `switchyard-tdm.mp4`, 30 s of Switchyard TDM, made with `npm run record`. Models: `switchyard-models.jpg`, an EEVEE sheet of the 11 Blender models.

## Performance (ticket 17)

The benchmark ran in headless Chrome at 1920×1080 with vsync off. Frame times are p50 / p95 / p99 in ms.

| Map | Low | Normal | High |
| --- | --- | --- | --- |
| Survival Town | 2.5 / 4.0 / 5.5 | 4.7 / 11.4 / 31.2 | 6.1 / 10.4 / 16.5 |
| Switchyard | 1.4 / 3.4 / 7.0 | 3.2 / 5.6 / 9.1 | 4.3 / 7.3 / 11.0 |

- Server CPU: 12 seats on either map cost 0.96–1.92 ms a tick.
- Load test: 12 clients at 60 Hz used 28–45 % of a core and about 110 MB, and every client received 2,394–2,400 of 2,400 snapshots.

## Code review

The review covered two axes: standards and the spec.

Fixed in v1.12.3:
- A lobby's shorter scoreboard made the train or nuke clock jump.
- Humans vs bots was untested for lobbies of 1–12 people and for a lobby that empties.
- The lobby's wording for humans vs bots.
- The `LobbyPick` type and `asMapId` were introduced, and a doc comment was moved.

Recorded in ADR 0005:
- A player on a loading page stands at their spawn. Fixing that needs a server "ready" message, which means a protocol bump, so it is left for later.
- Bots stay capped at 6 a side.

## Tests

`npm run check`: 791 tests pass and 8 are skipped (the benchmarks, without `BENCH=1`). Typecheck is clean.
