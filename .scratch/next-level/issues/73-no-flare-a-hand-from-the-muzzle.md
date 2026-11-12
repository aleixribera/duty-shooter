# No flare a hand from the muzzle

Status: resolved

Release: v2.187.22

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its weakest point and first defect (05, top right): "the undersides of the stair treads and the long stringer crossing the frame are a flat, saturated tangerine, as bright as a face in full sun, though they face the ground."

## Comments

- **Only on a shot.** `../stair-under/look.mjs` stands the player under and beside the north house's deck stairs, still and mid-burst (`before/`).
  - Still, the tread undersides are dark brown (about 49, 31, 11), as the deck's underside is.
  - The review's 05 is a firing frame, and its treads sit a hand over the muzzle.
  - Fired from beside the stairs (`before/fire.jpg`), the handrail beam that ticket 70 had removed came back along the rail, and the tread edges near the gun lit up.
- **Why.** The flash's light falls off as a point light does, with no size of its own. A surface 15 cm from it took about 140 times the sun's light for that frame, against 15 times at 0.6 m. Ticket 70 moved the light out of walls, which kept it, if anything, closer to them.
- **What changed.** `flashClearance` (`effects.ts`) finds the nearest surface within 1 m of where the light sits:
  - It measures the exact distance to every bullet-blocking solid in the map's index round it, rotated ones included, and to the ground.
  - It dims the light so that surface takes no more than one a metre off would. In the open nothing changes.
  - The smoke round the muzzle still glows at the flash's full power: it is lit from inside, however near a wall.
- **After** (`after/fire.jpg`; `../stair-under/sheet.jpg` sets it beside the before frame):
  - Mid-burst at the stairs, the rail is plain cream, with no beam.
  - The treads keep their own shade.
  - The casings are brass rods, without the glowing outline of the review's second defect.
  - In the open (`after/open.jpg`), the flash and its light read as before.

A second-opinion review checked the falloff (three.js divides by max(d^1.6, 0.01) inside the 9 m window, so the bound holds), the start inside a solid, the terrain, the cost, and that the test fails without the fix. It raised one real gap: the first version sampled the nearest surface with 14 rays (the axes and the cube's corners), and a 6 cm handrail running past the light off those lines slipped between them, the very case of the review. The check is now the exact distance described above, which also covers walls turned off the axes and props. A test holds the rail case.

Verified:
- The `fps-client` typecheck passes.
- `muzzle-flash` passes (7/7). Its new test covers a tread 15 cm over the light and a rail off every axis, both kept to the 1 m level; the smoke glow at full strength; and nothing dimmed in the open.
- Before/after frames from the same spots, still and mid-burst, with no page errors.
