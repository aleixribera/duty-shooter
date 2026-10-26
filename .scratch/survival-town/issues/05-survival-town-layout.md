# 05 Survival Town layout: plain geometry, the reference file, spawns and the boundary

Status: ready-for-agent
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

- [ ] Map tests through the headless harness:
  - every spawn (FFA and both TDM sets) is clear of geometry and on the ground
  - scripted routes reach every intended area, roofs included
  - containment sweeps (runs, jumps, slides and mantles from every roof edge and boundary fence) end inside the playable area
  - a bullet fired along and through every player clip solid is never stopped by it
  - every reference measurement is within its tolerance class
  - every walkable surface has a footstep material, and every solid has a penetration row
- [ ] The playtester agent walks the map offline under the flag: no stuck spots, no way out, roofs reachable, and no console errors.
- [ ] A networked TDM match with 8 scripted players runs on Survival Town, and the server CPU cost stays within the old arena's 5–9 % of one core plus a small margin.

## Comments
