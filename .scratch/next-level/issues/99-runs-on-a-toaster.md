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

**2026-11-13, loop pass 31 (pass 2): the laptop's own numbers.** The laptop was up on Tailscale.

How it is measured, with nothing on the owner's screen and nothing downloaded: `toaster/laptop-bench.mjs` (copied to the laptop's `~/duty-bench.mjs`) drives Firefox 160, the laptop's only browser, over WebDriver BiDi with Node's own WebSocket. Headless Firefox has no GPU there (no WebGPU adapter, no WebGL 2), so Firefox runs as a normal window on a headless Mutter of its own: a virtual 1920x1080 monitor drawn on the Intel UHD Graphics (Raptor Lake), its own Wayland display and D-Bus session. `layout.frame_rate=0` unpaces its frames. `SHOTS=` saves frames; `PROBE=` runs one expression: `laptop-passes.js` (GPU per pass over a `?bench` flight), `laptop-split.js` (frame time A/B), `laptop-toggle.mjs <what>` (gpu-toggle.mjs's one-page A/B, plus `post:<variant>` with the temporary hook in `toaster/post-probe-hook.txt`). The probes need `duty.renderer`: a development-mode build (`NODE_ENV=development npx vite build --mode development --outDir <dir>`) copied over and served by `python3 -m http.server 8471 --bind 127.0.0.1`.

The benchmark page (GitHub Pages, v2.201.0, WebGPU, 1920x1080; `toaster/laptop/firefox-webgpu-1080p.json`), mean / 1% low in ms: Practice Range 34.9 / 109.5, Survival Town 38.4 / 53.6, Switchyard 36.9 / 58.1, Station Nine 37.2 / 58.1, Zero Island 44.4 / 57.8 (23 to 29 fps). GPU p50 13.7, 17.3, 16.8, 16.0, 21.7 ms. The acceptance (16.7 / 25 ms) fails on every map.

What the numbers say:
- **Pixels first.** Survival Town at 960x540: 18.4 ms mean, GPU 5.9. WebGL 2 at 1080p is worse (47.0 ms).
- **The frame is more than the GPU's passes.** 38 ms a frame against 17.5 ms in the passes and 7 to 11 ms of script per frame (development build). The rest is Firefox's WebGPU presenting; no Chrome on the laptop to tell them apart.
- **Separate runs can't be compared here.** The same flight gave 38, 35, 21 and 26 ms within an hour while the owner used the laptop. Only an A/B in one page counts.
- **GPU per pass**, Survival Town's cul-de-sac, 1080p (`toaster/laptop/post-parts.txt`): world 6.8 ms, the screen pass 2.6, TRAA 2.3, GTAO 2.1 (half resolution), light times occlusion 0.55, bloom 0.54 + about 0.9 of blur, sun shadow 0.45, the viewmodel's 4x pass 0.39. Post-processing is 9.0 of the 17.1 ms (`post:bare`). Inside the screen pass the heat shimmer took 0.89 ms, the sharpen 0.3; bloom in all 1.6.
- **Depth-first twins** hold on the integrated GPU: world pass 6.8 against 11.0 ms without.

Fixed: the heat shimmer branches (`pipeline.ts`): a pixel nearer than 150 m or sky reads the depth once and stops. 0.57 ms less at Survival Town's cul-de-sac and 0.59 at The Dustlands, A/B in one page (`toaster/laptop/shimmer-ab.txt`). The same picture: the old and new shimmer in one page differ less than two frames of the new one (`toaster/laptop/shimmer/diffs.jpg`); Chrome on this PC draws The Dustlands with it and no errors (`chrome-dustlands.jpg`). A reviewer subagent checked it is identical for every pixel (the edges at 150 m and the far plane) and valid WGSL and GLSL (the depth is read with `textureLoad`).

Found: Firefox's WebGPU frames on the laptop come out with red and blue swapped (blue sand, pink sky; WebGL right; `toaster/laptop/shimmer/webgpu-vs-webgl.jpg`). Firefox prefers `bgra8unorm`. A screenshot can't tell whether a real Firefox window shows it: Aleix is asked to look.

Cut (the second pass and the check still fails): no cruder stand-in exists under the one picture, so the GPU budget goes first in `BACKLOG.md` with the costs above and the levers.
