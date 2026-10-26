# 06 Browser benchmark and reference camera spots

Status: resolved
Milestone: 2 (the map, checkpoints)
Blocked by: 05

## What to build

Test seam 3: a repeatable way to measure performance and take comparable screenshots. See the spec section "Testing Decisions".

- **A benchmark flag:**
  - It loads a chosen map and flies its fixed benchmark path once per graphics preset.
  - It reports:
    - frame-time percentiles (p50, p95, p99, max)
    - GPU time where the browser exposes timestamp queries
    - draw calls
    - triangles
    - load time
  - The results go to an on-screen panel and to the console as JSON, so the playtester agent can read them.
- **A reference-spot flag** places the camera at each of the map's named reference spots with the HUD hidden, for repeatable screenshots.
- **Paths and spots:** Survival Town defines its benchmark path through both houses, the cul-de-sac and the yards. It also defines at least 12 reference spots matching common gameplay-video viewpoints (each spawn, the bus, both windows, the roofs, the garages).
- **The range** gets a short benchmark path too.

## Acceptance criteria

- [x] The benchmark runs without user input on both maps and prints the JSON report.
- [x] The playtester agent captures a screenshot at every reference spot.
- [x] A baseline report is recorded in this issue's comments (RTX 5060, 1080p, every preset), so later tickets can compare against it.

## Comments

Resolved. `?bench&map=<id>` flies the map's benchmark path once per preset (low, normal, high) at 6 m/s after a 2 s still warm-up per preset, then shows the report in a panel, logs `BENCHMARK {json}` and sets `duty.benchmark`. GPU time comes from WebGPU timestamp queries (`trackTimestamp`). `?map=<id>&spot=<name>` parks the camera at a reference spot with the menu and HUD hidden. Both run without input: `node apps/range/scripts/bench.mjs <map>` and `node apps/range/scripts/spots.mjs <map> <out dir>` drive Chrome over the DevTools protocol at 1920 x 1080 with vsync off (the browser pane throttles hidden tabs, so it can't time frames). Survival Town has 16 reference spots (each team's spawn, upstairs window, roof, garage, deck and living room, plus the bus, the cul-de-sac, the street end and an overview) and a 29-key path through both houses, the cul-de-sac and both yards; the range has a five-key path down the firing line. All 16 spots were captured.

Baseline, owner's machine (RTX 5060), Chrome headless, WebGPU, 1920 x 1080, vsync off, plain grid-shader geometry:

| Map | Preset | Frame p50 / p95 / p99 / max (ms) | GPU p50 / p95 / max (ms) | Draw calls mean / max | Triangles | Load |
|---|---|---|---|---|---|---|
| Practice Range | low | 0.6 / - / - / 7.6 | 0.29 / - / 0.83 | 35 / 42 | 4.8 k | - |
| Practice Range | normal | 2.0 / - / - / 13.9 | 0.96 / - / 1.49 | 51 / 59 | 4.8 k | - |
| Practice Range | high | 2.5 / - / - / 13.9 | 1.89 / - / 2.56 | 53 / 60 | 4.8 k | - |
| Survival Town | low | 0.7 / 1.2 / 2.0 / 213 | 0.41 / 0.78 / 1.04 | 23 / 24 | 21 k | 1.05 s |
| Survival Town | normal | 2.0 / 3.0 / 4.6 / 183 | 1.16 / 1.74 / 2.12 | 38 / 39 | 21 k | 1.05 s |
| Survival Town | high | 2.8 / 4.5 / 6.0 / 43 | 2.10 / 3.48 / 4.16 | 38 / 39 | 21 k | 1.05 s |

The single long frames (max) are pipeline compiles when new materials first come into view; ticket 15 should warm them up before the menu hands over.
