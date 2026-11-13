# Battle Royale's fights in towns

Status: resolved
Release: v2.197.0

Spec: `../spec.md` (objective 3, gameplay and the world feel good)

Aleix's request 3 (2026-11-13): "BR fights in towns: bias Zero Island's final circles, drops and bot routes to built-up areas; measure final circles and kills over many matches before and after."

Acceptance: over the same 18 whole matches (Squads of 1, 2 and 3, seeds 1-6) before and after, the last circle closes in a town in most of them, and a clearly larger share of the kills happens in towns; tests hold each bias.

## Comments

**2026-11-13, loop pass 25 (pass 1).**

What well-loved battle royales do: the end of the match is steered to places worth fighting over, but not every time. Warzone's Season 03 Reloaded notes (callofduty.com, 2026-04) moved Avalon's endgame circles so they "occur more consistently in competitive areas" while keeping "a healthy variety of terrain outcomes". The crowd also lands where the buildings and the loot are (named places), so the first fights happen there too.

What a town is: a map names its built-up places (`towns` on its definition); Zero Island's are its six Cores. Neither the nav's indoor nodes nor the density of tall solids picks them out (`towns/towns.probe.test.ts`, first two versions: trees and rocks count as tall solids everywhere, and Rogue Harbor has 16 indoor nodes), so the map says it.

What changed:
- **The Ring** closes in a town in `royale.townEnd` (80 %) of matches, the rest anywhere on land as before. Closing on a town, every circle holds the town round the end too (0.6 of its radius, or half the circle's), so Stages 4 to 6 are fought in it; the last circle still moves as it closes (ticket 68), but stops in the town's heart.
- **Starts:** a Squad's place in or by a town (25 m past its rim) is handed out first, so some Squads start among buildings, as a hot drop.
- **Supply Drops** land in a town when one stands well inside their circle.
- **Bots:** a bot choosing new ground inside the Ring (its first rally, a move for the next circle, a shift) takes it in the nearest town (within 220 m) well inside the circle in `royale.townRally` (60 %) of choices, so Squads gather where the buildings are and meet there; one already in the town steps about it (25 m) rather than running across it.

Measured (`towns/towns.probe.test.ts`, copied into `apps/range/test/` to run; 18 whole matches, Squads of 1, 2 and 3, seeds 1-6, the real server with 60 bots; kills in a town counted to 15 m past its rim):

| | Before (`towns/before.txt`) | After (`towns/after.txt`) |
| --- | --- | --- |
| Last circle closes in a town, 400 Ring plans | 6 % | 84 % |
| Stage 4's circle holds a town's middle, 400 plans | 25 % | 84 % |
| Last circle in a town, 18 matches | 0 of 18 | 15 of 18 |
| Kills in towns | 100 of 829 (12 %) | 429 of 866 (50 %) |
| Kills from Stage 4 on in towns | 3 of 94 (3 %) | 42 of 91 (46 %) |
| Deaths to the Ring | 31 | 10 |
| Longest a bot stood stuck | 8 s | 12 s |

A first version without the circles holding the town (`towns/after-1.txt`) closed in towns as often but its late kills were mostly outside them (10 %), and one bot stood stuck 68 s; with the circles holding the town and the review's fixes below (bots in a town step about it), both are gone.

Checked: typecheck; `battle-royale.test.ts` (most matches close in a town, the rest elsewhere, the last circle still moves; Squads start at a town first), `supply-drops.test.ts` (a crate lands in a town inside its circle), `squad-plan.test.ts` (bots lean to a town well inside the circle, never to one outside), `bots-royale.test.ts` and `reboot.test.ts` pass (142 tests); `zero-island-royale.soak.test.ts` now plans its spawns and Ring with the island's towns. Second opinion (read-only review) found no blocking bug and six to fix, all fixed: the island soak never saw towns; the probe would have joined the fast tier (it lives in `.scratch` now); a town with no open ground still steered the drift; bots in a town re-rolled across it on every shift; the crate always took the first-listed town; the heart's share was three numbers (now one in `ground.ts`, the Ring's own 0.6 named).
