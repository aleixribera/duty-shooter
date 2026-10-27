# 05 Viewmodel: code-built M4A1, gloved arms, animation and procedural layers

Status: resolved
Milestone: 2 (weapon simulation, viewmodel and the range, offline)
Blocked by: 03

## What to build

In `fps-client` (stories 28-29, 33-38): a detailed stock M4A1 with iron sights built from beveled meshes with anodized aluminium, polymer and edge-wear materials; gloved first-person arms with hands placed on grip and handguard in every animation. Keyframe animations authored in code: idle, fire, ADS in/out, tactical reload, empty reload (bolt release), inspect, draw, melee, sprint and tactical-sprint poses. Procedural layers: sway and turn inertia, walk/sprint bob scaled by speed, spring-based visual recoil kick (separate from simulation recoil), landing dip. The viewmodel renders with its own FOV and never clips into walls.

Drive it from a small viewmodel-state interface (weapon state, timers, movement speed, look delta) so ticket 06 can feed it from `fps-core`. Include a dev viewer route in `apps/range` that cycles every animation.

## Acceptance criteria

- [ ] Playtester agent: viewer loads with no console errors, every animation plays, hands stay on the gun.
- [ ] Animation durations come from the stats file (reload, ADS, draw, ...), so they match the simulation.
