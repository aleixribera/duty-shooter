# The indoor stairs are plastered and edged

Status: resolved

Release: v2.186.2

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, picture 5/10, where the weakest point is the inside of the houses). In `../reviews/2026-11-12d/05-firing.jpg` the indoor stairs were "plain beige boxes with no texture and no step edges". They were the flattest thing in the room.

## Comments

**v2.186.2.** The inside stairs of both Survival Town houses used to wear the trim paint on every side face, so their open side was a flat off-white sawtooth.

Now:
- The open side is plastered like the room's walls. In the stairs' `Look` this is `edge: 'wall'`: each step's long faces count as its `edge` in `finishOf`.
- A painted skirt board, 10 cm high, runs along that side cut to the steps: one decoration per step on its open face, at its top. Without it, the plastered side melted into the wall behind when seen square-on.
- The risers keep the trim paint and the treads keep the floor boards.

`Builder.stairs` now returns its steps, so a map can trim them. Collision, nav and bullets are unchanged: they are the same boxes.

Verified:
- `survival-town.test.ts` and `map.test.ts` pass (119/119), including decorations staying within 5 cm of their solid. Typecheck passes.
- `../inside/views.mjs` walks the north house alone from two spots: square-on from the room (`3,-19,1.571`) and from near the stair foot (`2.5,-15,0.9`). Before: `../inside/before/`, a flat beige wedge. After: `../inside/after/`, a plastered stair with a stepped white skirt and wooden treads. No page errors.

Left from the same review, for later passes:
- The dashed white line where the room's wall meets the floor (05, lower middle).
- A strip of sky at the stairwell's edge (05, top left).
- The flat maroon window shutters (08).
- Teammate arrows with no names (08).
