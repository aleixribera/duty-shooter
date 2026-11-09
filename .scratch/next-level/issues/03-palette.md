# Palette pass on every map

Status: resolved

Release: v2.148.0

Spec: `../spec.md`

Neon lawn, static-noise gravel (albedo swings 2.4x on a 2 m tile, surface-materials.ts), pure-blue and pure-red cars in Neon City, orange skin. Retune finish colours per map toward the bleached test-site palette; keep team colours and signal colours readable.

## Comments

First pass (v2.143.0): open ground's relief now swings its colour 0.74 to 1.1 instead of 0.5 to 1.22 (the gravel's television static), and Survival Town's lawn is a drier green. Still to do: Neon City's pure-blue and pure-red cars, skin tone, Mutant Jungle's teal floor.

Second pass (v2.148.0): Neon City's car paints are sun-bleached (a slate blue, a brick red, a dull ochre; the crates on the pavement follow), rebuilt into `neon.glb` from `tools/map/regions/neon.py`. Mutant Jungle's floor is a moss green (0x4b5a2e): the old cool green turned teal under the violet sky. Signs, tubes and lit windows are untouched; they are the Region's signal colours. The skin tone is the soldier's own ticket (06). Seen in the game at the Neon City and Mutant Jungle spots.
