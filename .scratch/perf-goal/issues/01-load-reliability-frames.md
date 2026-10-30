# Load times, online reliability and frame pacing

Status: resolved
Release: v2.85.0, v2.86.0, v2.87.0, v2.88.0

## What was asked

Every screen and button loading at least 10x faster, online 10x more reliable,
10x better performance with the graphics kept, no micro-stutter, instant UI.

## Results

Measured with `apps/range/scripts/perf.mjs` and `chaos.mjs` on the production
build, this PC (RTX 5060), headless Chrome, while other sessions ran. v2.84 is
`baseline.json`.

| Measure | v2.84 | Now | Factor |
| --- | --- | --- | --- |
| Return visit to menu | 1431 ms | 122 ms | 11.7x |
| First visit to menu (50 Mbit, 40 ms) | 1163 ms | 313 ms | 3.7x |
| Bot Match, Start to play, default map | 5035 ms | 88-101 ms | 50x |
| Bot Match on Crash, 8 s in the lobby | not measured | 157 ms | |
| Bot Match on Crash, Start straight after picking | not measured | 5168 ms | |
| Practice Range | 6937 ms | 1502 ms | 4.6x |
| Frames: fps | 361 | 385 | 1.07x |
| Frames: p99 | 7.2 ms | 6.4 ms | 1.1x |
| Frames: p99.9 | 18.5 ms | 9.7 ms | 1.9x |
| Frames: worst | 94.5 ms | 26.1 ms | 3.6x |
| Frames: over 33 ms, 45 s | 7 | 0 | |
| Long tasks in play, 45 s | 3 (worst 106 ms) | 0 | |
| Link cuts and stalls survived | 0 of 12 (each ended the session) | 12 of 12 | |

## Targets not reached

- First visit is 3.7x, not 10x. 304 ms of it is first paint on a 40 ms link, the
  same as before; 116 ms is below what the round trips allow.
- Practice Range is 4.6x. It is a map change with no lobby to prepare behind: new
  materials rebuild their shaders on the main thread and every model is parsed
  again for the new Game.
- Frame rate is 1.07x. A frame was already 2.5 ms; the gain is in the worst
  frames, not the average.
- For about the first 1.3 s of a page (2 s on a first visit) the menu is up while
  the engine's first frame builds shaders: a click then can wait 350 ms on a
  return visit, about 1.1 s on a first one. Those are the only long tasks left.
- A map's first frame on Crash takes 2 s of main thread, so a Start pressed
  before the lobby's preparation ends waits for it (5.2 s at worst).
- Crash showed one isolated stall per run (136 ms, 231 ms), with no long task and
  no slow JavaScript frame in the profile, so outside the page's own thread;
  survival-town showed none in 45 s. Cause not found.
- WebGL2 was only checked to work: a Practice Range entry took about 36 s
  headless, unmeasured against v2.84.

## Comments

- Reconnecting: the client rejoins with its seat token, backing off, for up to
  two minutes; the server skips snapshots to a congested socket rather than
  buffering them.
- Sounds render in a worker. They were the worst hitch in a match, up to 100 ms.
- Pipelines always compile asynchronously and a frame skips what is not ready, so
  no frame waits on a shader. `Game.prepare` still waits for them, so nothing is
  missing when play starts. Screenshots on WebGPU and WebGL2 came out whole.
- The menus load apart from three.js. `@duty-shooter/fps-client/ui` must stay
  free of it. Page start moved to the end of `main.ts`: clicks can now land
  while `startGame` runs, before constants below it were set.
- A click before the engine is up shows the loading screen and runs once the
  first game exists, not merely once the engine module has loaded.
- Bot routes come from a worker, started when the page goes idle and on each map
  pick. A worker failure falls back to building them in the match.
- The lobby swaps to the picked map 350 ms after the picks settle, as the online
  lobby already did. That moves the wait from Start to behind the lobby: on Crash
  the page is busy for about 2 s after a pick. Chosen because a player spends
  seconds in the lobby and the Start press is what they feel.
- A map swap keeps the old game until the new one is ready, so shaders both use
  are not freed and rebuilt.
- Sharing parsed models between Games was rejected: six consumers mutate and
  dispose what they load, so it risks hitches and broken models for an estimated
  500 ms on Practice Range. Slicing the first frame was rejected too: the warm-up relies
  on drawing everything in one frame, and it would show behind the menu.
- Screen fades (120 ms) are gone: content had painted and then faded in. Hover
  and press feedback stay.
