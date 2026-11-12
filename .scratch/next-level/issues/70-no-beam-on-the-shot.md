# No beam on the shot

Status: resolved

Release: v2.187.19

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12e.md`), its third defect (05, top right): "the white handrail along the deck stairs blooms into a glowing beam from the top centre to the right edge, with a hot spot where it meets the stringer; it reads as light leaking through a seam."

## Comments

- **Only on a shot.** `../rail/rail.mjs` stands the player at the review's spot, pressed against the north house's stair stringer and looking up the stairs, and shoots it still and mid-burst (`../rail/b2/`).
  - Still, the rail is a plain cream rail against the sky.
  - Mid-burst, it turns into the review's glowing beam, with a white flare at the stringer.
- **Two causes:**
  - **Bloom across the whole frame.** Each shot lifted the bloom from 0.1 to 0.6, so for that frame every bright edge flared six times as much as usual, the sunlit rail along with the flash.
  - **The flash's light through the wall.** The muzzle flash's light sits 0.6 m ahead of the eye and casts no shadow. With the muzzle pressed against a wall, it could sit on the far side and light whatever was beyond through the wood.
- **What changed:**
  - A shot lifts the bloom by 0.12 at most (it was 0.5). The flash itself still flares; the rest of the frame barely changes.
  - The light is kept 12 cm short of any wall between the shooter's eye and where it would sit (`Effects.shot`, which now takes the eye), so it always lights the shooter's side.
- After (`../rail/after/fire.jpg`, `../rail/rail-zoom.jpg`): mid-burst at the stringer looks like the still frame. The rail is plain cream, with no beam or halo, there is no flare at the stringer, and the treads beyond aren't lit through the wood.

A second-opinion review found the first wall check didn't work for your own shots. It cast from `origin`, and for your own gun that is the viewmodel's muzzle, drawn 0.7 to 1.1 m ahead of the eye. Pressed against the stringer (the body is about 0.38 m wide), that muzzle is already past the wood, so the ray found nothing. The check now casts from the eye, which `game.ts` passes for your own shots and for a player watched through their eyes; for other players `origin` already is the eye. The review confirmed the rest: `raycastWorld`'s `t` is a fraction of the segment, the smoke glow is the only other reader of the light's position, the extra short ray per shot is negligible beside the 60 m sun ray `shot()` already casts, and nothing depends on the old bloom factor.

Verified:
- The `fps-client` typecheck passes.
- `muzzle-flash`, `bullet-holes`, `ambient-fire` and `probe-lit-smoke` tests pass (14/14).
- Shots before and after from the same spot, still and mid-burst, plus one firing in the open (`../rail/after/open.jpg`), with no page errors. The flash still reads in the open. `../rail/sheet.jpg` compares them.
