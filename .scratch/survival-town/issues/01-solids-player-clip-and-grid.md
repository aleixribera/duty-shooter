# 01 Solids, player clip, bullet surfaces and the spatial grid

Status: ready-for-agent
Milestone: 1 (core, headless)
Blocked by: none

## What to build

The world model the new map needs. See the spec sections "The world model (shared core)" and "Testing Decisions". The decision records are 0001 and 0002.

- **Replace boxes with solids.** Each solid has:
  - a shape: an axis-aligned box, or a box rotated around the vertical axis
  - a material
  - what it blocks: players, bullets or both

  A plain box keeps meaning an axis-aligned solid that blocks both, so the Practice Range and every existing test keep working without edits beyond the type rename.
- **Bullet surfaces** may be fully oriented. Solids that block players are limited to yaw rotation, and building one with any other rotation is rejected.
- **The movement sweep** handles yaw-rotated solids:
  - walking into one
  - sliding along it
  - stepping onto it
  - landing on it
  - mantling onto it
  - the starting-inside escape rule that works today

  It ignores bullet-only solids.
- **The bullet raycast** handles oriented solids and ignores player clip.
- **A uniform spatial grid** (about 4 m cells) is built once per world. Both the sweep and the raycast query it, and the results are identical to the old linear scan.
- **New materials:** `brick`, `asphalt`, `gravel`, `sand`, `sheetMetal`, `plastic`. Map them to existing impact and footstep sounds until ticket 13 gives them their own.
- **Harness:** the headless and networked match harnesses accept solids.
- **Client presentation:** the camera smooths eye-height changes on step-ups, so walking up 5 cm player clip steps under a slope reads as a slope. Normal stairs must still feel like stairs.

## Acceptance criteria

- [ ] Headless tests cover all of the following:
  - walking into, sliding along, stepping onto and mantling onto yaw-rotated solids at several angles
  - player clip blocks the hull but no bullet
  - bullet surfaces stop bullets but not the hull
  - a fully oriented bullet surface is hit at the right point
- [ ] A test on randomised worlds shows the grid gives the same collision and raycast results as a linear scan.
- [ ] The determinism test still passes, and all existing tests pass.
- [ ] Walking a 30° slope of 5 cm player clip steps gives a smooth camera height: no visible step in eye height between ticks.
- [ ] Server CPU with 8 scripted players on the Practice Range is no worse than before (measured in a networked match benchmark or the live container).

## Comments
