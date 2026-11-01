# 0007 Terrain is a heightfield beside the solids, sampled at the hull's centre

Status: accepted (2026-11-01, Battle Royale spec, ticket 04). Extends 0001 and 0002, and takes up the slope physics 0002 left out.

## Context

Zero Island is a kilometre-wide island with hills, rivers and a shore. Boxes can't carry that without a coarse staircase, and 0002 ruled out mesh collision for reasons that still hold. Ground that rises and falls also needs what 0002 said a future map would force: true slopes, with ground too steep to walk up and sliding down it. Sixty seats (a hundred in the end) move at 60 Hz, on the server and in every client's prediction, so a query has to cost nanoseconds, not a sweep.

## Decision

- **A second collision primitive.** `World.terrain` is a `Terrain` built from plain `TerrainData`, or null. A map with none runs the code it always ran: the six golden match hashes didn't change.
- **Heights at grid corners, two triangles a cell.** A cell splits along the diagonal from its (x+1, z) corner to its (x, z+1) corner. Whatever draws the terrain has to split it the same way, or a player stands above or below what they see.
- **One sample, under the hull's centre.** Movement asks for the height under the hull's centre, not its corners. That is constant time and can't catch on a small bump. On a slope the hull's uphill edge sits in the ground and its downhill edge hangs over it, by up to the hull's half width times the gradient, and only the drawn feet can show that. Solids still collide with the whole hull.
- **Terrain stops falls and never rises.** Upward moves ignore it, and feet that begin a move below the ground come straight up to it, which only a spawn or a lunge can cause.
- **The slope limit is 45 degrees**, by the squared gradient of the triangle underfoot. Rising onto steeper ground, or more than a step height at once, stops a move like a wall, and it carries on along the face if it can. Going down or across a steep face is free, so nobody is stuck on one.
- **On steep ground a player slides.** They aren't grounded and can't jump. Velocity follows the slope, capped at `slopeSlideSpeed`. A fall that ends on a steep face still counts as a landing, but a long slide doesn't count as a fall.
- **Water is a second corner grid**, its surface below the ground where it's dry. Feet at least `wadeDepth` under it wade: slower, with their own footstep. There's no swimming. The client works it out from a position, so it adds nothing to the protocol.
- **Nothing goes through the ground.** It stops every bullet whatever its material, grenades bounce off it, and it hides people. A hit on it names `TERRAIN_HIT` in place of a solid's index.
- **A mantle reads terrain as a bank.** A steep rise within reach, with walkable ground at the top inside a mantle's height bands, is a ledge. A slope a player can walk has no bank, so jumping on it stays a jump.
- **Outside the rectangle there's no ground at all.** A map closes its terrain with a Boundary, as it would any edge.

## Consequences

- A height sample takes about 50 ns on the home server, a 100 m sight ray about 1.5 µs. A tick of 60 running seats cost no more on terrain than on one flat solid (0.33 ms against 0.36 ms). `BENCH=1` on `terrain.test.ts` measures it again.
- A mantleable bank needs cells of about 1 m: at 2 m a 1.2 m rise spreads across a whole cell, under the slope limit, and is walked instead. Coarser cells are fine where nobody climbs.
- A steep triangle smaller than a step blocks walking until the player jumps, so a sculpted map keeps its roughness under the slope limit.
- A pit with only steep sides traps a player. Nothing stops an author making one, so a map's own tests have to.
- Nav and the lighting bake still know only solids. Ticket 06 teaches nav the terrain, and ticket 10 teaches the bake and draws it.
