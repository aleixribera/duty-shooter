# 17 The performance pass and the load test

Status: resolved
Blocked by: 15, 16
Release: v1.12.2

Benchmark both maps on every preset within budgets; 12-player load test on both maps at 60 Hz on the home server.

## Comments
- 2026-10-27, results (decisions: "within budget" means within Survival Town's own numbers on each preset, as the spec's test list says; the server's budget is a 16.7 ms tick at 60 Hz):
  - **Browser benchmark**, `apps/range/scripts/bench.mjs`, headless Chrome at 1920×1080 on the dev PC, vsync off, the map's benchmark path once per preset. Frame ms p50 / p95 / p99, GPU p95, draw calls, triangles:

    | Map | Preset | Frame p50 / p95 / p99 | GPU p95 | Draws | Triangles |
    |---|---|---|---|---|---|
    | Survival Town | low | 2.5 / 4.0 / 5.5 | 0.51 | 153 | 56k |
    | Survival Town | normal | 4.7 / 11.4 / 31.2 | 2.48 | 180 | 60k |
    | Survival Town | high | 6.1 / 10.4 / 16.5 | 3.77 | 321 | 107k |
    | Switchyard | low | 1.4 / 3.4 / 7.0 | 0.61 | 102 | 146k |
    | Switchyard | normal | 3.2 / 5.6 / 9.1 | 1.57 | 120 | 146k |
    | Switchyard | high | 4.3 / 7.3 / 11.0 | 3.35 | 213 | 278k |

    Switchyard is faster than Survival Town on every preset except low's p99 (7.0 vs 5.5 ms, still far under a 16.7 ms frame) and low's GPU p95 (0.61 vs 0.51 ms). It carries more triangles (the Blender cars and tanks) but far fewer draw calls. Load to first frame: 2.7 s and 1.5 s. No console errors on either.
  - **Server CPU**, `BENCH=1 npx vitest run apps/range/test/server-cpu.test.ts` on the home server (new cases: 12 seats on each map, in TDM with 12 people, Outposts with 2 people + 10 bots, and Charge on Switchyard with 4 people + 8 bots): every case 0.96–1.92 ms a tick (6–12 % of one core); the test now fails above 8 ms.
  - **Load test**, `apps/server/scripts/load-test.mjs 12 40` against the built server on the home server, 12 WebSocket clients moving and firing at 60 Hz: Survival Town 28–41 % CPU, 110–114 MB RSS, 2,394–2,399 of 2,400 snapshots per client in 40 s; Switchyard (`MAP=switchyard`) 34–45 % CPU, 109–113 MB RSS, 2,395–2,400 snapshots. Both hold 60 Hz.
  - Fixed on the way: the load test gave the server 0.8 s to start, too short now that it builds both lobby maps' nav graphs first; it now polls `/healthz` (up to 60 s), and waits for the server to exit, so its shutdown log no longer crashes on a closed pipe.
