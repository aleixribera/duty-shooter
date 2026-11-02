# Bots play Battle Royale

Status: resolved
Release: v2.104.0
Blocked by: 06,07,08

Spec: `../spec.md`

Spec: Bots at scale. Route to the next circle, fight other Squads without preferring humans, move as a Squad, Revive, use cover, hide and flank (spec: Using the ground). Soaks for each Squad size. Win rate tuned toward 1 in 4 for a good player.

## Comments

From ticket 07: real-server matches with bots ended in 104-116 s and headless ones in 250-352 s, against a 10-minute design. Find out why and make whole matches last close to the Ring's full length, so the last Stages actually get played.

## Done: what it came to

**Why matches ended early.** Two causes, both measured. The 104-116 s came from runs with a shortened limit: `pace = timeLimit / 600` compresses the Ring with it, so a 120 s or 150 s match is over in that time whatever bots do (zero-island-royale.test.ts at 120 s reproduces 104, 116, 111 s on the final code). The headless 250-352 s was bots: they roamed on hunches, ignored the Ring (12 outside it at 120 s, 9-16 Ring deaths a match), and opened fights at 70 m, so half the field was gone by 90 s. Only 0-2 of 30-42 Downed seats were Revived.

**The pace fix.** `SquadPlanner` (bots/squad-plan.ts) gives each Squad a Rally inside the circle that matters next. The kill rate is held by Heat: alive Squads against a curve in `STATS.royale.pace`. Heat moves how far off a bot opens a fight (14-70 m) and what share of Squads hunt the nearest other. No part of it looks for humans: the nearest other Squad is the nearest other Squad. Stage 4 and 5 radii went from .12 and .05 to .15 and .08, because the last Squads otherwise had to fight in a space with no cover (a call, stats file).

**Results, final code, 30 matches, seeds 201-212 and 201-209:**

| Squads | Matches | Length (s), least / median / most | Reached Stage 6 | Lowest Stage | Ring deaths a match | Downs | Revives |
|---|---|---|---|---|---|---|---|
| Solos | 12 | 473 / 555 / 564 | 11 | 5 | 0-4 | - | - |
| Duos | 9 | 472 / 533 / 555 | 6 | 5 | 0-2 | 30-34 | 1-5 |
| Trios | 9 | 478 / 516 / 557 | 5 | 5 | 0-3 | 40-49 | 1-9 |

A 600 s real server run (Solos, seed from the server): 559 s, Stage 6, 37 seats at 135 s, 26 at 245 s, 10 at 345 s, 5 at 435 s.

**Tuning: a proxy, not a person.** `goodPlayer` in apps/range/test/support/royale.ts is a bot with a good player's hands (reaction .2 s, aim 1.5 degrees, steady recoil) on the ordinary brain. No human has been measured. At the bots' own skill it won 1 of 16, 23rd on average: deaths came from a burst inside a second by someone it hadn't seen, and aim error only sets where a bot's first shot starts. So bots in a Battle Royale play at `royale.botReaction` 2.6 and `royale.botAim` 3.1 times their profile (`royaleProfile`). Measured: 2.5 and 3.0 won 4 of 28, 2.65 and 3.2 won 10 of 30, 2.8 and 3.5 won 12 of 30, and the settled 2.6 and 3.1 won 9 of 30 on fresh seeds, mean place 8.2, mean 5.1 kills. That's a little over the 1 in 4 asked for and within what 30 matches can tell. It's a proxy with a bot's sense of position, and a real person's edge may well be larger or different: measure one before trusting the number. A slower reaction of about a second may read as sluggish up close; ticket for a person to judge if so.

**The ground.** A Squad bot bounds from cover to cover toward the Rally, routes cost more away from cover, and it holds a cover spot round the Rally rather than where it happens to stop. Hurt or outgunned it hides (`#hide`, a real sight check from the enemy to a crouched body), and it takes a fight to cover a few steps off. A target lost from sight at 8-45 m is flanked, always by a flanker, otherwise by boldness and more often by the Squad's second seat. All of it sits behind the optional `BotView.ground`, so team modes are untouched.

**Revives.** `planRevives` is gone: the Squad planner sends the nearest standing mate only if the seat has the bleed-out left and the wall allows it, and the bot itself holds off while an enemy was seen near the seat in the last 4 s. Revives run 1-9 a match. Most Downed seats die first, because they fall in a fight with a Squad still there to Finish them; that's the judgement working, and a person may want it bolder.

**Soft cover hook.** `World.concealment` (`Concealment.hides(from, to)`), set through `createWorld`, is what ticket 29 fills in. `botSees` in bots/sight.ts is the only place bots ask, and every sight check in bot.ts goes through it. Bullets don't. A test goes red if the check is removed.

**Found on the way.** A client with no seat sent nothing, so a spectator was idled out after 20 s; matches used to end before anyone noticed. It now sends a word each second. A lobby that switched mode on the same map kept bots at their old skill and kept the last match's Squad brain: both are reset at match start.

**Tick.** 60 seats on the home server, opening of a match: 2 people and 58 bots p99 5.5, worst 16.4 ms; 12 people and 48 bots p99 4.75, worst 15.0 ms; 60 people p99 6.0, worst 40.9 ms (no bots, ticket 30). In the soaks p99 1.3-1.9 ms; worst 46-73 ms, all in the harness and not yet traced to a cause, so ticket 30 should look.

**Watched in a browser** (`?online`, Duos, real server, seat kept alive and carried about as a camera, 440 s; `.scratch/battle-royale/bots-watch.mjs`, shots in `.scratch/battle-royale/shots/bots/`, `sheet.jpg` for six moments). Bots stand crouched at the blocks with their backs to them more than they walk. Of 57 at 21 s, 20 hold and 37 move; by 74 s, 9 fight at once in pockets and most of the field is still quiet. Fights end with one side running for a block, or flanking and meeting the other a few seconds later. A Downed seat crawls about 1 m in 3 s. Squadmates are usually within 20 m, though late on one mate was 79 m off. No page errors. Two earlier runs stopped at 97 s, most likely an Early end when the camera seat was killed outright (the third, with the seat guarded harder, ran on).
