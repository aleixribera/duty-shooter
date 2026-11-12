# The lawn thins into the desert

Status: resolved

Release: v2.187.1

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, Picture): "In 01 the lawn is a green rectangle with ruler edges pasted on the sand." The menu's backdrop is Survival Town from the air, so this was the first picture every player saw. The lawn was one grass box beside the desert's sand box, and the two met on a straight line.

## Comments

**v2.187.1.** The lawn now thins out into the desert over a few metres, along a ragged line.

How it works:
- A finish can carry a `fringe` (`surfaces/types.ts`): the rectangle its ground covers, a width, and the colour it gives way to.
- The grass shader (`fringed()` in `surface-materials.ts`) measures how far in from the nearest side each point is. Bare ground reaches in from the edge by a distance that wanders with two scales of noise, from none to the full width (5 m on Survival Town).
- At the very edge it is all bare, in the desert's colour, so it meets the sand without a seam. A little further in, tufts of grass survive in the bare patches.
- Through the `wear` hook that worn plaster already used, the relief turns to the desert's cracked earth where the ground is bare. Without it, the line where the cracks stopped was still a ruled edge at eye level.
- Survival Town's lawn rectangle and desert colour are now constants (`LAWN`, `DESERT`), shared by the ground layers and the finish.

A second-opinion review found two seams:
- The bare ground was the desert's flat colour, while the sand beside it is scuffed and rippled, so parched patches stopped on the line. The bare ground is now drawn by the sand's own albedo; both use world-metre coordinates, so they line up.
- The darkening of low places still read the grass relief. It now reads the blended one.

Both are fixed.

Only fringed finishes pay for the extra relief read, and Survival Town's lawn is the only one. The bake's fingerprint includes finishes, so the map rebaked once in the dev server.

Verified:
- Typecheck passes for `apps/range` and `fps-client`.
- `survival-town.test.ts`: 91 of 92 passed in the full-file run. The containment test "sprint slides toward the boundary…" failed there at 6 s and passed on its own. It moves players only, and this change is visual, so it reads as a timing flake under load.
- `../lawn/look.mjs` shoots the menu from the air and the lawn's east and north-east edges at eye level:
  - before: `../reviews/2026-11-12d/01-menu.jpg`;
  - after: `../lawn/after/` (grass relief in the band, where the cracks still stopped on a line) `../lawn/after2/` (the cracks carry through the bare patches), and `../lawn/after3/` (after the review's fixes: the bare ground scuffed like the desert).
  - No page errors.
