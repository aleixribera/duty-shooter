# Painted plaster in the rooms

Status: resolved

Release: v2.187.5

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, Picture): in `05-firing.jpg`, "walls and ceiling are the same blotchy brown plaster so the room reads as the inside of a cardboard box". Every room in Survival Town, Switchyard and Station Nine's houses was mottled with dark blotches about half a metre across, on the walls and the ceiling alike.

## Comments

**v2.187.5.** The rooms' walls and ceilings now read as smooth painted plaster with a faint grain.

The colour was never the problem: the plaster's albedo varies by only 3%. The blotches came from its relief. Plaster reads the `stucco` tile, whose height is mostly a half-metre noise. That relief leaned the normal, which the lighting turns into light and shade on a wall (`SKY_LEAN`), and it darkened the low places as crevices by up to 30%. So a painted wall was drawn as rough render.

A new `RELIEF_STRENGTH` in `surface-materials.ts` scales, per family, how far the relief leans the normal and how much its hollows darken. Plaster is at 0.3; every other family is at 1 and unchanged, including worn plaster (Station Nine's bunker), which keeps its render.

Verified:
- Typecheck passes for `fps-client`.
- `surface-detail.test.ts` and `surfaces.test.ts` pass (33/33).
- `../rooms/look.mjs` shot the north house's ground floor at the spot ticket 59 used:
  - before: `../windows/after/inside.jpg` (mottled walls and ceiling);
  - after: `../rooms/after/inside.jpg` (smooth walls and ceiling, the corners' shading from the bake now reading).
  - No page errors.

Not done here: the walls and ceiling are still close in tone. The ceiling's finish is a lighter cream, but in a dim room both take the same warm bounce light.
