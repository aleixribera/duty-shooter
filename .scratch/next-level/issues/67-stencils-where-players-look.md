# Stencils where players look

Status: resolved

Release: v2.187.16

Spec: `../spec.md`

From the fresh review of 2026-11-12 (`../reviews/2026-11-12e.md`). Identity still scored 5, the lowest. Ticket 66's stencils couldn't be read in any frame: the review's spawn shot (`04`) looks at the houses' backs, and in `06` the street front was at the frame's edge. In play, the only things saying "test range" were the "T-" clock and one barrier. The review's fix: put stencils on the faces a player sees from the spawn and the street, large enough to read from 20 m.

## Comments

- **The houses' backs**, facing each team's spawn:
  - "STRUCTURE 1" and "STRUCTURE 2" in 0.38 m capitals (the fronts' are 0.24 m), high on the garage's back wall at its west end, over the air conditioner.
  - The first shots had the deck stairs' handrail crossing "STRU" on both houses, from the spawn side. Moving the number 0.65 m west and a little up cleared it.
  - Under the deck, between the back door and the window's shutter: the survey mark in 0.32 m capitals, with this wall's own bearing and distance to ground zero. The north house reads GZ 073° / 1,440 FT. A deck post can cover a digit from some angles; a step aside clears it.
- **The school bus**, the street's centrepiece: "CIVIL EFFECTS TEST · VEHICLE 14" in black on both flanks, in the yellow band between the rub rails. On the curb side it stops short of the folding door. Each flank reads left to right from its own side.
- `toGroundZero()` works out each survey mark from the wall it is painted on, so the back's mark differs from the front's as it should.

A second-opinion review checked the faces and yaws, the bus transform (it matches `Frame.at`), the clearances (0.16 m each side of the survey mark, 0.35 m short of the bus door, inside the rub-rail band) and the strings, and found no defects. It flagged two comments that misdescribed the placement; both are fixed.

Verified:
- The `range` typecheck passes.
- `survival-town` and `map` tests pass (119/119).
- `../windows/look.mjs` shots in the light Chrome, with no page errors:
  - `../stencils/scale/` has both backs and both bus flanks. The bus reads cleanly from the south and is unmirrored from the north.
  - `../stencils/scale2/sheet.jpg` is after the move: both garage numbers sit clear of the stairs. From the north spawn, the survey mark reads under the deck at full size.
