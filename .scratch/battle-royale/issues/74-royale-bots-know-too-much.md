# Battle Royale bots still know or do what no squadmate perceived

Status: claimed
Blocked by: 64
Labels: bug

Follow-up to ticket 64, from a read-only review of v2.123.0-v2.124.2 against its "Owner's direction" (no director, nothing that treats people differently from bots, each bot decides itself, squadmates share only what one of them really perceived, sensible Revives).

1. `squad-plan.ts`: bots in a person's Squad get `rally: person.position` while the person is safe, overriding their own choice; a bot squadmate gets no such pull. The person's Heading `time` is also never refreshed, so their later moves never read as news. Fix: the person's moves become a Heading like any squadmate's (with a fresh time), and bots weigh it exactly as a bot squadmate's Heading; no override.
2. `bot.ts` `#hear`: a hit gives the shooter's true position blurred only 1 to 4 m at any range and without sight, and it goes into `SquadIntel`. The blur should grow with distance like heard gunfire (`FAR_BLUR`), and a hit from far off or out of sight gives a direction only.
3. `bot.ts` `#worthReviving` reads the true alive/Downed state of remembered enemies. It should use only what the Squad perceived: a Down shown in the feed (which every player sees), a kill in the feed.
4. `squad-plan.ts` `hear`: every kill adds Noise heat at the victim's true position, silent Ring deaths and Bleed-outs included. Only kills that made noise (shots, blasts) count.
5. `bot.ts`: `#loud` is never pruned and `#memory` survives `#reset`; the server keeps the same bots from match to match (`net/server.ts` `#startMatch`), so a bot starts a match knowing the last one. Clear both at match start; prune `#loud` on a kill.

## Comments
