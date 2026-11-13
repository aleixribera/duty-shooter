# Loop state

## Now

Loop pass 5 (2026-11-13) shipped PLAN item 2 rough, ticket 97 (v2.188.0): private lobbies. "New private lobby" in Play Online gives a `?lobby=CODE` link; the host moves people between sides, evens them and kicks; a dropped player gets their lobby seat back (`apps/server/test/private-lobby.test.ts`, frames `lobbies/after/`). Left for a second pass in `BACKLOG.md`. Next: PLAN item 3, online at real ping, pass 1. The review of `reviews/2026-11-13a` is still unread.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Captures from 2026-11-13a on are judged by the five objectives.
- CI: green through v2.187.49; check v2.188.0.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island in the capture is opt-in (`ISLAND=1`): the dev server's first build of the island's nav ran past 3 min here. Ask for `/nav/zero-island.nav` once before a capture to warm it.
- The capture's Practice Range part showed a 4.8 s main-thread stall a few seconds in (`2026-11-13a/summary.json`, `range`): worth a look under item 4.
