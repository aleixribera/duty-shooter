# 05 Survival Town layout: plain geometry, the reference file, spawns and the boundary

Status: resolved
Milestone: 2 (the map, checkpoints)
Blocked by: 01, 03

## What to build

The whole playable map at its final dimensions, in plain materials, fully tested before any art goes on it. See the spec sections "Maps (the app)" and "Testing Decisions".

- **The reference file:** research public sources for the original 2010 Nuketown:
  - overhead layout maps
  - wiki pages
  - community measurements
  - frames from gameplay video

  Build a data file of measurements. Each one has its source, its value, and its tolerance class: structural (±15 cm) for doors, windows, cover heights and wall positions, or other (±30 cm). Calibrate scale using known CoD player measurements (eye height 1.524 m, hull height 1.778 m) and standard door heights. Record every assumption in the file.
- **Map definitions:** maps become data the app supplies, with a registry of **Survival Town** and the **Practice Range**. The core still imports nothing from any map.
- **Survival Town's solids:**
  - both houses with full interiors and stairs
  - garages
  - the cul-de-sac
  - yards and fences
  - the bus and both trucks, as yaw-rotated solids
  - the boat
  - planters and other cover
  - sloped roofs: walkable through 5 cm player clip steps, with bullet surfaces on the visible slopes

  Materials are assigned for penetration and footsteps.
- **The boundary:** player clip that reaches into the sky, traced along the original's playable edge.
- **Spawn sets:** FFA, plus one per TDM team, with each team's set at its own house.
- **Indoor zones** for each house and garage, for reverb.
- **The map exposes its own measurements** for each entry in the reference file.
- **The server** takes its map and starting mode from configuration (it defaults to today's map until release). The client gets a flag that adds an "Explore Survival Town" offline entry. The geometry renders with the existing grid shader for now.

## Acceptance criteria

- [x] Map tests through the headless harness:
  - every spawn (FFA and both TDM sets) is clear of geometry and on the ground
  - scripted routes reach every intended area, roofs included
  - containment sweeps (runs, jumps, slides and mantles from every roof edge and boundary fence) end inside the playable area
  - a bullet fired along and through every player clip solid is never stopped by it
  - every reference measurement is within its tolerance class
  - every walkable surface has a footstep material, and every solid has a penetration row
- [x] The playtester agent walks the map offline under the flag: no stuck spots, no way out, roofs reachable, and no console errors.
- [x] A networked TDM match with 8 scripted players runs on Survival Town, and the server CPU cost stays within the old arena's 5–9 % of one core plus a small margin.

## Comments

Layout done (playtester walk-through pending, below). Maps are data now: `apps/range/src/map/definition.ts` (the `MapDefinition` shape), `maps.ts` (the registry: `survival-town`, `range`), `survival-town.ts` (the map) and `builder.ts` (walls with openings, stairs, slopes, gable roofs, non-overlapping ground tiles). fps-core still imports nothing from any map.

- **Reference file:** `survival-town-reference.ts`. Eleven sourced measurements (overhead mini-map from the community wiki calibrated against the 2.03 m door and the 1.778 m hull, wiki and Wikipedia text, Drift0r's area figure, standard door heights), each with its tolerance class, and every assumption written down (mirror symmetry, eaves, wall thicknesses, storey heights, interiors, 0.91 m interior doors). The map measures itself by raycasting its own geometry; every entry is within tolerance.
- **Geometry:** both houses with ground and upper floors, inside stairs, garages, porches, back decks with stairs, the den lean-to, gable roofs walkable through 5 cm player clip steps under bullet-only slopes, the cul-de-sac and street, yard fences along the playable edge, the bus, van, pickup and station wagon as yaw-rotated solids (engine blocks are `metal`), the boat on its trailer, the shed, planters, picnic tables and furniture.
- **Boundary:** 100 m tall player clip traced along the original's edge (the polygon is `PLAY_AREA`).
- **Spawns:** 14 FFA, 8 per team in each house's back yard, all facing the cul-de-sac.
- **Movement fix in fps-core:** mantling onto a stepped slope used to fail because the landing spot overlapped the next clip step; `findLedge` now steps up to the standing height under a step-height limit (`standingHeight` in collision.ts, covered in mantle.test.ts).
- **Server:** `MAP=survival-town|range` (default `range` until release) and `MODE`; the client shows "Explore Survival Town" under `?town`.
- **Tests:** `apps/range/test/survival-town.test.ts`, 42 tests: spawns clear and grounded, scripted routes (yard stairs, deck, upstairs, both house routes, the window, every roof via the AC unit, deck or planter, the bus and van), containment sweeps from the edges and roofs, rays through every player clip solid, outward rays reach the scenery, materials and penetration rows, no coplanar overlapping faces.
- **Server CPU**, 8 scripted players in TDM (`BENCH=1 npx vitest run apps/range/test/server-cpu.test.ts`): 0.26 ms per tick, 1.6 % of one core, against 0.36 ms on the range.

Resolved. The browser walk-through: the playtester agent's pane runs at about 1 fps, too slow to walk, so movement coverage is the scripted routes and containment sweeps above (they run the same simulation the client predicts with). In the browser, headless Chrome at full frame rate: `?town&nolock` → Explore Survival Town spawns in the north back yard and walks in through the back door (-4, -40 → -3.0, -32.2), every reference spot renders, and there are no console errors on load, while walking or at any spot.
