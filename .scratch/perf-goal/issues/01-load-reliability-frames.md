# Load times, online reliability and frame pacing

Status: resolved
Release: v2.85.0, v2.86.0, v2.87.0, v2.88.0, v2.89.0, v2.89.1, v2.89.2, v2.89.3, v2.91.1, v2.91.2, v2.91.3

## What was asked

Every screen and button loading at least 10x faster, online 10x more reliable,
10x better performance with the graphics kept, no micro-stutter, instant UI.

## Results

Measured with `apps/range/scripts/perf.mjs` and `chaos.mjs` on the production
build of v2.89.3, this PC (RTX 5060), headless Chrome, while other sessions ran.
v2.84 is `baseline.json`. Ranges are across the final runs.

| Measure | v2.84 | Now | Factor |
| --- | --- | --- | --- |
| Return visit to menu | 1431 ms | 82-156 ms | 9-17x |
| First visit to menu (50 Mbit, 40 ms) | 1163 ms | 215-412 ms | 2.8-5.4x |
| Bot Match, Start to play | 5035 ms | 90-118 ms | 43-56x |
| Bot Match on Crash, Start straight after picking | not measured | 5168 ms (before these shaders moved; not re-measured) | |
| Practice Range, page settled | 6937 ms | 162-215 ms | 32-43x |
| Practice Range, page not settled | 6937 ms | about 1.8 s | about 4x |
| Play Online, click to joined | not measured | 88 ms, about 10 ms rejoining | |
| Menu click to paint, worst, page settled or not | 36 ms (no menu until loaded) | 83 ms (under 40 ms past the first two clicks) | worse, on a menu that used to not exist yet |
| Frames: fps | 361 | 360-387 | 1.0-1.07x |
| Frames: p99 | 7.2 ms | 5.9-6.5 ms | 1.2x |
| Frames: p99.9 | 18.5 ms | 10-11.1 ms | 1.7-1.9x |
| Frames: worst | 94.5 ms | 17-25 ms | 3.8-5.5x |
| Frames: over 33 ms, 45 s | 7 | 0 | |
| Long tasks in play, 45 s | 3 (worst 106 ms) | 0 | |
| Link cuts and stalls survived | 0 of 12 (each ended the session) | 12 of 12 | |

One of the six final play samples was bad: worst frame 405 ms, 10 long tasks. It
was the run with most else going on, and the same build straight after was
clean twice, so it is put down to the PC; it was not traced.

## Targets not reached

- First visit is 2.8-5.4x, not 10x. Its first paint is the round trips on a 40 ms
  link, 300 ms or more, the same as before.
- Frame rate is 1.0-1.07x, and p99 1.2x: a frame was already 2.5 ms. The gain is in
  the worst frames, and not to 10x either.
- "Every micro-stutter": no frame over 33 ms in the clean runs, but 1-2 over 16 ms
  in 45 s remain.
- In the first 1.3 s of a page, stalls of about 80, 220 and 190 ms remain: the
  first game's constructor and one shader graph too big to split. Menus work
  between them, and a click landing in one waits for it.
- A Start pressed before a map's preparation ends waits for it.
- Practice Range before the page has settled takes about 1.8 s.
- WebGL2 was only checked to work: about 36 s headless for Practice Range.
- Crash's isolated stall did not show in the last three 25-45 s runs; its cause
  was never found, so it may be gone or just rare.
- Keeping Practice Range ready costs 60-160 MB of heap, skipped under 4 GB.

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
  500 ms on Practice Range. Slicing the first frame was first rejected, then done: the
  shaders now build a piece at a time with nothing drawn (`GamePipeline.compile`), and
  only the one full frame that remains waits for a rest.
- Screen fades (120 ms) are gone: content had painted and then faded in. Hover
  and press feedback stay.
- Practice Range's game is built ahead and kept off screen, because it has no
  lobby to prepare behind. It is what makes the click 170 ms.
