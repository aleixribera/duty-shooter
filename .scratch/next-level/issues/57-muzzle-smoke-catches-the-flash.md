# Muzzle smoke pale, and lit by the flash

Status: resolved

Release: v2.186.9

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, game feel): the firing frame (05) "shows no readable muzzle flash at the barrel". Ticket 56 lit the smoke by the room round it, and that left a second fault: indoors, a burst's haze was a dark grey smudge over the sights, darker than the plaster behind it.

## Comments

**The flash.** It renders. `../flash/burst.mjs` holds the trigger on Survival Town and takes eight frames back to back, round the sights:
- in the yard, 4 to 5 of 8 frames show the flash;
- in the north house, 3 of 8 show it, and the room lights up with each one.

A flash is on screen for 35 ms of each 80 ms between rounds, so a single frame often falls between two. The review's 05 was one of those. Nothing to fix in the flash itself.

**The indoor haze.** Measured in `../flash/before/inside-*.jpg`: the darkest smoke near the sights was about (78, 74, 73) sRGB, against (134, 115, 89) for the wall behind it, roughly half as bright. The muzzle smoke's own shade was a mid grey (`0xb4b6b8`). In a room lit to the walls' level, that drew darker than plaster. Two changes in `effects.ts`:
- **Shade.** Muzzle smoke is now pale (`MUZZLE_SMOKE`, `0xd6d6d4`), as burnt powder's is. In `../flash/after/inside-*.jpg` the haze near the sights now reads at the wall's own level: the darkest patch near the sights is (114, 94, 64).
- **The shot's light.** The smoke catches the shot's light. The walls already got it from the shot's point light, but puffs are unlit quads, so they stayed dark while the room flashed. A shared `shotGlow` uniform now carries the strongest lit shot light's position and strength. Puffs add an orange-white glow that falls to half 0.55 m from it, so smoke at the barrel lights with each round. The glow reaches every puff layer, including dust, blood, grenade clouds and fire smoke, but at 5 m it is down to about 2 %. It is zeroed when the effects are disposed. On screen this is modest: in the yard it shows as a warm halo in the smoke beside the muzzle, merged with the flash's bloom (`../flash/glow-zoom.jpg`).

Outdoors (`../flash/after/yard-*.jpg`) the haze is now pale wisps against the siding, where before it was grey ones. The flash is unchanged.

Verified:
- Typecheck passes.
- A second-opinion review of the diff found no defects. It checked: the puffs' world position, the shared uniform, and how the update loop picks the light.
- `muzzle-flash.test.ts` passes (6/6), including a new check: a rifle shot sets the glow to about 1 at the shot light's position (0.6 m along the barrel), and it is out (0) within 0.1 s.
- `probe-lit-smoke.test.ts` passes (5/5).
- `../flash/burst.mjs` ran before and after at `inside=3,-19,1.571` and `yard=-3,-43,3.1416`. No page errors.
- The puffs are an instanced mesh. Three's `Instance.js` sets the local position from the instance matrix, so `positionWorld` places each puff, not the mesh's origin. Only one `Effects` exists at a time (`game.ts`), so a module-level uniform is safe.
