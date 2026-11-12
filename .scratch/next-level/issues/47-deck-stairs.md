# The deck stairs are boarded, not a blank wall

Status: resolved

Release: v2.185.3

Spec: `../spec.md`

From the fresh capture of 2026-11-12 (`../reviews/2026-11-12c/04-play-start.jpg`): the Bot Match spawn behind Survival Town's north house looks straight at the stairs up to the back deck. Their solid side was painted in the house's `trim` (an untextured off-white, 0xf3efe4), so in sun the brightest and flattest thing in the yard was a blank stepped wall, next to textured siding, grass and fencing. It read as placeholder geometry.

## Comments

**v2.185.3.** The deck stairs' sides take the deck's own boards (`deck`, the `floor` family that the deck and the treads use), so the stair reads as a boxed-in timber stair. The geometry, the collision and the inside stairs are unchanged.

Verified:
- `../stairs/look.mjs` walks Survival Town alone and shoots the stairs square-on and at an angle from the back yard: `../stairs/before/` (white stepped wall) and `../stairs/after/` (vertical boards). No console errors.
- `apps/range` typecheck and `survival-town.test.ts` (92/92) pass.

Left: real deck stairs would have open stringers and risers. That changes the collision and the bots' nav, so it is a ticket of its own if the picture still asks for it.
