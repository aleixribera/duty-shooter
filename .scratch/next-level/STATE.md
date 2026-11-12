# Loop state

## Now

Loop pass 1 (2026-11-12, after the restart) found nothing parked (no `wip/` branches; the tree's changed and untracked files are other sessions' work and old frames) and ran review h (`reviews/2026-11-12h.md`). It filed tickets 90-94; the next pass takes 90, a wall not cardboard (the wall the review's run stood against reads as one flat brown sheet).

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Latest scores (review h, `reviews/2026-11-12h.md`): UI and UX up to 8 (g's three UI faults gone); the rest unchanged (picture 6, feel 6, sound 7, depth 7, content 7, performance 6, stability 7, identity 6, onboarding 7). Goal: all 9+. Its tickets: 90-94, open.
- CI: green through v2.187.43; check v2.187.44 on.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- The review's scripted player walks into walls and never kills, so game feel can't be judged from its frames (hit marker, kill confirm, score popup). Turning `capture.mjs` toward the nearest bot before the firing frame would show the kill loop.
