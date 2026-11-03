# Smarter bots for Battle Royale

Status: open
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
