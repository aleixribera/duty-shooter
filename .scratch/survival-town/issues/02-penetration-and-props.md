# 02 Bullet penetration and props

Status: resolved
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
- [x] A networked test (80 ms latency, jitter, 5 % loss) registers a lag-compensated wallbang on a strafing target through a wood wall.
- [x] Prop tests:
  - a head hit emits a prop event and the bullet behind it does full damage
  - a late joiner receives the popped set
  - the set is empty after match start
- [x] The playtester agent confirms the range station in the browser: impacts on both sides, and damage numbers that match the table.

## Comments

Implementation done; the browser check by the playtester is still open. Penetration table in `STATS.penetration` (stats file), the trace in `Simulation.#traceWorld`, tests in `packages/fps-core/test/penetration.test.ts` (including the networked wallbang and the popped-prop tests) and `apps/range/test/map.test.ts` (the station lanes). Impact events carry `side: 'entry' | 'exit'`. The server keeps popped props in every snapshot (`popped`), so a late joiner gets them; they clear at `matchStart`. The client draws props as their own meshes, hides popped ones and drops a tumbling copy. Range overlay gained a "Last hit" readout so the station's numbers can be read off. First browser attempt: the browser pane refused pointer lock; retry with `?nolock` once ticket 06 adds a spot to start at.

Browser check done, resolved. The playtester agent in the browser pane could not fire reliably (the hidden pane renders at about 1 fps and drops clicks), so the station was checked in headless Chrome over the DevTools protocol at full frame rate instead, with real mouse input (aim down sights, one shot per lane, `?nolock&at=<x>,22,0`):

| Lane | Last hit | Ratio to the open 39.2 HP hit | Table |
|---|---|---|---|
| Wood | 29.4 HP | 0.75 | 75 % |
| Plaster | 31.4 HP | 0.80 | 80 % |
| Sheet metal | 25.5 HP | 0.65 | 65 % |
| Brick | no hit | - | stops |

A shot through the wood panel produced an entry impact at z 18.00 and an exit impact at z 17.80, both drawn. The mannequin head popped on the first shot and the bullet carried on to the wall behind. No console errors. The mannequin reads poorly (white on a white wall); ticket 09's art fixes that. `?at=x,z,yaw` (dev only) was added to start offline at a given spot.
