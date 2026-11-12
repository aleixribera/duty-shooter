# Tests that give way

Status: resolved

Release: v2.187.9

Spec: `../spec.md`

The owner, 2026-11-12: the loop's tests were using most of the PC, more than two Unreal games under test together, and a test run must not slow the PC "even while playing Rocket League".

What made them heavy:
- `launchChrome()` ran the 3D game with vsync off and no frame limit (`--disable-gpu-vsync --disable-frame-rate-limit`): every scripted screenshot run drew Survival Town as fast as the GPU could, at normal priority, for its whole length. Those flags exist for the frame-time benchmark; every other script inherited them.
- Vitest ran its workers on 11 of the 12 cores at normal priority, and the pre-push hook ran the typecheck and every soak (whole bot matches) that way on every push.

## Comments

- **Scripted browsers.** `launchChrome()` is light unless asked otherwise:
  - The page draws at most 30 frames a second (`FRAME_CAP=<n>`, 0 for no cap). A script injected before the page loads holds each `requestAnimationFrame` callback to frames at least 1/30 s apart. Callbacks asked for in one frame all run in it. The game has no adaptive quality, so the picture is the same.
  - The script and its Chrome run at idle priority. Node lowers itself before spawning, and on Windows the children inherit the idle class, so Chrome only gets the CPU nothing else wants.
  - It also launches with no extensions, background networking or component updates.
  - `uncapped: true` keeps the old behaviour: vsync off, no cap, normal priority. Only the measurements use it (`bench.mjs`, `perf.mjs`).
  - The cap has its own name, not `FPS`, because the trailer's `capture.mjs` already reads `FPS` for its shot rate.
- **Vitest** (`vitest.config.ts`). Outside CI, the run lowers itself to idle priority, which its workers inherit. It uses at most a third of the cores (4 of 12 here). CI is unchanged.
- **Pre-push hook.** The typecheck and the soaks run under `nice -n 19`, which Git Bash maps to the idle class.
- `AGENTS.md` says all this where it introduces `launchChrome()`.

A second-opinion review found no correctness faults. It raised three small points:
- A failed connection to the browser target left Chrome running. It now kills it.
- The script's lowered priority lasted the whole script, so a later uncapped launch in the same script stayed idle. An uncapped launch now puts it back to normal.
- Scripts that time frames without `uncapped` now read about 33 ms a frame: `bot-runs`' `minFps` (report only) and another session's untracked `.scratch/battle-royale/t62/spots-perf.mjs`. AGENTS.md says frame-time measurements pass `uncapped: true`.

Verified, with Rocket League running on this PC throughout:
- **The soaks under the new config.** 19 files and 54 tests pass in 189 s (about 90 s before, on 11 cores at normal priority). The run's 5 node processes were all at Idle. Over a 5 s sample they took 5% of the PC beside Rocket League's 13%: idle priority leaves them only the CPU the game doesn't use.
- **`../light/measure.mjs`.** It walks Survival Town alone for 10 s in the light Chrome:
  - 31.5 fps and 29.2 fps, every process Idle.
  - 6.1% and 16.2% of the PC's CPU. An idle process takes whatever is spare, so this figure moves with the load.
  - The first try showed Chrome's GPU process at AboveNormal and a renderer at Normal, which is why the 2 s re-lowering exists.
  - The old uncapped way wasn't measured beside it: that would have taken the GPU from the game being played.
- `launchChrome()` launched and closed three times in a row, then again after the review's fixes.
- The `ui-model`, `royale-lobby-view` and `bot-setup` tests ran under the new vitest config (4 workers, idle).
- `bench.mjs` and `perf.mjs` pass `uncapped: true`.
