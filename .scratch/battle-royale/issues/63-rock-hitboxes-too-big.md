# Rocks have a larger invisible hitbox than their model

Status: open
Blocked by: none
Labels: bug, high priority

Owner: "FIX THE COLLISIONS! Almost all rocks have a larger invisible hitbox than they should."

Lead's first look: `zero-island-cover.ts` makes each rock a box (width x depth x height, `rocks()` / `single('rock', ...)`), and `zero-island-plants.ts` dresses it with a rounded boulder model (`rock-a`, `rock-b`, `rock-strata`) scaled to that box. The box corners and top edges stick out past the rounded mesh, so players and bullets stop on air. Check the same for trunks and every other kit model dressed over a cover solid.

Fix so the solid matches what's seen within a few cm (e.g. collider shapes fitted to each model from its Blender mesh, or several smaller boxes/a hull per model), for movement, bullets, grenades and bots' sight alike. Rebuild nav. Regression test: for every kit model, no point of its solid sits more than a small tolerance outside the mesh. Verify in game by walking into and shooting the edges of rocks in every Region.

## Comments
