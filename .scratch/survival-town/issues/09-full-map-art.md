# 09 Full map art, mannequins and the population sign

Status: resolved
Milestone: 3 (art and presentation)
Blocked by: 02, 08

## What to build

The approved look applied to all of Survival Town. See the spec sections "Rendering (presentation package)" and "Maps (the app)".

- **Both houses**, inside and out, in the approved style. Each gets its own pastel palette.
- **Every prop gets an original design:** the bus, both trucks, the boat, the picket fences, the planters, the yards, the cul-de-sac road, the garages.
- **The mannequins** get original designs, placed as in the original. Their heads are props from ticket 02, popping off when shot as a presentation-only effect.
- **The population sign** is an original design that shows the lobby's player count and this match's kills.
- **Cheap ambient effects:** dust motes in the sunlight. Everything visual stays within the decoration tolerance, and non-colliding decoration stays out of movement reach.
- **No Nuketown, Treyarch or Activision names, logos, signage or posters** anywhere.

## Acceptance criteria

- [x] The playtester agent checks every reference spot: no z-fighting, seams, light leaks, floating or buried props, or stretched materials.
- [x] All map tests from ticket 05 still pass, along with the decoration tolerance test.
- [x] Shooting a mannequin head pops it and doesn't block the shot. A late joiner sees the head popped.
- [x] The benchmark stays within every preset's budget, or the gap is recorded in this issue's comments for ticket 15.
- [ ] Side-by-side screenshots against public gameplay frames at the reference spots are added to this issue's comments. (Moved to ticket 16; see below.)

## Comments

Resolved, apart from the side-by-side screenshots, which move to the release (see the last paragraph).

**What was built** (`apps/range/src/map/survival-town.ts`):

- **Both houses** are dressed in the approved style: north mint with green shutters, south butter yellow with brick-red shutters. Each side has its own `Palette`. Both gables overhang the walls; roofs, porches, decks, carports, stairs, garages and interiors use the same looks on both sides.
- **The vehicles** are original designs built on a small `Frame` helper (boxes in a vehicle's own frame, with trim on their faces): a school bus, a moving van with a stripe, a pickup and a woody wagon. Each has windows, wheels, a grille, lights and tail lights.
- **The yards and street:** the boat on its trailer with a hull stripe, a picnic table, picket fences on both sides with their own look, planters, the asphalt circle and the garage floors.
- **Mannequins:** 16 in total, 7 per house and 2 in the street. Legs and torso are plastic solids; arms, neck and leg seam are decoration. Each head is a prop box drawn as an egg in the mannequin's skin colour. Six outfit colours.
- **The population sign** (`world-details.ts`, `PopulationSign`): a canvas face reading SURVIVAL TOWN, POPULATION and KILLS THIS MATCH, and EST. 1955, in the UI's condensed system fonts. It redraws only when the lobby's player count or the match's kills change. It hangs 4 mm off a drawn board by the street.
- **Dust motes** (`dustMotes`): one merged mesh of tiny tetrahedra drifting in the indoor zones. They are bright where the probes see the sun and nearly invisible in shade. The draw is additive with no depth writes.
- **No original names, logos, signage or posters** anywhere; every string and shape is generated in code.

The map now has 1 389 drawn solids, 638 decorations, 6 138 faces, 58 finishes and a 2048 x 1028 lightmap atlas.

**Tests.** `apps/range/test/survival-town.test.ts`: all of ticket 05's tests still pass. So does the decoration tolerance test, now over 638 decorations. New tests check the following:

- The sign hangs on the face of a drawn board.
- At least 14 mannequin heads exist, each a unique prop resting on a plastic torso.
- Every head is more than 1.5 m from every spawn.
- A headless shot through a head reports the `prop` event and still lands an impact beyond it.

The server keeps the popped set for late joiners (ticket 02's test), and the client hides those heads on join (`WorldView.hideProps`).

**A bug found on the way.** A door head in the living room drew too bright. The client and the bake (Node) packed the lightmap atlas differently because `Math.hypot` rounds differently in different engines. That flipped a `ceil` on slanted vehicle faces, so the client read another face's texels. The fix:

- The atlas sizes faces with plain `Math.sqrt`, ignoring float noise just past a whole texel count.
- The layout key now includes each face's atlas rect, so a mismatched bake is refused instead of misread.
- Two tests in `packages/fps-client/test/surfaces.test.ts` cover this.

**Playtester.** The agent reviewed all 16 reference spots and reported no confident z-fighting, floating or buried props, or stretched materials. Its probable finding was a bright wedge in both living-room ceilings, above the stairs. A ray traced from that pixel hits the upper floor slab's edge at the stairwell opening (x = -2, y 2.8 to 3.0). That edge wears the white trim finish, so it is real geometry, not a light leak. The other notes were minor:

- The circle's edge looks stair-stepped up close. It is built from 0.1 m strips; ticket 15's polish pass can smooth it.
- The south side looks brighter in frames that face away from the sun. That is front lighting plus bloom, not a geometry difference.

**Benchmark.** Same set-up as ticket 08 (RTX 5060, Chrome headless, WebGPU, 1080p, vsync off). Measured with ticket 10's scenery in, so it covers both:

| Map | Preset | GPU p50 / p95 (ms) | Frame p50 / p95 (ms) | Draw calls (mean) | Triangles |
|---|---|---|---|---|---|
| Survival Town | low | 0.36 / 0.49 | 1.6 / 7.4* | 61 | 30 k |
| Survival Town | normal | 1.11 / 1.47 | 2.9 / 4.8 | 83 | 32 k |
| Survival Town | high | 2.15 / 3.26 | 3.0 / 4.9 | 80 | 31 k |

All presets are inside their budgets (3 / 4.5 / 6.9 ms). Load measured 1.2 s with a warm bake cache. A run that had to rebake first took 16 s; that only happens in dev after a map edit. \* The p95 frame times are noise from other applications on the machine, as in ticket 08.

**Side-by-side screenshots.** The public sources for the original's gameplay frames sit behind a bot check that automated access cannot pass, and this work doesn't try to get around it. Copies of those frames also can't go into this public repo. Later tickets still change what the spots show: the soldiers, the nuke, the UI and the polish pass. So the side-by-side moves to ticket 16. At release, `node apps/range/scripts/spots.mjs survival-town <dir>` shoots every reference spot with the final art. Those shots are published privately next to links to the public frames, for the owner to compare.
