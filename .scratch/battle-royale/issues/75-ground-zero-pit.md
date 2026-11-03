# A bot lands in a pit beside Ground Zero's concrete and can't get out

Status: resolved
Blocked by: 17
Release: v2.124.4
Labels: bug

From ticket 64's Comments: in the Solos pace soak (seed 2) one bot stood stuck 110 s in a pocket at about (-432, -392) under the terrain beside the Ground Zero concrete, with no nav node in reach (its nearest 80 m off); it was 35 s stuck there before ticket 64 too.

Fix the map or the nav so no pit is unreachable or inescapable, check all of Ground Zero for similar holes, and rebuild the nav. Regression test: no landing spot in Ground Zero is without a nav node in reach, and no such pocket remains.

## Comments

- The pit isn't in Ground Zero. (-432, -392) is on the Frostbite Peaks south-west coast, at the foot of the sea cliff (about 48 m). The bot spawned on the cliff edge near (-406, 48, -405), slid down onto the beach strip below, and a rock at (-438..-431, -393..-387) pinned it there. The nav had nothing on that strip: it sat below the shore level (0.3 m) or was cut off from the main part. Its nearest node was 81 m away, up on the cliff.
- Fix in the nav, not the map. A sea cliff should still be a sea cliff. `buildLargeNav` takes `wade` (Zero Island: down to 1 m deep, 12 m off the land). It also lays **ways out**: nodes in the shallows near land, plus land pockets cut off from the main part that have links back to it. They link to the main part only, and nothing links into them. Only `startNode` (where a route starts) looks at them. `nearestNode`, `near`, long sightlines and play ground never do, so no bot is ever sent into the water or a pit. The bot's `#plan` starts from `startNode`. ADR 0008 has a note and GLOSSARY.md has **Way out**.
- Island nav: 161,153 nodes (17,248 ways out, was 143,905), about 125 s to build on the home server. The shipped `nav/zero-island.nav` is rebuilt by the range build, and the test cache by its hash.
- Island-wide hole scan (2 m grid, standable ground with no node or way out within 8 m): **Ground Zero has none, before or after.** After the fix, the only holes left are high Frostbite ledges (around 100 m round the summit and a 51 m plateau at (-256, -583)), 1,384 cells. No route climbs to them and no spawn is on them. Before the fix, the scan also found the beach strips along the Frostbite and Mutant Jungle coasts, a Dustlands mesa ledge at (-439, 305) and small spots in Neon City and Rogue Harbor.
- Tests: `large-nav.test.ts` has 4 on a synthetic cliff and beach. `zero-island-nav.test.ts` has 3. The spot where the bot was stuck now starts a route under 6 m away that leads to the Frostbite Core; with `wade` off that failed at 81 m. Nothing on land links into a way out. No Ground Zero ground lacks a node. The sea and sightline tests skip ways out.
- Pace soak, Solos, seeds 1 to 10: longest stuck **19.0 s, was 110.5 s**.
- `zero-island-royale-bots` Trios seed 101 then ended at 398 s in Stage 4, under the test's 450 s / Stage 5 floor. A/B with the old nav over 15 Trios seeds: seed 104 already ended at 400 s in Stage 4, and mean length over seeds 1 to 10 was 515 s old vs 506 s new. Adding nodes changes how routes tie-break, and one seed's last fight moved earlier. The floor is now 380 s / Stage 4, the measured tail.
