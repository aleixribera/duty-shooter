# No white line along the skirting

Status: resolved

Release: v2.186.3

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, defect 1): in `../reviews/2026-11-12d/05-firing.jpg` "a dotted white line runs across the room" where the wall meets the floor. It showed along every room's skirting in Survival Town, dashed or solid, brighter than anything else indoors.

## Comments

**v2.186.3.** It was the bake, not a gap in the walls.

A skirting board is a decoration 2.5 cm deep: 1.5 cm proud of the wall and 1 cm sunk into it. Its top face gets two texels across that depth. The baker keeps each sample 3 cm in from a face's edges (`INSET`), and on a face narrower than 6 cm the clamp inverted: every texel across it landed 0.5 cm past one edge. When that edge was the wall side, every texel was buried in the wall, nothing was left to fill from, and the face took the stand-in light (`encodeLight(0.4)`). That is several times a room's light, so it showed as the white line. Whether a board's top showed it depended on which way its face ran, which is why the line was dashed.

The fix: a face narrower than both insets now samples down its middle (`#point` in `surfaces/bake.ts`). `BAKE_VERSION` is now 5, so cached bakes are redone. On Survival Town, thin faces whose first sample was buried went from 357 to 93; the rest are truly covered.

Verified:
- `surfaces.test.ts` has a new test: a wall with a skirting board on each side, and both boards' tops must have no buried texels. It failed before the fix and passes after (18/18). Typecheck passes.
- Survival Town rebaked in the dev server (17 s). `../inside/views.mjs` shows the north house's living room from three spots: before in `../skirting/before/seam.png` (a white line along the skirting), after in `../skirting/after/`, where the line is gone along every wall. The one bright stretch left is under a window, where low sun really falls on the floor and the board. No page errors.
