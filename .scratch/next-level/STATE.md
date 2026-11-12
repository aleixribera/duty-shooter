# Loop state

## Now

Loop pass 2 (2026-11-13) shipped ticket 90 (v2.187.47): room corners darken into their creases and the indoor fill leans by facing, so a corner shows as two faces (frames `wall/sheet.jpg`). While it ran, the director set a new `PLAN.md` (five objectives; the scorecard is retired; tickets from review h are worked only if they are something broken a player meets, the rest closed as superseded). The next pass starts PLAN item 1, a review that sees what a player meets, and closes 91, 92 and 94 as superseded (93, the kill feed's faded plates, is a judgment call: unreadable names are close to broken).

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Its tickets: 90 resolved, 91-94 open (see Now).
- CI: green through v2.187.46; check v2.187.47 on.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- The review's scripted player walks into walls and never kills, so game feel can't be judged from its frames (hit marker, kill confirm, score popup). Turning `capture.mjs` toward the nearest bot before the firing frame would show the kill loop.
