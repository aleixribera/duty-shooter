# Muzzle smoke lit by the room, in uneven puffs

Status: resolved

Release: v2.186.8

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, game feel): firing in 05, "the smoke is a row of evenly spaced grey discs at the right edge". Firing indoors made it worse: in a dim beige room the haze was a pale blue cloud, lit by the open sky.

## Comments

**v2.186.8.** Two changes to the muzzle haze (`effects.ts`).

Lit by the light round it:
- Smoke and chip particles were lit by the scene's sky light everywhere, so indoors they glowed sky-blue against a dim room.
- Each puff and chip now takes the baked probes' light where it is born: a new per-instance `pAmbient` colour that scales the shader's ambient term.
- The tint is `ambientTint` (`surface-materials.ts`): per channel, the probe's colour plus the walls' warm dark-room fill (`INDOOR_FILL`, as the surfaces' decode adds it), against open ground, each channel capped at 1.2.
- The gun in your hands used the same rule as one brightness. That rule moved from `game.ts` into `surface-materials.ts` as `ambientScale`, unchanged, beside it.
- A puff gathers light from every side, so the tint is softened (`^0.7`) and the haze reads as a dim grey haze rather than soot-black.
- With no probes (before the bake loads, and on terrain maps such as Zero Island) every particle gets white, as before. Sparks, flames and rings are unchanged.

Uneven puffs:
- The haze puffs of each shot were the same size at the same spots along the barrel, so a burst left a row of equal discs.
- Each puff now varies its distance along the barrel and a little sideways, its size (0.6 to 1.4) and its stretch.

Verified:
- Typecheck passes.
- `probe-lit-smoke.test.ts` (new, 4/4): white with no probes and on open ground; a dark room gives a dim, warm tint; the cap; and a 20-shot burst with a fake indoor probe gives every live puff a dimmer, warm light, while with no probes they stay white.
- A second-opinion review found that the first `ambientTint` spread the fill across the probe's own colour. A buried probe reading black gave black smoke, and a near-black blue probe pushed blue to about 6. The tint now adds the fill per channel, as above, and a test covers both cases (5/5).
- `muzzle-flash` and `bullet-holes` tests pass.
- `../smoke/sweep.mjs` holds the trigger on Survival Town while sweeping the view, and takes three frames, inside the north house and in the yard:
  - before (`../smoke/before/inside-*.jpg`): a pale blue cloud in a beige room;
  - after (`../smoke/after/inside-*.jpg`): a dim grey haze of uneven puffs, not lit by the sky;
  - the yard (`yard-*.jpg`) reads as before, grey and sunlit.
  - No page errors.

Ticket 54's lead, the white streaks across the sky when firing outdoors: not a game bug. Its test spot (`-4.75,-2`) is inside the school bus, so every bullet hit the bus's sheet metal at the eye and threw sparks into the camera (`../streaks/before/`). From a spot in the open there are no streaks.

Still open from the same review: no readable muzzle flash, and no hit marker or score popup.
