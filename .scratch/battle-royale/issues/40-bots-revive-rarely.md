# Bots revive their squadmates rarely (8% of Downs)

Status: open
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
