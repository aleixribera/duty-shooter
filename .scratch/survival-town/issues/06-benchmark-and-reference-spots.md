# 06 Browser benchmark and reference camera spots

Status: ready-for-agent
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

- [ ] The benchmark runs without user input on both maps and prints the JSON report.
- [ ] The playtester agent captures a screenshot at every reference spot.
- [ ] A baseline report is recorded in this issue's comments (RTX 5060, 1080p, every preset), so later tickets can compare against it.

## Comments
