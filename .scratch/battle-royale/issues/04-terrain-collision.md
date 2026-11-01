# Heightfield terrain collision

Status: resolved
Release: v2.95.0

Spec: `../spec.md`

Spec: World engine. Headless heightfield in the core, sampled by movement and bullets, slope limit with sliding, wadeable water. New ADR. Purity and headless tests stay green.

## Comments

Decisions (ADR 0007 has the reasons):

- `Terrain` in `packages/fps-core/src/terrain.ts`, `World.terrain`, `terrain?` on `MapDefinition`. Grid corners, two triangles a cell, split from (x+1, z) to (x, z+1): tickets 05 and 10 must draw the same diagonal.
- Movement samples once, under the hull's centre. Terrain stops falls and never rises. Feet under it at the start of a move come straight up.
- Slope limit 45 degrees, slide capped at 8 m/s, no jump on steep ground. A fall onto a slope is a landing, a long slide isn't a fall.
- Water is a second corner grid. Wading from 0.1 m: speed times 0.85 and a new footstep. The client derives it from position, so no protocol change.
- Nothing penetrates the ground. `TERRAIN_HIT` (-1) stands in for a solid's index.
- Mantle gained `bankAhead`: a steep rise within reach, with walkable ground on top inside the height bands.

Measured on the home server: `heightAt` 48 ns, `steepAt` 63 ns; a sight ray over 13 m 782 ns, 100 m 1465 ns, 300 m 1521 ns; a tick of 60 running seats 0.326 ms on terrain, 0.359 ms on one flat solid. `BENCH=1` on `terrain.test.ts` repeats it.

Checked: the six golden hashes (yard, town, crash, each TDM and FFA, 40 s, 12 seats) match the baseline. 44 tests in `packages/fps-core/test/terrain.test.ts`, 2 of them `BENCH=1` only. Full suite 1057 passed, 13 skipped; typecheck clean.

In a real headless, muted browser, with real key presses on a temporary test map (not committed): up a 30 degree ramp at 4.78 m/s, y 0 to 8.2. A sprint stopped dead at a 60 degree wall at x = 9.994. Dropped on that wall, slid down at 8 m/s to walk at health 100. Firing into it gave `dirt` impacts on its face. Wading went 4.78 to 4.06 m/s and back, y -0.6 on the river bed, with `wading` footsteps exactly for the crossing (`.......WWWWWWWWWWWWWWWW..`). A mantle onto a 1.2 m bank ended on top, then walked. No console errors.

Left for later tickets:

- Ticket 05: cells of about 1 m where a bank must be mantleable; at 2 m a 1.2 m rise is walked. Keep roughness under the slope limit (a steep sliver under a step blocks walking until a jump) and make no pit with only steep sides, which would trap a player. A map's tests should prove the second. Close the rectangle with a Boundary.
- Ticket 06: nav still knows only solids (`bots/nav.ts`).
- Ticket 10: draws the terrain, and the bake needs it too: `surfaces/bake.ts` indexes solids with `hit.solid`, which is `TERRAIN_HIT` on a world with terrain.
