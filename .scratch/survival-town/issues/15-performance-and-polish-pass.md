# 15 Performance and polish pass

Status: ready-for-agent
Milestone: 4 (ship)
Blocked by: 09, 10, 11, 12, 14

## What to build

Bring everything inside the budgets and clear every remaining glitch. See the spec section "Testing Decisions".

- **Budgets:** run the benchmark on every preset with 8 soldiers in view and fix anything over budget. The targets on the RTX 5060 at 1080p are:
  - High: 144 fps with no spikes.
  - Normal: GPU frame time ≤ 4.5 ms.
  - Low: GPU frame time ≤ 3 ms.
  - All presets: under 250 draw calls and under 1.5 M triangles.
  - Load: under 2 s.
- **Glitch sweep:** go through the full checklist at every reference spot and along the benchmark path:
  - z-fighting
  - seams
  - light leaks
  - floating or buried props
  - stretched materials
  - collision that doesn't match the visuals
  - stuck spots
  - ways out of the map
  - spawn safety
- **Fix-it list:** fix anything recorded as a gap in tickets 08–14.
- **Server CPU:** measure the live container with 8 clients on Survival Town.

## Acceptance criteria

- [ ] A benchmark report showing every budget met is recorded in this issue's comments.
- [ ] The playtester agent's full glitch sweep finds nothing, with screenshots attached.
- [ ] All automated tests pass.
- [ ] Server CPU for 8 players is within the old arena's 5–9 % of one core plus a small margin.

## Comments
