# The freight train doesn't play at the end of a match

Status: open
Blocked by: 30

Owner bug report: "The train animation doesn't play." Taken to mean Switchyard's end-of-match Freight train, since no other train moves.

Reading the code found no obvious break: `Game.#updateTrain` still takes the time from `sinceMatchEnd(driver.match, driver.serverTime)`, and `Train.update` shows the root and moves it. Suspects to check by running it, not by reading:
- `match` status after binary snapshots and sticky-state changes (tickets 01 and 02): phase and `phaseEnds` reaching the client at the end of a match, online and in Bot Match.
- The ending preparation from 1dcc3cd (`#showEnding` and its restore) leaving the train hidden or unloaded.
- The train's models loading, and the end-of-match camera in a mode or a lobby match.
- The other session's rendering work on Switchyard (6e961eb).

See it fail first: finish a real match on Switchyard, online and in Bot Match, record the train's `visible` and position each frame, and take screenshots. Then fix it and see the train cross, with its sounds. Add a regression test at the highest seam that catches it. Check Survival Town's nuke ending too, since it shares this timing.

## Comments
