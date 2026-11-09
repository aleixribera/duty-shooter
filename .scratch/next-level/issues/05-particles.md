# Particles and muzzle flash

Status: open

Spec: `../spec.md`

Particles are unlit round discs. Textured puffs with soft depth fade and sun tint, per-weapon muzzle flashes, impact bursts that read per material, grenade blast with a shock ring and lingering smoke. Keep pools and the WebGL2 path.

## Comments
- v2.145.0: particles rebuilt in `effects.ts`. Five kinds: puff (smoke and dust: a billow cut from the sky's noise, lit by the sun and sky, breaking into wisps as it ages, hazed, fading where it meets a wall), chip (solid fragments, splinters for wood, drops for blood), spark (a streak along its own flight), flame (white heart, used for the fireball, metal strikes and Crash's fires), ring (a blast's shock). Each puff is lit by whether the sun reaches where it was thrown up (one ray per impact).
- Impacts read by material: metal and glass spark with a flash at the strike, wood splinters, loose ground throws a taller column and takes a small pock instead of a cracked hole, masonry puffs and chips. The bullet hole has a ragged core, a chipped ring and cracks.
- The frag: white flash, shock ring, fireball, sparks and slower embers, dust driven out along the ground, a smoke column that hangs about five seconds, grit, a scorch.
- The muzzle flash is three ragged tongues round a white heart, a new shape about every frame; every shot leaves a wisp.
- Checked on WebGPU and `?webgl` (frag on Crash, metal on Switchyard, sand on Crash, a burst on Survival Town); no console errors; soft particles work on both (the depth copy is only paid while a puff or flame is alive).
- Left: a flash and smoke sized per weapon. It needs the weapon passed at the three `flash`/`shot` call sites in `game.ts`, which the sound work is rewriting now; done when that lands.
