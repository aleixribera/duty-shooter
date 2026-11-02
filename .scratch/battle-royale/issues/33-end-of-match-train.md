# The freight train doesn't play at the end of a match

Status: resolved
Release: v2.105.1
Blocked by: 30

Owner bug report: "The train animation doesn't play." Taken to mean Switchyard's end-of-match Freight train, since no other train moves.

Reading the code found no obvious break: `Game.#updateTrain` still takes the time from `sinceMatchEnd(driver.match, driver.serverTime)`, and `Train.update` shows the root and moves it. Suspects to check by running it, not by reading:
- `match` status after binary snapshots and sticky-state changes (tickets 01 and 02): phase and `phaseEnds` reaching the client at the end of a match, online and in Bot Match.
- The ending preparation from 1dcc3cd (`#showEnding` and its restore) leaving the train hidden or unloaded.
- The train's models loading, and the end-of-match camera in a mode or a lobby match.
- The other session's rendering work on Switchyard (6e961eb).

See it fail first: finish a real match on Switchyard, online and in Bot Match, record the train's `visible` and position each frame, and take screenshots. Then fix it and see the train cross, with its sounds. Add a regression test at the highest seam that catches it. Check Survival Town's nuke ending too, since it shares this timing.

## Comments

- **What fails.** The train does play, everywhere: Bot Match and online (lobby server), in the dev page, on WebGPU. Recorded every frame from the match's end to the lobby (`.scratch/battle-royale/train/train-probe.mjs`, which finds the train in the rendered scene): it is shown from the first frame of the ending, runs x 132 -> -284 over the 6 s ending and the 10 s scoreboard, has both its models and lamps (2 children), hides in the lobby, and its horn (2), rumble (10) and clacks (39-46) are all cued. The match status reaches the client fine (`nuke`, then `vote` with `lobby`, then `lobby`), so none of the ticket's suspects (snapshots, `#showEnding`, model loading, 6e961eb) holds. What the player never gets is a view of it: input is frozen through the intermission, the camera stays wherever the player stood, and the main line runs outside the yard's north barrier. With the train placed in each frame's recorded camera and tested against the map's solids (`seen.check.ts`), the before runs saw it in **0 of 1,115 (Bot Match) and 0 of 1,213 (online) frames of the 6 s ending**, the part with the locos, lamps and horn; only the trailing wagons crossed a corner of the view later, from a spawn next to the barrier, half under the scoreboard (`before.jpg`: the player stands beside the line and still sees only empty track). Survival Town never had this, because its ending is an Ending shot.
- **The fix.** Switchyard's ending is an Ending shot too, like Survival Town's: `FreightTrain.shot` (required, so a map with a train can't leave it out) and the Game takes the nuke's or the train's shot. The shot stands in the long lane over the barrier, looks up the line at the train coming in from the east with its lamps lit, swings west as it roars past, drifts back and up, and holds on the wagons through the scoreboard (`after.jpg`). The listener rides the shot, so the horn, roar and clacks are heard from beside the line. `shotPose` moved to `surfaces/ending.ts` (Node-safe) so map tests can use it; `camera.ts` re-exports it.
- **After.** The same probe, same matches: the train in sight in **1,744 of 1,744 and 2,899 of 2,899 frames (Bot Match), 1,737 of 1,737 and 3,603 of 3,603 (online)**, ending and scoreboard; all train sounds still cued. Survival Town's nuke checked in Bot Match: its shot, cloud and siren and blast as before.
- **Regression test** (`apps/range/test/switchyard.test.ts`, "the ending shot keeps the freight train in frame and in sight..."): the train must have a shot whose camera, every 0.25 s from the horn through the longest intermission, has at least one car whole in a 4:3 frame and unblocked by the map's solids. It failed before the fix (no shot) and caught two first tries of the shot (hidden by the east wall at the start; too close in the middle). `FreightTrain.shot` being required makes the typecheck catch a map with a train and no shot.
- **Side finding, not this bug:** a controller plugged into this PC reaches headless Chrome, which opened the pause menu in one Bot Match run and froze the ending (a Bot Match pauses with the game). The probe hides gamepads (`navigator.getGamepads = () => []`). Worth knowing for every scripted run here.

