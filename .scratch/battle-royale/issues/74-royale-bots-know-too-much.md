# Battle Royale bots still know or do what no squadmate perceived

Status: resolved
Blocked by: 64
Release: v2.124.3
Labels: bug

Follow-up to ticket 64, from a read-only review of v2.123.0-v2.124.2 against its "Owner's direction" (no director, nothing that treats people differently from bots, each bot decides itself, squadmates share only what one of them really perceived, sensible Revives).

1. `squad-plan.ts`: bots in a person's Squad get `rally: person.position` while the person is safe, overriding their own choice; a bot squadmate gets no such pull. The person's Heading `time` is also never refreshed, so their later moves never read as news. Fix: the person's moves become a Heading like any squadmate's (with a fresh time), and bots weigh it exactly as a bot squadmate's Heading; no override.
2. `bot.ts` `#hear`: a hit gives the shooter's true position blurred only 1 to 4 m at any range and without sight, and it goes into `SquadIntel`. The blur should grow with distance like heard gunfire (`FAR_BLUR`), and a hit from far off or out of sight gives a direction only.
3. `bot.ts` `#worthReviving` reads the true alive/Downed state of remembered enemies. It should use only what the Squad perceived: a Down shown in the feed (which every player sees), a kill in the feed.
4. `squad-plan.ts` `hear`: every kill adds Noise heat at the victim's true position, silent Ring deaths and Bleed-outs included. Only kills that made noise (shots, blasts) count.
5. `bot.ts`: `#loud` is never pruned and `#memory` survives `#reset`; the server keeps the same bots from match to match (`net/server.ts` `#startMatch`), so a bot starts a match knowing the last one. Clear both at match start; prune `#loud` on a kill.

## Comments

- 1: each tick the person's position becomes their Heading, with a fresh time, once they've moved more than 10 m from what it last said (`PERSON_MOVED`). The rally is the bot's own pick, as for any squadmate.
- 2: a hit from farther than hearing range, or from a shooter out of sight, gives a direction only: the true bearing ± 8° at a range off by `FAR_BLUR` × 2 (× 1.6 more when unseen). Close and seen, it's still 1 to 4 m.
- 3: a bot keeps a set of the Downs shown in the feed (the feed reaches everyone). A Revive takes the seat off the set and a kill removes it. `#worthReviving` reads only that set.
- 4: only `bullet` and `grenade` kills add Noise heat (`LOUD_KILLS`). Melee, the Ring, Bleed-outs, falls and Squad wipes add none.
- 5: `Bot.newMatch()` clears memory, the loud set, Downs, spotting, dangers and targets, and the server calls it in `#startMatch`. A kill prunes the victim from `#loud`.
- Tests, red before and green after: 3 in `squad-plan.test.ts` for the person as a squadmate, 2 for the quiet kills, 4 in `bots-royale.test.ts` for the feed-only Revive and the far/near hit, and 1 in `battle-royale.test.ts` for a new match knowing nothing.
- Re-measured on the final code (v2.124.4: tickets 74 and 75), pace soak `ROYALE_GOOD=1`, seeds 1 to 10 per size, against ticket 64's "after":

| | Solos 64 / now | Duos 64 / now | Trios 64 / now |
|---|---|---|---|
| Length mean (s) | 540 / 537 | 534 / 528 | 515 / 506 |
| Ring deaths per match | 1.5 / 1.2 | 0.5 / 0.7 | 0.5 / 0.2 |
| Squads out at 25/50/75% (s) | 86/138/235 / 85/141/246 | 110/166/265 / 121/188/278 | 120/168/250 / 132/190/274 |
| Revives started per match | - | 5.4 / 5.0 | 4.5 / 4.5 |
| Revive share of Downs | - | 13% / 13% | 9% / 9% |
| Revives started with an enemy in sight / a known one | - | 15% / 6% -> 8% / 2% | 13% / 4% -> 18% / 0% |
| Revives interrupted | - | 19% / 12% | 16% / 16% |
| Down to Revive start, median (s) | - | 8.8 / 12.0 | 12 / 13.3 |
| Longest stuck (s) | 110.5 / 19.0 | 16.5 / 16.0 | 21 / 17.5 |
| Server tick mean / p99 (ms) | 0.57 / 2.0 -> 0.56 / 1.95 | 0.57 / 1.7 -> 0.58 / 2.25 | 0.56 / 1.7 -> 0.59 / 2.53 |

- Good-player proxy: Solos 0 of 10, Duos 4 of 10, Trios 2 of 10, so 6 of 30 (20%). Ticket 64 after was also 6 of 30. Worst p99 is the first seed of each run (process warm-up, as in ticket 64); the means don't move. Late ticks are all at the Drop's start, as before.
