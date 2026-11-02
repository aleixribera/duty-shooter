# Bots revive their squadmates rarely (8% of Downs)

Status: resolved
Release: v2.108.9
Severity: S2 (the Downed rule barely works between bots; squads play as solos)
Found by: 35 (known leftover)

## Repro
Run the pace measurement (`ROYALE_PACE`) for Duos and Trios on seeds 1-3 and count Downs against Revives.

## Evidence
- 18 Revives in 224 Downs overall (8%).
- Duos seeds 1-3: 31 Downs/1 Revive, 34/4, 30/1. Trios seeds 1-3: 42/3, 42/2, 45/7.
- Measured with another session's uncommitted changes in `packages/fps-core/src/bots/bot.ts` and `nav.ts` in the tree. Re-measure on whatever lands.
- Worst server tick 60-67 ms, which is the remote-test CPU cap, not a game problem.

## Suspected area
`packages/fps-core/src/bots/bot.ts` (the revive decision and its priority against fighting) and `nav.ts` (reaching the Downed mate).

## Comments
- Re-measured on a clean `git archive v2.108.8` copy with its own `npm ci` (no other session's code). Seeds 1-3 match the numbers above exactly, so the dirty tree did not skew them.
- Cause: a bot that Downs someone keeps the Downed body as its target and finishes it at once. Of 224 Downs in 6 matches, 155 died within 2.5 s, nearly all `killed:bullet`. A squadmate never had time to come. Upper bound measured with no finishing at all: 27% Revives, so revive pathing and the planner were not the bottleneck.
- Fix (`Bot.#perceive`, `FINISH_WAIT`): a freshly Downed enemy is not a target for 1.5-4.5 s (shorter for aggressive profiles). The bot holds its aim on the body meanwhile, so a squadmate who comes for it walks into its sights, and any standing enemy in view comes first. After the wait it finishes as before, so a lone Downed seat still dies long before bleed-out. Bots stay the same about walking into fire to revive: no change to the revive decision itself.
- Regression test: `packages/fps-core/test/bots-finish.test.ts` (red before, green after).
- Before / after, `ROYALE_PACE`, Downs/Revives per match:

| | seed 1 | 2 | 3 | 4 | 5 | total |
|---|---|---|---|---|---|---|
| Duos before | 31/1 | 34/4 | 30/1 | 36/6 | 31/1 | 162/13 (8.0%) |
| Duos after | 38/8 | 39/10 | 41/11 | 38/9 | 38/8 | 194/46 (23.7%) |
| Trios before | 42/3 | 42/2 | 45/7 | 44/4 | 46/7 | 219/23 (10.5%) |
| Trios after | 53/14 | 52/14 | 52/12 | 47/9 | 53/15 | 257/64 (24.9%) |

- Not suicidal: revivers Downed or killed mid-revive 6 of 90 revives started. Match length stays 481-555 s, deaths per match 57-59.
- Watch: deaths to the Ring rose from 4 to 11 across the 10 matches (revived players are further from the safe zone). Small, but worth a look if it grows.
- Confirmed in the networked match harness (real server match over the network, the same code the game runs). I did not watch a whole 8-minute browser match.
