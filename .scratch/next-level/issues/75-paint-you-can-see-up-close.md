# Paint you can see up close

Status: resolved

Release: v2.187.24

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its fourth defect (07, and 06 behind the board): "the tan wall the player faces is one flat ochre fill with no grain, texture or variation edge to edge".

## Comments

- **What it is.** A room's walls and ceilings are the `plaster` family. Its colour was the base times one faint 40 cm noise (±3%). Its relief, the stucco tile, was damped to 0.3 after review 2026-11-12d found the walls mottled like brown render. Nothing was left between a centimetre and a metre, so at arm's length the wall was one flat fill.
- **What changed** (`surface-materials.ts`, the `plaster` albedo). All of it is fine-grained, so the blotchy render doesn't come back:
  - A roller's stipple, a few millimetres across (noise at 260 and 80 cycles a metre). The noise picture is mipmapped, so the stipple settles to its mean once a pixel covers it, with no shimmer at range or at a grazing angle.
  - Faint laps a roller's width (23 cm) apart, running up the wall.
  - The second coat a shade off over a metre or so.
  - The paint dulled in patches within 45 cm of a wall's ends and openings, where hands rub. Ceilings have no open edges, so they get none of this.
- **Seen in the page** (`../painted-wall/look.mjs`, `sheet.jpg`):
  - At 0.8 m the wall has a fine painted grain where it was a flat fill.
  - From across the room, at a grazing angle along a wall and on the garage's walls, it looks as it did: no blotches, no moiré.
- **Not in this slice.** The sunlit wedge in 07 has a fine diagonal dot grid in the sun patch only. It looks like the shadow filter's dither, not the plaster, and is left for its own ticket. The walls' overall tan comes from cream paint under dim baked light; that is the lighting's balance, not this finish.

No second-opinion review: the change is five tuned noise terms in one material, with no logic. The diff was read and checked against every view above.

Verified:
- The `fps-client` typecheck passes.
- The `surface-detail` tests pass (15/15).
- Wall frames before and after: at 0.8 m, across the room, in the garage, grazing along a wall, and under the ceiling. No page errors.
