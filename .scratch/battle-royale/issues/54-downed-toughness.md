# Downed players are Finished too quickly

Status: resolved
Release: v2.109.0
Blocked by: none (independent of the bug hunt)

Owner request: "When downed, enemies die too quickly, increase their health and add a small invincibility gap." Applies to every Downed seat, people and bots alike.

Set by the lead (owner can retune): Downed health goes from 40 to 100, the same as full health, and going Downed gives 1 s with no damage from any source (the Ring and Bleed-out keep their own rules; Bleed-out time doesn't change). Both are stats in the stats file. The invulnerable second shows on the Downed player and to whoever is shooting them (hits show no damage), so it doesn't read as a bug.

Measure before and after over 5+ seeds per Squad size: time from Down to Finish, the share of Downs that end in a Revive, and match length. Bots' 1.5-4.5 s wait before finishing (ticket 40) stays. Check in a real Duos match that a burst that downs someone no longer Finishes them.

## Comments

- Shipped: `STATS.royale.downedHealth` 40 -> 100 and a new `STATS.royale.downedGrace` of 1 s. `Simulation.#damage` refuses any damage to a seat Downed under the Grace ago (bullets, shotgun blasts, frags, melee; the Ring, falls and own frags were already refused for any Downed seat). Bleed-out and bots' 1.5-4.5 s wait are unchanged. Glossary: Downed updated, new term Grace.
- How the Grace shows (my call, the spec only says "so it doesn't read as a bug"): every `hit` event now carries the damage that landed, so a hit inside the Grace says `damage: 0`. The shooter then sees a small grey hit marker (6 px ticks in `--ds-text-2` instead of 11 px white), no blood and no hit sound; the Downed player sees "Protected" in bold above Bleed-out in the Downed plate and gets no damage flash, arrow or hurt sound from those hits. The client works the Grace out from the Bleed-out clock (`protectedFor`), so nothing new goes on the wire.
- Measured (`ROYALE_PACE` 2:1-5 and 3:1-5, Zero Island, bots in every seat; `apps/range/test/support/royale.ts` now records Down-to-Finish times; logs `.scratch/battle-royale/t54-before.txt`, `t54-after.txt`):

  | Size | Mean length | Downs | Revived | Finished | Down to Finish median | Finished within 1 s |
  | --- | --- | --- | --- | --- | --- | --- |
  | Duos before | 516 s | 194 | 24% | 38% | 6.5 s | 2 |
  | Duos after | 537 s | 192 | 23% | 34% | 5.4 s | 0 |
  | Trios before | 510 s | 257 | 25% | 52% | 6.2 s | 7 |
  | Trios after | 517 s | 254 | 22% | 44% | 6.3 s | 0 |

  Fewer Downs end in a Finish (38 -> 34%, 52 -> 44%) and none inside a second; the rest go to Bleed-out and Squad wipes. The Revive share barely moves: bots revive rarely whatever the pool, because the Down-to-Finish median is set by their own 1.5-4.5 s wait, not the pool. Matches run 1-4% longer. The other session's uncommitted ladder changes in `bot.ts`/`nav.ts` were in the tree for both runs.
- Real Duos match (`.scratch/battle-royale/t54/play.mjs`, real server and browser, headless): an enemy holding the trigger on Ada from 30 HP Downed her, then 5-7 more hits landed in the next second for 0 damage, her pool stayed 100 and her plate read "Protected / Bleed-out 30"; the first hit after the second took 28 (100 -> 72), and four such hits Finish. Ada firing on an enemy just Downed got the grey marker at 0.13 s, an ordinary marker at 1.7 s, and a kill marker later. Shots in `t54/shots/`.

