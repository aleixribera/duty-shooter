# Wood chips, not cardboard

Status: resolved
Release: v2.187.37

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12g.md`), its second defect (05, centre and upper left): "two particles cross the view as giant flat cards: a grey lopsided diamond about 65 x 420 px standing straight over the crosshair ... untextured, unlit mid-grey, larger than the gun ... the shard particles (`effects.ts`, kind `chip`) thrown off the wall, with no limit on how near the camera they may pass."

## Comments

- 2026-11-12, iterate pass 2: reproduced at point-blank on the north house front in Survival Town (`../chips/look.mjs`, held fire, a frame every ~70 ms): `../chips/before/02.jpg` has a pale card across the left third of the view. The cards were wood splinters (up to 8 cm long, 6:1) thrown back along the wall's normal at the shooter, drawn at true size however near the eye they passed: one 13 cm from the camera is the review's 420 px card. Now a chip (debris and blood drops) spans at most 0.08 rad of the view along its length, and fades out between 0.4 m and 0.15 m from the camera; a first try at 0.03 rad and 0.3-0.7 m hid the splinters at arm's length altogether, so it was loosened until they read as splinters again (`../chips/after-crop-10.jpg`). The flat even tone was the other half of "cardboard": a chip now has a lit face and a shaded one, and the tumble turns which is lit. `test/chips-near-camera.test.ts` fails without the cap (a chip spanning 0.17 rad) and passes with it. Sheet: `../chips/sheet.jpg` (top before, bottom after; the before frames already had the two-face shading, so they show only the cap's effect). A second-opinion review found the eye measured from the camera's world matrix, which the game makes only at the render, so a running player's chips were measured from last frame's eye (0.1-0.2 m off, as much as the fade's whole band); it now reads the camera's position this frame, and the test walks the camera at the wall and failed before that fix.
