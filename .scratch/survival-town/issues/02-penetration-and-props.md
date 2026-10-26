# 02 Bullet penetration and props

Status: ready-for-agent
Milestone: 1 (core, headless)
Blocked by: 01

## What to build

Wallbangs and shootable mannequin heads. See the spec section "Bullet penetration (shared core)". The decision record is 0003.

- **The penetration table** goes in the stats file, with a note on where each value comes from:
  - one row per material, with a thickness cost and a damage multiplier
  - materials that stop bullets are marked: brick, concrete, metal (engine blocks, steel), dirt, sand, gravel and asphalt (the ground)
  - wood, plaster, glass, sheet metal and plastic let bullets through

  Tune the values for playability against how Nuketown wallbangs behaved, and record the reasoning next to each row.
- **The bullet raycast** carries on through penetrable solids until its budget runs out, multiplying damage by each one's multiplier. Player clip still never takes part.
- **Impact events** for both the entry and the exit of each penetrated solid, so the client can draw impacts on both sides.
- **Penetration runs inside the existing lag-compensated hit check.** Prediction, reconciliation and rewinding are unchanged.
- **Props** are solids with an id, flagged so they never reduce a bullet's damage or budget.
  - A hit produces a prop event.
  - The server keeps the set of popped props in the match state, sends it in the join snapshot, and clears it at match start.
  - The client hides a popped head and spawns a falling head as a presentation-only effect.
- **The range** gets a penetration test station: a target behind a wood panel, a plaster wall, a sheet-metal panel and a brick wall.

## Acceptance criteria

- [ ] Headless tests:
  - damage after one and two penetrable layers matches the table
  - each stopping material stops the bullet
  - entry and exit impact events are emitted
  - player clip in the path changes nothing
- [ ] A networked test (80 ms latency, jitter, 5 % loss) registers a lag-compensated wallbang on a strafing target through a wood wall.
- [ ] Prop tests:
  - a head hit emits a prop event and the bullet behind it does full damage
  - a late joiner receives the popped set
  - the set is empty after match start
- [ ] The playtester agent confirms the range station in the browser: impacts on both sides, and damage numbers that match the table.

## Comments
