# Smarter bots for Battle Royale

Status: resolved
Release: v2.124.1
Blocked by: 63
Labels: enhancement

Owner: "make the bots smarter for the battle royale gamemode, research how the best battle royale games make good bots and implement that into this game."

Step 1, research (`.scratch/battle-royale/research/bots.md`): how Fortnite, PUBG, Apex, Warzone and others build BR bots and AI squads, from primary sources (GDC talks, dev blogs, postmortems), plus what makes bots read as human. Step 2: compare with our bots (`packages/fps-core/src/bots/`, ticket 40's notes) and pick what fits a 60-seat, one-life, Ring, Squads, Downed/Revive game on our server budget. Step 3: implement test-first.

Constraints: the spec's balance target stays (a good player wins about 1 match in 4, no difficulty setting), the 60-seat server load gate passes, the Local bots worker stays smooth. Measure before/after over seeds: match length, placement spread, revive share, Ring deaths, and behaviour the research names.

## Owner's direction (2026-11-03), overrides the research where they differ

"Bots should always act the way they should, and our goal is to make them fun and engaging to play against, let them share visibility with their teammates, but each one takes its own decisions. Also I noticed that they try to revive too much, too fast."

- **No director, no adapting.** Drop bots.md change 1's per-target hit window ("one shooter at a time") and change 7's global breather. Remove the existing pace curve (`STATS.royale.pace`, the heat in `squad-plan.ts`) that makes bots run hotter or cooler to keep the match on schedule. Nothing steers bots by match pace, by who is winning, or by whether a target is a person. Match length comes from the Ring and the bots' own behaviour.
- **Each bot decides for itself.** Replace the Squad leader giving orders (`squad-plan.ts`: "a bot takes orders") with per-bot decisions: each bot weighs its own health, ammo, Ring, cover, known enemies and where its squadmates are, and may choose to stick with them. Squads stay together because staying together is a good decision, not because they're ordered to.
- **Shared visibility.** Squadmates share what each sees and hears (enemy last-known positions, Downs, pings); each bot acts on it in its own way. Bots never know what no squadmate could have seen or heard (no reading true positions).
- **Skill is the bot's own.** Aim error, reaction and positioning come from each bot's personality and its situation (distance, movement, stance, cover, being shot), the same at every point of the match. Bots shoot when they have a shot. The good-player 1-in-4 target is tuned through these per-bot values only.
- **Revive less, and only when sensible.** Today bots go for a revive too often and too soon. A bot revives only when it judges it safe enough: no known enemy that can see the Downed seat or the route to it, or the fight is won, or there is real cover; it fights or clears first, and it doesn't run across open ground under fire. Measure before and after: revives started while a known enemy has sight of the reviver (target near zero), share of revives that get interrupted, time from Down to revive start.
- From bots.md, keep: hunting by ear (2), shared knowledge (3), gradual spotting (4), the threat grid for routes (5, as knowledge each bot reads, not orders), and handling Reboot, Supply Drops and pings (6).

## Comments

**Done (v2.123.0 bots, v2.124.0 measures).** What each bot does now, all per bot and the same all match:
- No leader, no pace: `STATS.royale.pace` and the heat are gone. Each bot picks its own rally inside the next circle and mostly joins the newest Heading a squadmate gave (the bots' "going here"); one well ahead of its nearest squadmate waits. A bold, healthy bot may hunt the loudest fight on the Noise grid within 400 m earshot.
- Shared sight: `SquadIntel` per team holds callouts of what any squadmate saw, heard (roughly placed) or was hit by; nothing else goes in. A bold bot goes to help with a fresh sighting within 45 m; the rest turn to look.
- Spotting takes a moment (about 0.1 s + d/45 m; slower for crouched or still, faster when moving, firing, called out or hitting it); at range the view is a box, so far to one side goes unseen.
- Aim error grows with the target's speed, its own movement and being just hit; it aims at a head over cover. Each bot opens fights out to its gun's reach scaled by its boldness, and chases 25 to 70 m by boldness.
- Revive: one squadmate claims each Downed seat; it goes only with time on the Bleed-out and inside the Ring for it, out of a fight and not shot within 3 s, after a quiet moment (1 to 2.5 s with no enemy known near, 2 to 6 s while one is about, by caution), and with no enemy it knew of in the last 12 s able to see the seat, itself or the way between. The route there keeps out of that enemy's sight.

**Before / after, 5+ seeds per size** (pace soak, `ROYALE_GOOD=1`; before = seeds 1 to 8, after = seeds 1 to 10):

| | Solos before / after | Duos before / after | Trios before / after |
|---|---|---|---|
| Length mean (s) | 559 / 540 | 528 / 534 | 516 / 515 |
| Ring deaths per match | 2.3 / 1.5 | 0.6 / 0.5 | 1.1 / 0.5 |
| Squads out at 25/50/75% (s) | 83/217/320 / 86/138/235 | 132/241/319 / 110/166/265 | 129/246/334 / 120/168/250 |
| Revives started per match | - | 24 / 5.4 | 28 / 4.5 |
| Revive share of Downs | - | 30% / 13% | 19% / 9% |
| Revives started with an enemy in sight / a known one | - | 45% / 44% -> 15% / 6% | 57% / 55% -> 13% / 4% |
| Revives interrupted | - | 47% / 19% | 67% / 16% |
| Down to Revive start, median (s) | - | 7.0 / 8.8 | 7.3 / 12 |
| Longest stuck (s) | 35.5 / 110.5 | 20.5 / 16.5 | 25.5 / 21 |
| Server tick mean / p99 (ms) | 0.58 / 2.0 -> 0.57 / 2.0 | 0.61 / 2.2 -> 0.57 / 1.7 | 0.59 / 1.8 -> 0.56 / 1.7 |

Late ticks (over 16.7 ms) are 66 to 126 a match before and after, all at the Drop's start, as before. The 60-bot free-for-all soak is unchanged (236 crossings, stuck 9.7 s, tick mean 1.82 -> 1.84 ms): its bots have no ground order. Local bots worker (Trios, production build, 2 s window): at 40 s 0.87 -> 0.86 ms mean, p99 1.5 -> 1.5; at 150 s 0.95 -> 0.90 ms, p99 2.9 -> 2.1; 60 ticks a second throughout.

Good-player proxy: 6 wins in 30 after (20%), about 4 in 24 before. One match in four needs 30+ seeds to tell from noise, and 20% is within that, so `botReaction` and `botAim` stay at 2.6 and 3.1.

**Watched in a browser** (Local bots, Trios, seed 7, the person standing still where it landed): the two bot squadmates landed with the person and held cover by it (Onyx crouched behind a rock beside it with the sniper). When Stage 1 closed they left for the next circle together (side by side on the map at 150 s) rather than stay with someone standing in the Ring. The person went Down to the Ring 250 m behind them; they didn't come back across the Ring for it, which is the judgement wanted. The feed showed Downs, Revives and Squads out from 40 s on.

**Not done / notes:**
- The longest stuck in Solos is one bot (seed 2) that lands in a pocket at (-432, -392) under the terrain beside the Ground Zero concrete, with no nav node in reach (its nearest is 80 m off); it was 35 s stuck there before this ticket too. A map and nav matter for ticket 17's Region, not bot logic.
- Threat grid for routes (bots.md 5): routes keep out of sight of the newest danger and, going to a Revive, of the known enemy; the Noise grid is read for hunting only, not added to route costs (that would be a lookup per node searched).
- `profile.ts`: ticket 71 (sniper only from Supply Drops) is still open, so Battle Royale loadout weights are unchanged and bots can still spawn with the sniper. Change the weights when 71 lands.
- Pings (66) and Reboot (70) are open: once they land, a bot's ping goes in as a callout or Heading in `SquadIntel`, and a Reboot is weighed like a Revive (`#worthReviving`'s checks with the beacon as the place).

