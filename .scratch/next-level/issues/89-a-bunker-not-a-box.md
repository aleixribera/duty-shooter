# A bunker, not a box

Status: resolved

Release: v2.187.42

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12g.md`), its fifth defect (08, x 1172-1448, y 538-608): "the desert bunker is an untextured smooth beige box with a flat grey door and no frame; its four window slits are ragged black blots with stair-stepped edges, not openings."

## Comments
- 2026-11-12, pass 5: the bunkers are map models, and a model carries only a flat colour per vertex plus baked occlusion, so the concrete family's pattern never reached them: a smooth beige box. The slit's dark back lay in the wall's own face and fought it for the pixels (the ragged blots), and the door stood flat on the wall. Rebuilt `bunker()` in `tools/map/survival-town.py`: the slit is a 30 cm recess with a lit sill and three posts, the door sits at the back of a 30 cm reveal in a steel frame on a threshold step, and the walls are board-formed concrete: lift joints every 60 cm, plywood form joints every 2.4 m, each pour a shade apart, rain streaks run down from under the slab, dust up the foot. That detail is cut into the walls' outside faces (`form_cuts`, through a new `cut` hook in `mapkit.Kit.asset`) and baked per vertex into the colour's alpha (`weather`); `map-models.ts` multiplies a model's colour by it. Darkening the occlusion instead barely showed: models take baked shade on only 45% of the sun, and bright beige sits on the tone curve's shoulder.
- Cost: the two bunkers go from 4.8k + 3.0k to 16.5k + 10.2k triangles; `survival-town.glb` 2.89 MB to 3.34 MB. Every other map GLB has alpha 1 throughout, so no other model changes.
- Checked: frames from `bunker/look.mjs` at the review's range, 12 m off the slit face and the door end (`bunker/before|after/`, `bunker/sheet.jpg`: range and slit face before and after, the door after; the first door frame faced away, so it has no before), the survival-town-models tests (within 5 cm of the solids: 0.04 m), the fps-client typecheck and a new map-model-weathering test.
- A second-opinion review found the reveal's side walls starting at the ground, in the same plane as the plinth's ends, so a 22 x 48 cm patch each side of the doorway would flicker; they now stand on the plinth. It also found the frame's head overlapping its jambs (now between them) and hard corners (posts, the slit's ends) taking their wall from a vertex normal that splits the difference; each vertex now takes the facing of an outside wall face it belongs to.
