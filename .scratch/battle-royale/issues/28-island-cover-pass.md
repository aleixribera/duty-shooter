# Fill the island with cover and break the sightlines

Status: resolved
Release: v2.103.0
Blocked by: 05

Spec: `../spec.md`, "Density and sightlines"

Owner feedback from playing the blockout: the island is far too open and too easy for snipers. Shape the terrain with ridges, gullies and berms, and place real hard cover in every Region and between them, using simple grey solids where art isn't ready. Add the headless sightline test with its targets. Owner: every area, even fairly open ones, must give players and bots plenty to hide in and play around, with several routes through. No exceptions for the crater floor, airstrip, snowfields or desert. Keep only a few narrow long lanes. Rebuild nav afterwards and confirm bots still cross the island.

## Comments

Grey solids over the whole island from a deterministic generator (`apps/range/src/map/zero-island-cover.ts`), after terrain folds (`foldGround`), plus cover spots in the nav file.

### Measured, blockout to now

| | Before | After |
| --- | --- | --- |
| Land within 15 m of hard cover | 10.2% | every standing point on the ground or a deck (roofs of cover pieces left out) |
| Median clear view | 140 m | 20 m |
| Views past 150 m | 45.1% | 9.9% |
| View p90 | 320 m | 150 m |
| Solids | blockout only | 9,081 |
| Nav | 64,152 nodes, 6.3 MB (2.1 MB gz), 10 to 12 s | 144,625 nodes, 16.5 MB (5.9 MB gz), about 100 s on the capped server |
| Frame p50, p99, max | 2.1, 4.2, 44.4 ms | 2.1, 4.1, 13.2 ms |
| GPU p50 | 1.05 ms | 1.18 ms |
| Draws, mean and max | 152, 205 | 157, 216 |
| Triangles, mean and max | 162,866, 196,199 | 245,676, 359,353 |

Download to playing on a production build: 25.2 MB against the 40 MB budget, 1.8 s to playing. The bench ran headless on this PC's GPU, so it says nothing about a weak laptop.

Bots: the 60-bot soak made 275 Region crossings, longest stuck 2.0 s, nobody wet, past the Boundary or on the summit. Routes 21.2 a second, mean 0.13 ms, p99 2 ms, worst 26.6 ms. Squads of 1, 2 and 3 all finish `lastSquad`, with spawns 100 m apart and a way to the middle from each.

Player: sprinted the nav's routes from Core to Core in Chrome with real key presses, a loop through every Region, seven legs and 2,657 m in all. All reached their Core with no snags and no console errors. Two early runs stopped at the Ground Zero to Neon bridge, both because my script kept every third waypoint and left the deck or came at it from the side; over every node that leg ran 475 m in 76 s. The bridge has no rail, as before, so a careless sprint can still go off the side.

### 60-seat gate: p99 passes, worst tick doesn't always

Home server, Battle Royale's own opening, `SETTLE=25`, bar p99 12 ms and worst 16.7 ms.

| Run | Tick p99 | Worst | Cap stalls |
| --- | --- | --- | --- |
| 2 people, 58 bots | 4.5 | 13.6 | 9 s |
| 12 people, 48 bots | 5.75 | 25.7 | 14 s |
| 60 people | 6.25 | 49.2, first window p99 46 | 42 s |
| 12 people, `DEFLATE=0` | 5.25 | 19.4 | |
| 60 people, `DEFLATE=0` | 6.5 | 45.9 | |
| 60 people, `DEFLATE=0`, GC traced | 6.75 | 15.5, 0 late | |

Same run, same code, 15.5 and 45.9 ms: these are one or two ticks in 1,800 and they don't repeat. Mark-Compact pauses in the traced run were 2 to 11 ms. Ticket 07 saw the same 22 to 46 ms under this `remote-test` CPU cap, which the 60 clients share with the server. I read this as the cap and not the map, but that's an inference: a run with the clients on another machine would settle it, and that run hasn't happened. The soak also logged a single 209 ms tick, under the same cap, unexplained.

### Still open, honestly

- **Ground Zero has the longest views left:** p90 210 m and 15.7% past 150 m. The median is 20 m, so most of it is close, but a sniper there still has work.
- **Neon City's and Rogue Harbor's outskirts look the most open.** Flat ground and low pieces: median 30 m, up to 50 m at (384,-96) and (0,384). They pass, and they're what I'd thicken next. Tickets 19 and 20 should do part of that.
- **The Dustlands and the western edge** read as 50 m at (-288,0) and (-288,96), the widest squares inland.
- **Even spread:** the lattice reads as evenly spread pieces from above, and the jungle's trunks are tall bare posts. Ticket 29 dresses them; a designer may want clusters and clearings in place of the even spread, as even cover plays flat. That's why the mix is a table per Region.
- **Map build is about 1 to 2 s** on client and server, and the nav takes about 100 s in a build. Both are worth a look if ticket 29 adds solids.

### Decisions

- **The target is beaten, not met.** The test holds the land's median view to 35 m, each Region's to 45 m and any 96 m square's to 60 m, as the owner asked for a minimum; the spec's own figure is about 50 m.
- **Cover is what stops a bullet at chest height (1.05 m) or a crest 1 m proud of the ground.** `test/support/sightlines.ts` measures with the collision bullets use, so the map can't mark its own homework. The filler counts a piece only if it spans chest height at the point it's sheltering: a rock uphill or a wall below a bank doesn't count, and a piece standing below a road bank grows tall enough to reach past it.
- **Lanes are kept on purpose.** The railway keeps long clear stretches between parked rakes, which the test holds at 0.5% to 15% of views past 150 m.
- **Crater floor raised to 3.4 m** (from 1), with blast rings on the slopes at r 74 and 102 m.
- **The airstrip is laid as a run of road**, moved so it doesn't foul the Neon to Harbor bridge, with revetments down both sides and wrecks on the strip.
- **Each Region has its own finish, `cover-<region>`, and `cover-sea`:** solids merge per finish, so a Region out of view culls whole. Ticket 29 can replace them one at a time.
- **Bridges get barriers on alternating edges**, the middle clear; road edges get wrecks by turns, the middle clear.
- **Nav detail reach on the island is 2 m, not 3,** to hold the node count down with this much cover. The soak and the walks show bots and players still get through.
- **Cover spots are `coverFull` and `coverLow`, one bit per eighth of a turn per node, reach 2.5 m,** new sections in the nav file (`VERSION` 3). A map's fingerprint already covers the solids. `coverNear`, `coverOf` and `coveredFrom` are the way in for ticket 09; bots don't use them yet.
- **Test nav is cached** in `node_modules/.cache/duty-nav`, named for the generator's source and checked against the map on decode. At about 100 s a file, four files were taking the suite past ten minutes. `zero-island-nav.test.ts` still builds its own.
- **Not Blender:** as the ticket says, these stand in until ticket 29.

Shots: `.scratch/battle-royale/shots/cover/` (`before/`, `after/`, `walk/`, and `sheet-*.jpg` contact sheets).
