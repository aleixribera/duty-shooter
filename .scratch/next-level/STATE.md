# Loop state

## Now

Loop pass 7 (2026-11-13) did PLAN item 4, runs on a toaster, pass 1 (ticket 99), on this PC as the stand-in: the Fedora laptop was offline (Tailscale last seen 13 h before). `toaster/bench.mjs` flies every map through the benchmark page uncapped at x4 CPU throttle: mean 34 (Zero Island) to 77 fps (range), 1% low 13 to 24. The x4 1% low is mostly the throttle's 15.6 ms timer ticks, and the GPU here is about 20 times an integrated one, so the item's verdict needs the laptop. Fixed: the dev `?bench` flight now runs the warm-up first (it counted shader builds no player meets). Next: item 4 pass 2 on the laptop when it is online; until then PLAN item 5, gameplay and the world, pass 1. The review of `reviews/2026-11-13a` is still unread.

## Needs Aleix

- The Fedora laptop on and on Tailscale (or at home on the LAN) for one benchmark run: item 4's acceptance is measured on it.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Captures from 2026-11-13a on are judged by the five objectives.
- CI: green through v2.189.0; check this pass's tag.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island in the capture is opt-in (`ISLAND=1`): the dev server's first build of the island's nav ran past 3 min here. Ask for `/nav/zero-island.nav` once before a capture to warm it.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