- Background work gives way to the player: the spare game and the full frame wait
  for 1.2 s without input, and shader pieces for 300 ms after a press. Mouse
  movement doesn't hold the pieces back, or wiggling it would hold back the world
  behind the menu. Anything that plays ends both waits.
- The reflection map is kept per renderer: it never differs between maps.
- Design audit, 2026-10-31 (`docs/design-audit/2026-10-31.md`): 41 findings, none
  from this work, and left for their own ticket. The first paint's plain menu was
  looked at by hand on desktop and phone.
- Remaining stutter, v2.91.0, 2026-10-31. Same build, 45 s of play. With the GPU
  idle and no transcription running: 323 fps, p99 7.7 ms, p99.9 13 ms, worst
  23.2 ms, none over 33 ms, no long tasks. A second idle run with tracing on gave
  p99 6.9 and p99.9 9.9 (it also counted the trace's flush). With WhisperX running
  or the PC otherwise busy: 210 to 295 fps, p99 8.7 to 12.3, worst 45 to 248 ms.
  So p99 8.2 was noise, and the big spikes follow load on the PC. WhisperX start
  times line up with the bad runs. The CPU wasn't logged during the last two runs,
  which were idle by GPU only (252 and 210 fps), so that part is inferred.
- Not proven: the wall against thread time split that would show pre-emption
  directly. Chrome's trace holds about 9 s of play, loses the file with a bigger
  buffer, and costs 15 to 25% of the frame rate. In those 9 s three frames passed
  8 ms: 3.7 ms of GC in one, plain work in another, none over 11 ms. Frames over
  8 ms are now in `play.spikes`, and `.scratch/perf-goal/spikes.mjs` and
  `spike-tree.mjs` line them up with a CPU profile.
- `updateMatrixWorld` looked like the one target left, at 3.9 s of 36 s of frame
  work, but that is 0.29 ms a frame. Nothing is redundant: the two pipeline walks
  are different scenes, the map is merged into a few meshes, a soldier's arms move
  after its last walk, and the 42 viewmodel bones move every frame. Freezing the
  gun's 15 static meshes would save about 0.02 ms, so no change.
- Clicks during load, corrected. `perf.mjs` calls `el.click()` from an evaluate
  that queues behind a long task, so it never counted the wait, and its DOM-ready
  menu time isn't what a player sees. Real clicks through the browser's input path
  every 400 ms for 7 s, 4 rounds on a quiet PC: a return visit waits 182 ms at worst
  (median of runs, 252 at most), a first visit 66 ms by the median and 1017 ms at
  most. Long tasks reach about 300 ms on a return visit and 1.4 s on a first. The
  83 ms this ticket reported missed these. The first visit's long task runs with
  clicks arriving, so it is not the rest-gated full frame.
- Tried and reverted, A/B on the same PC: starting the engine after the first paint
  moved no paint (FCP 544 against 548 ms, and each visit launches a fresh Chrome,
  so that figure may be browser start-up), and compiling the samples in pieces
  before the full frame blocked for longer (3242 against 2767 ms on a first visit,
  worst click 891 against 66 ms) because the frame still builds them.
- Fixed: a press before the engine was up threw on `sound.unlocked`, and did not
  count toward starting sound.
- Fixed: a first press built the gunshot bank and the reverb inside the press (about 150 ms);
  it now waits for the worker's samples, up to 2 s, and only starts the context there. The
  map's models arrived after `compile` had taken its list, so the first ordinary frame built
  their shaders (614 ms of a 1.2 s frame); `Game.prepare` now waits for `modelsIn`. A/B
  interleaved, CPU 83-86%, 4 rounds: first visit blocked 3334 to 2374 ms, worst long task
  1402 to 722; return visit blocked 2086 to 1019, worst long task 896 to 378. Worst click
  stays noisy: return 453 to 347, first 294 to 385.
- Checked: a press 113 ms into the document starts sound. An earlier "no sound at 900 ms"
  was the script pressing on `about:blank`: `Page.navigate` returns before the commit.
