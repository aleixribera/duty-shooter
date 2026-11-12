# Holes, not moss

Status: resolved

Release: v2.187.17

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12e.md`), its first defect: "the bullet holes in the mint siding each sit in a pale yellow-green fuzzy disc two to three times the hole's width; a cluster of six reads as moss or lily-pad stickers on the wall, not as chipped paint around a hole" (07 centre, 08 upper right). Those frames are point-blank: the scripted player stands at the wall.

## Comments

- **What made the discs.** Each hole is one 128 px tile of a procedural texture, laid as a 6.5 to 9.5 cm decal. A hand from the eye that tile is magnified several times. Its crater was about three times the core's width and filled with per-pixel grit, so bilinear magnification turned it into a soft, speckled, evenly pale disc. On the mint siding, wood's warm tint turned that disc yellow-green.
- **What changed** (`holeTile` / `holeTexture` in `effects.ts`):
  - The tile is 256 px, so a hole stays sharp a hand from the eye. The dent's slope shading is scaled to match.
  - The crater is a little over twice the core's width (0.10 to 0.13 of the tile, was 0.13 to 0.17), so the dark core reads as the hole.
  - The crater's surface is broken in splinters running out from the hole, two scales of angular noise with light grit over them. The first try used one even scale, which read as daisy petals; two scales made the streaks irregular.
  - The crater is lit about as the surface is (0.56, was 0.68), so it shows by its shading and lit lower lip rather than as a pale fill.
  - The dust haze round the crater falls off within 0.8 of its radius (was 1.5) and is fainter.
- The holes' size and their per-material tint are unchanged.

A second-opinion review raised three points:
- **The no-stacking reach no longer matched the crater.** A shot was dropped within 0.35 of a decal's size of an existing hole. That suited the old, wider crater, but it now dropped shots 1.5 to 3.3 cm off that would have left a hole of their own. The reach is now 0.24, still past the crater's widest wobble. Ticket 45's held-burst check (`../holes2/burst.mjs`, `../holes3/burst/crop.jpg`) leaves separate holes and no clumps.
- **The load cost grew about four times** with the larger tile (once, when the effects are built). The pixel loop now skips the chip test past where chips can lie, and writes its four bytes directly instead of making an array per pixel.
- Near the core, the fine noise is narrower than a pixel and shows as grit, not streaks. Left as is: it reads as broken surface at the lip, and the coarse noise carries the streaks.

Verified:
- The `fps-client` typecheck passes.
- `bullet-holes` and `probe-lit-smoke` tests pass (6/6), and `bullet-holes` again after the review's fixes.
- `../holes3/holes.mjs` (`../holes/holes.mjs` plus a point-blank spot 0.6 m from the north house front) fires six shots each at point-blank, from 2 m into the sunlit siding, and into a shaded sheet-metal wall. Shots before and after are in `../holes3/`; `sheet.jpg` and `sheet2.jpg` compare them.
  - Point-blank, before: soft pale discs. After: a dark core in a ragged, splintered lip.
  - From 2 m: smaller, cleaner holes with less halo.
  - In the shade: unchanged in character.
  - No page errors.
