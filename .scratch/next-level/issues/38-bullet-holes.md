# Bullet holes read as dents, not stickers

Status: resolved

Release: v2.179.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, picture 5/10): bullet holes were black blots with spider-leg cracks (`../reviews/2026-11-12/07-play-mid.jpg`). On a painted wall in sun they showed as orange discs with dark legs, and in shade as blue-black blots.

The cause: a hole was a lit decal. It took the scene's own lights but not the wall's baked light, so in shade it went darker and bluer than the wall it sat on. Its texture was a soot disc, a pale ring, five cracks and a black core, the same for every hole.

## Comments

**v2.179.0.** Each hole now multiplies the surface under it by twice its texture, where 0.5 leaves the surface unchanged (a ×2 modulate, the classic way to do bullet-hole decals). So a hole carries whatever light its wall has: sun, baked shade or a dark room. `DecalLayer`'s `modulate` mode in `effects.ts`; blood splats are unchanged.

The texture is four holes, two by two, and each decal's slot picks one. Each hole is drawn from a height field:
- a ragged outline from smoothed random radii;
- a crater of paler, knocked-off material, shaded as a dent lit from above;
- a small dark core;
- a thin dust haze and a few chips.

On walls the texture's up runs up the wall, give or take 15°, so the crater's lit lower lip and shadowed upper lip always face the right way. On floors it lies any way round.

The per-material tint now colours only the crater. Metal and sheet metal are near white (bright bare metal), and wood is a paler raw wood. Loose ground keeps its dark brown pock.

Verified with `../holes/holes.mjs`: six shots each into a sunlit painted wall (the north house) and a shaded sheet-metal wall on Survival Town, with the screen and a 2× crop at each, before and after (`../holes/before/`, `../holes/after/`). Before: orange discs with spider legs in sun, black blots with legs in shade. After: six different ragged craters with a dark core, pale lit lower lips and shadowed upper lips, in sun and in shade alike. The two tests that build the effects pass, and so does the typecheck.

Along the way: the first outline (low sine harmonics) gave three-pointed stars, then identical flowers once the decals stood upright. Smoothed random radii and four tiles fixed both.
