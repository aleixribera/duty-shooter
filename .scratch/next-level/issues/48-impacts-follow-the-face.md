# Impacts follow the face that was hit

Status: resolved

Release: v2.186.0

Spec: `../spec.md`

From the fresh capture of 2026-11-12 (`../reviews/2026-11-12c/05-firing.jpg`): a burst into a room's wall in Survival Town threw long brown splinters and left tan craters out of what is drawn as plaster. A house's outer wall is one `wood` solid with siding outside and plaster on the face that looks into the room. An impact took its dust, chips, hole tint and sound from the solid, so every room wall in town shot like bare timber.

## Comments

**v2.186.0.** `surface-hit.ts` (`SurfaceHits`) files the map's laid-out faces, the same ones the renderer draws, in 4 m cells. For an impact it finds the face the point lies on: within 3 cm of its plane, facing the way the hit's normal does, and no more than 1 cm past its edges. At a seam, a face that holds the point wins over one the point is just past. Its finish family then names the material the impact shows and sounds like:
- plaster, worn plaster or tile: `plaster`;
- brick: `brick`;
- concrete: `concrete`;
- siding, floor, fence or shingles: `wood`;
- sheet metal: `sheetMetal`.

Any other finish (paint, plastic, a window's `room` interior and the rest), a modelled solid, terrain or no face keeps the solid's material. Penetration and damage are unchanged; the simulation still reads the solid. `WorldView.hits` holds the lookup, and `Game`'s impact handler asks it before `effects.impact` and the impact sound.

Verified:
- `test/surface-hit.test.ts` (new, 5 tests): a wooden wall reads plaster on its room side and wood on its siding. A painted top, a point off any face and a point away from the wall keep the solid's material. At a seam between a boarded floor and a flush concrete pad, each side reads as its own.
- `fps-client` typecheck passes.
- `../plaster/shoot.mjs` walks Survival Town alone and fires three single shots into the room side of the north house's east wall, catching the debris 90 ms after each. Before: brown wood dust and tan-rimmed holes (`../plaster/before-sheet.jpg`). After: pale plaster dust and plaster holes (`../plaster/after-sheet.jpg`). No console errors.

A second opinion (a subagent reading the diff and probing the real maps) found two problems, both fixed before release:
- **Seams took the neighbouring face's material.** The edge slack was 1% of a face's length, up to 18 cm on a big floor, and on a tie the later face won. Probing 2 mm inside every face's edges found 57 wrong of 18,920 points on Survival Town, 34 of 6,670 on Switchyard and 1 of 1,570 on Station Nine. The fixed 1 cm margin, with containment winning, brings all three to 0.
- **`room` (a window's fake interior) was mapped to plaster.** It is now left out, so the solid's material decides.

It also measured the lookup's cost: 6,688 faces on Survival Town build in 5.4 ms, and Zero Island (almost all modelled) in 1.8 ms.

What changes, per the probe: plaster on wooden, brick, concrete and sheet-metal walls' room faces (Survival Town 122 faces, Switchyard 134, Station Nine 47), and wooden floor tops on a few metal flatbeds.
