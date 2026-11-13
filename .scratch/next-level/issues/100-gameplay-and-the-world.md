# Gameplay and the world feel good

Status: open

Spec: `../spec.md`

`PLAN.md` item 5 (objective 3). Every map, not only Survival Town: the gaps the review finds in movement, spawns, flow, the countdown across the whole match (ticket 36's later parts) and the Ring (ticket 33).

Acceptance: the review's objective 3 passes on every map.

## Comments

**Pass 1 (loop pass 8, 2026-11-13): spawns look into the map, not into a wall.** Review `../reviews/2026-11-13a.md` (its first reading) fails objective 3. Its gaps by map: Survival Town's last minute barely reaches the sky (the reviewer's "fix first"); Switchyard's spawns face a brick wall point-blank (20-a, 23-a); Station Nine gives a kill 2 s in; the range stalls 4.8 s. I fixed the Switchyard spawns first, not the sky. Aleix played the last minute and said it lands ("Hell yeah it slaps", spec.md), while a wall in the face greets every life on every map, and the review counts it among its five most visible defects. The sky is next (pass 2 of this item).

Measured first: at eye height, 27 spawns on the three match maps looked into a wall within 8 m along the crosshair (sets counted apart). Switchyard had 19, among them 12 of its 18 team end spawns (4.2 to 7.0 m: the screens that keep the two ends from seeing each other stand 5 m in front of them). Station Nine had one (the spawn between the bunker and the road, 4.5 m) and Survival Town seven (5.0 to 6.7 m).

Fix: `apps/range/src/map/spawn-facing.ts`. At map build, a spawn whose crosshair line meets a wall within 8 m, or the play area's edge (Switchyard's boundary is low enough to see the desert over), turns by the smallest 5° step, up to 60°, whose ±4° of view sees past 8 m. A spawn that already sees past 8 m keeps the facing its map gave it, so Survival Town's back yards still face their houses and Station Nine's end spawns still aim through their gaps. Windows don't count as walls (as `sightBlocked`). The server builds maps through the same builders, so it spawns players with the same yaws. It adds 1-2 ms to a map build.

Checked: `apps/range/test/spawn-facing.test.ts` (the least turn, glass, the play area's edge, and every spawn on the three match maps). Its map test fails on HEAD's maps with seven Survival Town spawns at 5.0 to 6.7 m, Switchyard's and Station Nine's likewise. The maps' own spawn tests pass, as do `bot-match.test.ts` and the typecheck. Frames before and after: `../spawn-view/sheet.jpg` (`node .scratch/next-level/spawn-view/look.mjs <out> <map> name=x,z,oldYaw ...`). Switchyard's north-west spawn now looks down the yard instead of at a brick hut; the next two look through the gap between hut and container; Station Nine's road spawn looks down the road instead of at the bunker's wall. One spawn stays weak: Switchyard (-49, 12), and its mirror, have no open view east within 60°, so they turn to a building's wall about 9 m off, with its door. Moving them is a layout change, left for the next review's verdict.

Second opinion (one review subagent on the diff): glass counted as a wall, unlike the rest of the game's sight; the fallback could pick a view worse than the spawn's own; the tests didn't prove the least turn or the play-area refusal. All fixed. The review also warned that the maps' own spawn tests could break. They pass, after one change: the keep-or-turn check reads the crosshair's line alone, because Station Nine's corner spawn aims through a 2 m slot that a ±4° view doesn't clear.

The pre-push soak then failed: in Switchyard's 3-a-side Outposts, the west team never took a zone in three minutes. I played 41 matches for each set of facings, nudging the team spawns by thousandths of a radian. One side never took a zone in 4 of 41 with the new facings and 3 of 41 with the old. The west team's captures rose from 75 to 104 against the east team's 111 and 103, so the new facings don't hurt the west team: the one seeded match had landed in that one-in-ten tail. The soak now plays five minutes (`soak(..., seconds)`), and both sizes pass.
