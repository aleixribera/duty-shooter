# 02 Movement: pmove with every MW2019 movement state

Status: ready-for-agent
Milestone: 1 (movement and course, offline)
Blocked by: 01

## What to build

Quake/IW-lineage pmove in `fps-core` against the box world: acceleration, friction, air control, step-up, ground snapping, stance transitions. States: walk, sprint, tactical sprint (duration and recharge), crouch, prone, jump, mantle (three height bands, timed and committal), slide and slide-cancel, landing and fall damage. All numbers from the stats file. Health (100 HP) exists so fall damage applies and lethal falls kill.

User stories 1-16 (spec "Movement").

## Acceptance criteria

- [ ] Headless match tests (zero latency, single client) cover: sprint and tactical-sprint speeds and duration/recharge, strafe and backpedal ratios, ADS walk speed (ADS button held), crouch/prone speeds and stance timings, jump height, step-up, mantle height bands and durations, slide distance and slide-cancel window, fall-damage thresholds and lethal fall. Expected values come from the stats file and its tolerances.
- [ ] Tests assert only match outputs (position, velocity, stance, movement state, health), never pmove internals.
- [ ] Determinism test still passes.
