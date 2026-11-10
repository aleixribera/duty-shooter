# Particles and muzzle flash

Status: resolved
Release: v2.161.0

Spec: `../spec.md`

Particles are unlit round discs. Textured puffs with soft depth fade and sun tint, per-weapon muzzle flashes, impact bursts that read per material, grenade blast with a shock ring and lingering smoke. Keep pools and the WebGL2 path.

## Comments
- v2.145.0: particles rebuilt in `effects.ts`. Five kinds: puff (smoke and dust: a billow cut from the sky's noise, lit by the sun and sky, breaking into wisps as it ages, hazed, fading where it meets a wall), chip (solid fragments, splinters for wood, drops for blood), spark (a streak along its own flight), flame (white heart, used for the fireball, metal strikes and Crash's fires), ring (a blast's shock). Each puff is lit by whether the sun reaches where it was thrown up (one ray per impact).
- Impacts read by material: metal and glass spark with a flash at the strike, wood splinters, loose ground throws a taller column and takes a small pock instead of a cracked hole, masonry puffs and chips. The bullet hole has a ragged core, a chipped ring and cracks.
- The frag: white flash, shock ring, fireball, sparks and slower embers, dust driven out along the ground, a smoke column that hangs about five seconds, grit, a scorch.
- The muzzle flash is three ragged tongues round a white heart, a new shape about every frame; every shot leaves a wisp.
- Checked on WebGPU and `?webgl` (frag on Crash, metal on Switchyard, sand on Crash, a burst on Survival Town); no console errors; soft particles work on both (the depth copy is only paid while a puff or flame is alive).
- Left: a flash and smoke sized per weapon. It needs the weapon passed at the three `flash`/`shot` call sites in `game.ts`, which the sound work is rewriting now; done when that lands.
- v2.161.0 (owner): the flash and smoke are sized per weapon (`MUZZLE` in `effects.ts`): the shotgun and sniper throw the biggest flash and the most smoke, the SMG and pistol the smallest; the Magnum stays near a rifle's size, since a handgun's muzzle sits near the middle of the view and a big flash there hides the target. The shot light's strength follows the same table.
- Found while checking it: a flash, and the shot light, aged by the frame's dt before that frame was drawn, so under about 28 fps the flash was never seen and the light never reached full strength. New effects now start at age -1 and are first drawn at full strength. `muzzle-flash.test.ts` fails on the old ageing at 1/20 s and 1/8 s frames and passes now. Seen in held frames at the Practice Range for the M4, LMG, Magnum, shotgun, sniper, SMG and DMR; the pistol's frame is too short for the capture script to hold, so its flash is covered by the test only.
