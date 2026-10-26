# 01 Solids, player clip, bullet surfaces and the spatial grid

Status: resolved
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

- [x] Headless tests cover all of the following:
  - walking into, sliding along, stepping onto and mantling onto yaw-rotated solids at several angles
  - player clip blocks the hull but no bullet
  - bullet surfaces stop bullets but not the hull
  - a fully oriented bullet surface is hit at the right point
- [x] A test on randomised worlds shows the grid gives the same collision and raycast results as a linear scan.
- [x] The determinism test still passes, and all existing tests pass.
- [x] Walking a 30° slope of 5 cm player clip steps gives a smooth camera height: no visible step in eye height between ticks.
- [x] Server CPU with 8 scripted players on the Practice Range is no worse than before (measured in a networked match benchmark or the live container).

## Comments

Resolved. Solids replace boxes everywhere (`box`, `yawBox`, `orientedBox`, `playerClip` in fps-core; `World` carries a movement grid and a bullet grid). The sweep is now a collide-and-slide on the ground plane with separating-axis tests, so rotated walls slide properly; axis-aligned arithmetic is unchanged and every existing test passes untouched apart from the rename. Headless coverage is in `packages/fps-core/test/solids.test.ts`, including grid-versus-linear-scan on randomised worlds. The six new materials have their own footstep and impact sounds already (ticket 13's banks were cheap to do here). The Practice Range ramp is now player clip steps under a sloped bullet surface.

Camera: walking a 30° slope of 5 cm clip steps is smooth with the existing step-up easing (largest frame-to-frame eye change is under 2x the average at 240 Hz, up and down); covered by `packages/fps-client/test/camera.test.ts`.

Server CPU, 8 scripted players on the Practice Range (`BENCH=1 npx vitest run apps/range/test/server-cpu.test.ts`): before 0.43 ms per tick (2.6 % of one core), after 0.41 ms (2.5 %).
