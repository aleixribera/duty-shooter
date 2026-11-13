# Runs on a toaster

Status: open

Spec: `../spec.md`

`PLAN.md` item 4 (objective 2; continues ticket 35, the one picture fast on weak PCs). The one picture at 60 fps on integrated graphics. Reference toaster: the Fedora laptop's integrated GPU (`ssh uni-laptop`, headless); this PC's throttled runs stand in while it is away.

Acceptance: `?benchmark` on every map on the laptop: mean 60 fps or better at the screen's own resolution, 1% low 40 or better; Zero Island included.

## Comments

**2026-11-13, loop pass 7 (pass 1, rough).** The laptop was offline all pass (Tailscale: last seen 13 h before; `uni-laptop` and `fedora-lan` both timed out), so this PC stood in.

The stand-in. `toaster/bench.mjs <label> [rate] [maps]` opens the benchmark page a player runs (`?benchmark&run&maps=<map>`, warm-up and all), one map per fresh page, uncapped at 1920x1080, and slows the page's processor `rate` times once the flight starts; it writes `toaster/<label>.json` (mean, 1% low, p50, GPU p50, draws, load time per map). The old `one-picture/potato.mjs` ran under the scripted browser's 30 fps cap, so it could not read a frame under 33 ms; this one cannot.

Every map at x4, benchmark page (`toaster/before-page.json`), mean / 1% low in fps: Survival Town 46 / 20, Switchyard 54 / 22, Station Nine 47 / 23, Practice Range 77 / 24, Zero Island 34 / 13. GPU p50 1.0 to 1.7 ms everywhere (an RTX 5060).

What the stand-in can and cannot say:
- **The 1% low at x4 is mostly the throttle.** Zero Island's long frames at x4 (`bench-builds.mjs`, no shader built in the flight) land at 62, 78 and 94 ms: whole multiples of Windows' 15.6 ms timer tick, which is how Chrome's CPU throttle parks the page. Unthrottled, Station Nine's flight is 2.7 ms mean and 7.9 ms 1% low. The 1% low on this stand-in is not evidence either way; only the laptop can judge it.
- **The mean is three's work per object.** A profile of Survival Town's flight uncapped at x4 (`toaster/profile.mjs`) has 73% of the main thread in three's render (the world and weapon passes 47%, the shadow 12%, bindings and uniforms most of it), and the game's own code under 2%. Per object drawn, about 17 µs unthrottled on Zero Island (139 objects a frame over both scene passes, `toaster/passes.mjs`). The shadow map's objects cost 0.1 to 0.2 ms a frame unthrottled: not the lever.
- **The GPU is the unknown.** This PC's GPU draws a 1080p frame in 1.0 to 1.7 ms. An integrated GPU is roughly 15 to 25 times slower, which would put it near or past 16.7 ms on its own. Nothing here can stand in for that; the laptop has to measure it.
- **The Practice Range's 4.8 s stall** in capture 2026-11-13a did not come back: walking in through the menu (`toaster/range-stall.mjs`) builds all 87 of its shaders before play starts and none after; the stall was the capture measuring the end of the range's load (about 7 s here before play, with two 1.2 to 1.5 s freezes on the loading screen) on a busy PC at idle priority. An early range x4 reading of 27 ms mean was this PC's other load: two later runs gave 12 and 13 ms.

Fixed: `?bench` (the dev flight `potato.mjs`, `profile.mjs`, `gpu.mjs` and others use) flew before the game's warm-up, so it built shaders mid-flight and counted hitches no player meets. It now waits for `game.prepare()`, as the benchmark page and play do. Dev flight at x4, before and after: Practice Range 4 builds (a 127 ms one mid-flight), 1% low 52.9 ms, then 3 builds of 2 to 6 ms (the shadow's depth material), 1% low 31.8 ms; Zero Island 37.8 / 132.5 ms mean / 1% low, then 28.3 / 57.9 (`DEV=1 toaster/bench-builds.mjs range,zero-island 4`). Shipped in v2.189.1.

Next pass of this item: the laptop's own numbers (`toaster/bench.mjs` pointed at it, or the benchmark page opened on it), then work on whichever side fails there. The processor-side lever is fewer objects per pass (ticket 35, phase 2f: near ground chunks); the GPU side, if it fails, starts from `one-picture/gpu.mjs` per pass at the laptop's resolution.
