# 10 Scenery, sky, and the Practice Range's new look

Status: resolved
Milestone: 3 (art and presentation)
Blocked by: 08

## What to build

The world beyond the boundary, plus the range's refresh. See the spec sections "Rendering (presentation package)" and "Maps (the app)".

- **Survival Town's scenery** beyond the boundary:
  - desert terrain
  - test-site towers and structures
  - distant mountains
  - a sky that suits the afternoon sun

  The near scenery has bullet surfaces, so shots leaving the playable area hit it with normal impacts. The far mountains need none. Distant meshes are simplified. Add a heat shimmer on the horizon.
- **The Practice Range** gets the new sky, lighting and post-processing. Its layout, lanes, dummies, movement course and measuring grid stay as they are. Remove the old arena section and its spawns.

## Acceptance criteria

- [x] A map test: bullets fired outward from inside the boundary hit scenery bullet surfaces (or travel to the far scenery), never player clip.
- [x] The playtester agent confirms scenery impacts, and that there are no seams between the playable ground and the desert.
- [x] The range's map tests pass with the arena removed, and the range looks consistent with the new menu in screenshots.
- [x] The benchmark stays within budget, or the gap is recorded for ticket 15.

## Comments

Resolved.

**Near scenery** (`buildScenery` in `survival-town.ts`). Everything here stands outside the playable area, on the map's own sand, as ordinary drawn solids with bullet surfaces and lightmapped finishes:

- a water tower west of the houses: steel legs and braces, a tank with a red top;
- two instrument towers out in the desert, each with a platform and a cabin;
- two low concrete bunkers and two sheds;
- a row of wooden power poles along the street east of its end.

**Far world** (`world-details.ts`). The map definition has a `horizon`: the finish of the far ground, the rectangle of the map's own ground, and a point of open ground whose light the far ground borrows.

- **Far ground.** A flat apron at y 0 runs from the edge of the map's ground out to 1.5 km. Every vertex on its inner edge sits on a vertex of the map's ground faces, so no T-junction cracks open along the seam. It uses the same `surfaceMaterial` as the map's ground: the same world-space pattern, and one lightmap texel taken from that open ground. The two therefore meet in the same colour and light.
- **Mountains.** A low-poly ring 650 to 1350 m out: 360 segments by 9 rings, ridged value noise, 25 to 130 m high, with some directions lower than others. They are lit by the sky and the sun in an unlit node material, and their feet take the ground's colour so no line shows where they rise. They have no collision and cast no shadow. The camera's far plane moves from 600 m to 2.5 km to take them in.
- **Sky.** The sky stays the bake's afternoon sky from ticket 08 (sun from the south-west, about 38 degrees up, warming toward the horizon), so the baked light and the visible sky agree.
- **Heat shimmer** (`pipeline.ts`). On Normal and High, after TRAA, one offset texture read per pixel makes anything farther than 150 m waver slightly, more with distance. The sky and everything near stay still. Low skips it, because its MSAA depth can't be read.

**The Practice Range.** The arena section and its spawns are gone. Free-for-all on the range now spawns at the range spawn. The range's ground and perimeter fence now end at x 62, just past the penetration station. Its far ground wears the grid grass finish, and the same mountains stand beyond the fence. The lanes, dummies, movement course, penetration station and measuring grid are unchanged. The menu's range blurb no longer mentions the arena.

**Tests.**

- `apps/range/test/survival-town.test.ts`:
  - Bullets fired outward from every 2 m of the boundary, level or up to 0.6 rad above level, hit only bullet surfaces or fly on, never player clip.
  - A shot from the west edge at the water tower lands on its tank, outside the town.
- `apps/range/test/horizon.test.ts`, for both maps:
  - The far ground wears one of the map's finishes.
  - The map's ground reaches the far ground's edge all the way round, with no gap.
  - No map ground lies beyond that edge, which would z-fight.
  - The light point is open ground that sees the sun.
- `packages/fps-client/test/world-details.test.ts`:
  - The far ground covers exactly the area from the map's ground out to its edge.
  - It faces up.
  - It puts a vertex wherever the ground has one on the seam.
  - It reads the light point's texel.
- `map.test.ts` and `server-cpu.test.ts` pass without the arena.

**Playtester.** The agent reviewed the roof, spawn, street and overview spots and the three range spots. It found no seam, colour step or outline where the near sand meets the far sand, and the scenery stands grounded and solid. Its notes, and what was done about them:

- A hard line where the pale desert met the greyer mountain foot. Fixed: the mountain feet now fade into the ground's colour.
- The washed-out south spawn is front lighting plus bloom, as in ticket 09; left for ticket 15.
- Low contrast on the white movement-course blocks belongs to the range's measuring-grid look, which the ticket keeps as it is.

Scenery impacts are covered by the headless map tests above. They use the same `raycastWorld` the server uses for shots.

**Benchmark.** See ticket 09's comment. That run had this ticket's scenery and far world in: GPU p50 0.36 / 1.11 / 2.15 ms on Low / Normal / High against 3 / 4.5 / 6.9 ms. Draw calls are 61 to 83 and triangles 30 to 32 k. The range measured 0.19 / 0.86 / 1.76 ms.
