# Atmosphere on everything

Status: resolved

Release: v2.144.0

Spec: `../spec.md`

Soldiers, map models, guns, decals and particles skip haze(), so far things pop out of the air. Haze on the probe-lit model, a height term, the environment map from the map's own sky, and the viewmodel's light rig from the map's sun.

## Comments

- Haze now thins with height (falloff 0.011 a metre, integrated along the ray), so a peak stands clear of the air a valley sits in. Same strength as before for a level look at ground height, so the maps' `haze` numbers keep their meaning.
- Everything lit by the probes (soldiers, map models, props, casings) passes through the same haze as the walls.
- Reflections come from the map's own sky, sun and ground (one PMREM per `Lighting`, made on first use) in place of three's grey studio room; strength 0.2 to 0.3.
- The gun's light rig takes its colours from the map's light, part-way to white (key 0.8 toward the sun's colour, fill 0.6 toward the sky, rim 0.5 toward the zenith).
- Particles and decals are left to ticket 05, which rebuilds their materials anyway.
- Not done: the gun's key light still comes from a fixed side, not from where the sun stands. Goes with ticket 10 (viewmodel motion).
