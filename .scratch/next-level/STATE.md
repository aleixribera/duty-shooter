# Loop state

## Now

Loop pass 3 (2026-11-13) shipped PLAN item 0, ticket 95 (v2.187.48): bots ping only in Battle Royale; Bot Match and Play Online show no bot "Enemy spotted" or marks (frames `bot-pings/before|after/`). Tickets 91-94 from review h set to wontfix as superseded by PLAN.md (93 too: its faint plates are the fade caught mid-frame). Next: PLAN item 1, a review that sees what a player meets (rebuild `reviews/capture.mjs`), pass 1.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Its tickets: 90 resolved, 91-94 wontfix (superseded by PLAN.md).
- CI: green through v2.187.46; check v2.187.47 and v2.187.48.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- The review's scripted player walks into walls and never kills, so game feel can't be judged from its frames (hit marker, kill confirm, score popup). Turning `capture.mjs` toward the nearest bot before the firing frame would show the kill loop.
