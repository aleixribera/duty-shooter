# The Ring reads as energy

Status: resolved

Release: v2.146.0

Spec: `../spec.md`

From battle-royale ticket 26: the Ring reads as a chain-link fence. Flowing bands, arcs, a bright foot where it meets the ground. One draw call.

## Comments

- The diamond lattice is gone: it was what read as chain-link, and no amount of tuning makes a regular grid read as energy. So are the crackle's filaments, which were the zero lines of a noise and looked like worm tracks.
- The wall is now a curtain: tall rays that drift (two scales of world-space noise pulled out vertically), pulses climbing from the foot at 13 m/s, a hot line licking along the ground in tongues, and arcs. The arcs strike a lane of the wall at a time (lanes about 44 m, an even number so the angle's seam falls between two), each a path that wanders with height, new every strike, gone in about a third of a second.
- It no longer only adds light. Additive violet over a daylit island came out pastel lavender, and the land past the wall looked washed, not lost. The wall now stains what is seen through it a dark violet (30 % and up, more in the rays and at a grazing angle) and adds its light over that: one blend (ONE, ONE_MINUS_SRC_ALPHA), still one draw call, no texture.
- The foot's core goes past the bloom's threshold on purpose, so the line where the Ring meets the ground glows from across the island. The arcs and pulses still fade over the sun's glow (ticket 53's test stands; its numbers are now the arcs').
- Same noise budget as before (six reads). Looked at on WebGPU and on the WebGL2 fallback, from 12 m, 70 m, 400 m and from outside.
