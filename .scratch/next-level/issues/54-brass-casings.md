# Brass casings, not black rods

Status: resolved

Release: v2.186.6

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, game feel): "the ejected cases are two black rods". Firing outdoors, a spent case that turned away from the sun flew as a black stick past the gun.

## Comments

**v2.186.6.** The casings are now brass in shade as well as in sun.

The cause was the material: fully metallic (`metalness: 1`). A pure metal has no diffuse light, only reflections. A case facing away from the sun reflected only the dim environment, since the scene's environment intensity is 0.3, so it went close to black. The fix is in `Effects` (`effects.ts`):
- metalness is now 0.8, so a little diffuse light wraps round the case;
- roughness is now 0.36;
- a faint warm emissive keeps the shaded side brown-gold rather than black.

The sunlit glint is unchanged.

Verified:
- Typecheck passes.
- `../casings/fire.mjs` fires a 260 ms burst on Survival Town and takes three frames. It ran from two spots: inside the north house, and outside by the garage looking down the street.
  - Before (`../casings/before/outside-1.png`): a black rod by the garage.
  - After (`../casings/after/outside-*.png`): the cases read brass-brown outdoors.
  - Indoors (`../casings/after/inside-1.png`), the case is gold and not over-bright.

A lead for a later pass: outdoors, firing scatters thin white elliptical streaks across the sky in the frames. Where they come from (sparks or flash particles) wasn't traced here.
