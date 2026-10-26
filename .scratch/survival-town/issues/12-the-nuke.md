# 12 The nuke

Status: ready-for-agent
Milestone: 3 (art and presentation)
Blocked by: 04, 08

## What to build

The end-of-match moment. See the spec section "Rendering (presentation package)".

- **A presentation-only nuke** driven by the intermission's nuke phase (0–6 s after `matchEnd`):
  - an air-raid siren
  - a flash
  - the shockwave rolling across the town
  - a mushroom cloud
  - a colour grade
  - a synthesised blast that arrives on time for its distance

  Each player sees it from where they're standing.
- **It never touches collision or the simulation.** The world is restored visually at `matchStart`.
- **It scales with the graphics presets.** Low keeps the flash, the cloud and the sound, but drops expensive particles.

## Acceptance criteria

- [ ] The playtester agent captures the nuke from at least three spots, on each preset, with no console errors.
- [ ] After `matchStart` the map is fully restored: screenshots match the reference spots.
- [ ] Frame time during the nuke stays within twice the preset's budget, with no hitches longer than 50 ms.

## Comments
