# Loop state

## Now

Loop pass 11 (2026-11-13) started `PLAN.md` item 6 (pass 1, rough; ticket 102, which takes over ticket 19's optic models): the Reflex and the Prism 2x are Blender models (`tools/weapon/optics.py`) on the rail of every gun that takes an optic, the irons fold away under them, and aiming lines up through them (`viewmodel/optics.ts`). Acceptance seen: viewer frames of all five guns x three sights at desktop and phone (`sights/after/sheet-*.jpg`), the dot within 3 px of centre; the M4A1 and Bulwark aimed in the Practice Range (`sights/after/range-sheet.jpg`). Gaps are in ticket 102. Next: item 6 pass 2 (the sniper's and the Vantage's scopes, a wider Prism view, a brighter dot), or item 5 pass 2's gaps; item 4 pass 2 if the laptop is back (it timed out again this pass).

## Needs Aleix

- The Fedora laptop on and on Tailscale (or at home on the LAN) for one benchmark run: item 4's acceptance is measured on it.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; optic models moved to 102, muzzle/grip models left), 102 scopes and sights (pass 1 shipped), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Review 2026-11-13a (the first by the five objectives) fails all five; its capture predates private lobbies, so objective 1 needs a new capture.
- CI: green through v2.191.1; check this pass's tag (v2.192.0).

## Broken

None known. Latent (ticket 101): `ProbeLightingModel.indirect` bakes `currentLighting().modelFill` into a shader at compile time; harmless while no map sets `modelFill`.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island in the capture is opt-in (`ISLAND=1`): the dev server's first build of the island's nav ran past 3 min here. Ask for `/nav/zero-island.nav` once before a capture to warm it.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
