# Rocks have a larger invisible hitbox than their model

Status: resolved
Release: v2.121.0
Blocked by: none
Labels: bug, high priority

Owner: "FIX THE COLLISIONS! Almost all rocks have a larger invisible hitbox than they should."

Lead's first look: `zero-island-cover.ts` makes each rock a box (width x depth x height, `rocks()` / `single('rock', ...)`), and `zero-island-plants.ts` dresses it with a rounded boulder model (`rock-a`, `rock-b`, `rock-strata`) scaled to that box. The box corners and top edges stick out past the rounded mesh, so players and bullets stop on air. Check the same for trunks and every other kit model dressed over a cover solid.

Fix so the solid matches what's seen within a few cm (e.g. collider shapes fitted to each model from its Blender mesh, or several smaller boxes/a hull per model), for movement, bullets, grenades and bots' sight alike. Rebuild nav. Regression test: for every kit model, no point of its solid sits more than a small tolerance outside the mesh. Verify in game by walking into and shooting the edges of rocks in every Region.

## Comments

Implementer (ticket 63 fix):

- Cause, measured: every rock and trunk collided as the whole box its model was scaled into. The rounded boulders left that box's corners and top edges empty: at the largest a rock is placed, a point of its solid stood up to 5.1 m outside the mesh; the 5-sided trunks' boxes stood out 0.33 m (pine) and 0.65 m (broadleaf). Nothing else is dressed over a cover solid on the island (Crash's Map models were already held to 5 cm).
- Fix, two halves. The rocks are now modelled as jointed stone (`tools/map/vegetation.py`, `jointed()`): 3 or 4 bevelled, lightly pitted blocks per rock, so a few boxes can fill one honestly; trunks are octagons turned a half-step. Then `tools/map/fit-solids.mjs` reads each model out of `vegetation.glb`, voxelises it (winding rule, so overlapping blocks are their union) and greedily fits up to 4-5 boxes that stay inside it, writing `apps/range/src/map/kit-solids.ts`. `cover()` in `zero-island.ts` stands those boxes scaled and turned with the instance (`fittedSolids`), and the `Dresser` picks each rock's or trunk's model before its solids exist, so the boxes and the drawn model agree. Rerun `node tools/map/fit-solids.mjs` after any change to the kit's rocks or trunks.
- Boxes per model: rock-a 2, rock-b 4, rock-strata 3, each trunk 4. Solids on the island 9,246 -> 25,417; the map still builds in about 2.6 s and every soak's tick budget holds.
- Regression test `apps/range/test/kit-solids.test.ts`: per model, no sampled point of any box is more than 5 cm outside the mesh at the largest the map scales it on each axis (was 5.1 m / 0.33 m / 0.65 m, red before the fix); the boxes fill > 85% of a rock and > 55% of a round trunk; every instance's boxes stand where its model stands. Surface gap where the mesh stands out past the boxes, at a 5 x 3 x 5 m rock: median 1-4 cm, p90 5-19 cm.
- Sightlines got a little longer where the empty corners used to block (land view median 20 -> 30 m, still under the 35 m bound; Ground Zero 20 -> 30 m); the cover and sightline tests pass unchanged except "never floats", which now lets a strata ledge rest on the block under it.
- The nav rebuilt itself; the 60-bot soak caught one bot falling off the Neon-Harbor bridge's deck into the sea in a cover move (the shifted layout put a fight there). Bridges had no edge at all, so each now has a 0.9 m parapet down both edges. Soak green.
- In the real game (`edges.mjs`, shots in `.scratch/battle-royale/shots/t63/edges/`): walked with real keys into the corner of a rock in all six Regions and a trunk in Frostbite and the Jungle. Each walk ended against the visible surface, 0.11-1.84 m past where the old box stopped a body. Real shots at the old box's empty top corner hit nothing, and shots at the body hit the model 0.5-0.9 m from the eye of a player pressed against it. Ground Zero, the Dustlands, Neon City and the Harbor have no trunks to test.
