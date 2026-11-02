# Find and remove the worst-tick spikes

Status: resolved
Release: v2.105.0
Blocked by: 28

Spec: `../spec.md`, Testing seam 4

Ticket 28 left the worst tick at 15.5 to 49 ms across 60-person runs and one 209 ms tick in a soak, against a 16.7 ms bar. The CPU cap on `remote-test` is suspected, but that's unproven. Measure with no cap on the real machine or a run that records stalls separately, capture what each spike was doing, and fix what's in the game. The bar is the reliability the owner asked for, so an unexplained spike doesn't count as passed.

## Comments

**How it was measured.** Every server tick now runs through a profiler (`packages/fps-core/src/net/tick-profile.ts`, about 4 µs a tick with 58 bots). A tick of 8 ms or more (`SLOW_TICK_MS`) logs a `slow {...}` line with each phase's time, the slowest bot and what it was doing, what happened (plans, shots, deaths, snapshots, bytes), any collector pause overlapping it, and a cause. The cause is `gc:<kind>` if collection is 40% of the tick, `stall` if the thread was off the CPU for 40% of it, and otherwise `work:<phase>`. `apps/server/scripts/stall-canary.mjs` (CANARY=1 on the load test) only sleeps a millisecond at a time and reads the cgroup's `cpu.stat` and `/proc/pressure/cpu`, so a stall is proven rather than assumed. The uncapped runs used `.scratch/battle-royale/ticks/uncapped.sh`: the load test as a plain process on the home server over ssh, port 4091, with the server as its child, so nothing outlived a run. The live container was never touched.

**Machine stalls (the cap).** This is where ticket 28's 49 ms and ticket 09's 46 to 73 ms came from. Under `remote-test`, 60 clients: all 8 slow ticks were `stall`, 20 to 56 ms of wall time on 2.5 to 4.8 ms of CPU, and 7 of the 8 had the canary stalled too. The cap throttled the slice for 44.6 s of 94, the canary woke more than 16.7 ms late 249 times, and the worst tick was 55.8. The Zero Island soak (`playRoyale`, under `remote-test` and vitest) had slow ticks of 20 to 65 ms on 1 to 8 ms of CPU, so its worst tick measures the cap, not the game. Uncapped there was no throttling in any run (`capThrottledMs` 0) and no canary wake-up over 16 ms. The 209 ms soak tick wasn't reproduced; it was under the same cap.

**GC.** No tick over the bar was ever a collection. The largest seen was a 6.5 ms major collection inside a 9.4 ms tick at 60 clients.

**I/O.** At 60 clients, with compression on, 2 to 3 ticks a minute wait off the CPU in `send` (`stall`, 11 to 12.4 ms, canary not stalled). With `DEFLATE=0` those waits are gone, but sending costs more CPU on every tick: mean tick 4.78 vs 3.04 ms, p99 6.75 vs 5.75, twice the bytes. Compression stays on.

**The game's own work, and what was fixed.** With the cap gone, everything left was `work`, and most of it was V8 meeting code the warm-up had left cold:
1. A process's first HTTP upgrade throws away compiled code that reads typed arrays, across the whole process, once (`dependent property cell changed` on routes, the snapshot writer and node's own internals). It happened just after the warm-up, so the first match ran cold. No single call does it, only an upgrade: `spendFirstUpgrade()` takes one on a loopback server before the warm-up. `apps/server/test/first-upgrade.test.ts` shows the code kept with it and thrown away without it.
2. The warm-up now plays 8 openings and then the whole match, and carries a profiler the way the real game does. Filling seats and first rallies happen once a match, and a missing probe was a shape V8 hadn't seen (`tick` and `#factsOf` deopted on it).
3. Routes: two in one tick made 15 to 17 ms. A wide match now plans one route a tick (`MatchScale.plansPerTick`). The bots after that keep their last usercmd for one tick, as far bots already do, unless they're on a ladder or a ledge. A bot's first thought waits too, standing still. The exposure cost is now a class instead of a closure, which was a new call target on every route and threw the compiled search out partway through. The search's estimate is a plain function.
4. The first rallies: all 29 Squads' rallies in the countdown's first tick took 12 to 17 ms (60 nearest-node searches at 50 to 180 µs, depending on the ground). The countdown now gives at most 8 a plan, in the usual order, so each rally is the same point it was before (squad-plan test).
5. The event log writes once after each tick instead of 58 times when the bots join.
Tried and reverted: a cheaper rally spot without the walk check, and an allocation-free `PlayGround.nearest`. Neither moved the numbers.

**Before and after, uncapped, real sockets** (counted windows; the first window, with the opening, in brackets):

| Run | Before p99 / worst | After p99 / worst |
| --- | --- | --- |
| 2+58, 60 s | 4.75 / 35.4 (think, one bot 29.6) | 3.25 / 11.8 [9.7] |
| 12+48, 60 s | 5.25 / 15.9 | 4.25 / 12.9 [9.7] |
| 60 people, 60 s | 6.5 / 12.5 | 5.75 / 9.2 [5.9] |
| 2+58, whole match | 3.25 / 18.0 (2 over the bar, 31,200 ticks) | 2.75 / 13.8 (33,000 ticks, 0 over) |

Over ten more 2+58 runs on the way, the worst counted tick was 11.4 to 16.1 after the route cap, and 9.6 to 9.8 at the opening after the rally spread. What's left above 8 ms is named: one bot's route (`work:think`, up to about 13 ms; a route across the island visits 5,000 to 17,000 nodes), the match's start (`work:mode`, about 9.5 ms), and at 60 clients the `send` waits above.

**Warm-up and memory.** The warm-up stays at 2400 ticks after the openings, ready in 5.4 to 5.9 s (the health check allows 10). With 600 ticks, one of two runs had five route ticks of 18.5 to 21 ms. RSS uncapped reads about 490 MB, against 457 before. But the JS heap is back to 52 MB 15 s after the warm-up: the rest is memory already freed that the kernel takes back when it needs it. A whole match with the server alone in a 512 MiB cgroup (the live container's limit), swap off, peaked at 283 MiB with no OOM events (`.scratch/battle-royale/ticks/capped-mem.sh`). Live runs TDM, which has no warm-up, so none of this touches it today.
