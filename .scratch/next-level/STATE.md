# Loop state

## Now

Loop pass 9 (2026-11-13) did PLAN item 5, gameplay and the world, pass 2 (ticket 100): the last minute reaches the world. From T-1:00 the sky darkens to rust, the haze to burnt orange, the sun dims and reddens and the cloud gathers, evenly with the clock, on top of the amber grade; it holds through the ending and scoreboard (`lastMinuteLighting`, `WorldView.setLastMinute`). Sky sample 172.9 at T-0:55 to 97.6 at T-0:03, red over green and blue (`last-sky/sheet.jpg`). The laptop was still offline. Next: check the Broken item below first; then item 5 pass 2's other gaps (Station Nine's early kills, the Switchyard spawn at (-49, 12)) or item 4 pass 2 if the laptop is back.

## Needs Aleix

- The Fedora laptop on and on Tailscale (or at home on the LAN) for one benchmark run: item 4's acceptance is measured on it.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Last scored review: h (`reviews/2026-11-12h.md`); the ten-row scorecard is retired by PLAN.md. Review 2026-11-13a (the first by the five objectives) fails all five; its capture predates private lobbies, so objective 1 needs a new capture.
- CI: green through v2.190.0; check this pass's tag (v2.191.0).

## Broken

- Unverified, from pass 9's review subagent: the spare Practice Range game (`main.ts:181`) builds its WorldView while the menu shows, and its constructor's `useLighting(LIGHTING)` relights the backdrop; when the spare later takes over (`main.ts:158`) after another map was built, its own light may not be put back, so the range could draw in Switchyard's or Zero Island's light. Reproduce (open the range after a Switchyard match) before fixing: reapply the view's light and sky field when its game goes on show.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island in the capture is opt-in (`ISLAND=1`): the dev server's first build of the island's nav ran past 3 min here. Ask for `/nav/zero-island.nav` once before a capture to warm it.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
