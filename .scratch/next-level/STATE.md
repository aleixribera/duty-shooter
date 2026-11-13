# Loop state

## Now

Loop pass 20 (2026-11-13) took item 5's Switchyard streaky strip, pass 1 (ticket 100), and shipped it (v2.194.3): the open boxcars' door posts and corners wear plain steel instead of the body's corrugation and rust squeezed onto a 5 cm face (`yard-strip/sheet.jpg`). Pass 19 cut the Dustlands sandstone redraw (`strata/sandstone.patch`, pass 2 in BACKLOG). Next: item 5's other gaps (Switchyard's B and A markers overlapping at the screen's edge, 11-kill-2b; the Charge spawn facing a container, 23-a; Survival Town's spawn facing a mannequin, 22-a), item 4 when the laptop is back (it was unreachable on Tailscale at pass 20). Item 6 leftovers in ticket 102.

## Needs Aleix

- Overridable (pass 13): teammates' tags at the screen's edge now show only in Battle Royale; in the team modes a teammate off screen has no tag.
- The Fedora laptop on and on Tailscale (or at home on the LAN) for one benchmark run: item 4's acceptance is measured on it.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; optic models moved to 102, muzzle/grip models left), 102 scopes and sights (pass 1 shipped), 103 easy to understand (pass 1 shipped), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Reviews judge PLAN.md's five objectives (the ten-row scorecard is retired). Latest: 2026-11-13b (1, 2 pass; 3, 4, 5 fail).
- CI: v2.192.0's main run failed once on a soak flake (`switchyard-bots-gungame.soak.test.ts`: a bot stuck 28 s at -15.6,0.1,20.1 in gun game); the same commit's tag run passed. v2.193.0's and v2.193.1's runs passed. v2.193.2 to v2.194.1 passed.

## Broken

None known. Latent (ticket 101): `ProbeLightingModel.indirect` bakes `currentLighting().modelFill` into a shader at compile time; harmless while no map sets `modelFill`.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island's nav under the dev server: built in a worker (~70 s here) on the first ask and kept until a source changes; the capture asks for it after its match.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
