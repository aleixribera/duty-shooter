# Stop players spawning in the same place on normal maps

Status: resolved
Release: v2.105.2
Blocked by: 30

Spec: `../spec.md`, story 88

Owner bug report: on normal maps, with bots or online, the player always spawns in the same location. See it fail first with a count of spawn points over repeated matches and respawns, per map, mode and team. Fix it for match starts and respawns on every map and mode, keeping team sides, spawn protection and safety from nearby enemies. Team modes keep their side of the map, but not one fixed spot. Golden hashes that pin the old order may change on purpose: say which ones. Battle Royale spawns aren't in scope.

## Comments

**Seen failing** (real browser through `launchChrome()`, `.scratch/battle-royale/spawns/spawn-probe.mjs`, counts in `spawns/before/`): in Bot Match the player's first spawn was the same spot in every match on every map: Switchyard TDM (-50,-26) 2/2, Survival Town TDM (-18,-38) 2/2, Crash TDM (-38,34) 2/2, Switchyard FFA (-50,-20.5) 2/2. On Switchyard TDM the whole respawn sequence repeated identically match after match (the same five spots in the same order). Online (local server, 3 matches) respawns landed on (4,26) both times.

**Cause**: every pick was a pure function of the state. The roster handed out a team's first spawns in fixed order from index 0, and the human joins first, so they always got spot 0; FFA's lone first spawner always got spawn 0; respawns took the single best-scoring spawn with ties to the earlier one, so the same situation gave the same spot, and bots are deterministic, so the situations repeated.

**Fix**: spawns are drawn (glossary: Spawn draw). TDM, FFA, Outposts and Charge take a `random` option (default `Math.random`, like Gun Game and Battle Royale already did; Gun Game passes its own to its inner FFA). A team's first spawns come from its own set in an order shuffled each match and each Charge round, keeping the overrun check, so sides hold and teammates never share a spot. Later spawns go through `scoredSpawn` with the draw: the safety rules stay strict (no living enemy within 8 m, out of sight, favoured, not the last two), and among the candidates that meet them it picks uniformly from those scoring within 10 m of the safest. FFA's no-enemy rotation is gone: with no enemy every spawn is as safe and one is drawn. Spawn protection is untouched.

**Seen passing** (same probe, `spawns/after/`): Switchyard TDM first spawns (-51,5)x2, (-51,19) over 3 matches; Survival Town TDM (-12,-44.5)x3, (-4,-40) over 4; Crash TDM (-34,29)x2, (-34,34), (-30,34) over 4; Switchyard FFA three different first spawns in 3 matches and 9 different respawn spots in 10; online Switchyard (-49,12)x2, (-51,19) first, respawns at two different spots. Every team first spawn stayed in its own team's yard.

**Regression tests**: `apps/range/test/bot-match.test.ts` "where you appear" plays 6 Bot Matches each on Switchyard TDM, Survival Town Outposts and Switchyard Charge (Math.random seeded) and checks at least 3 different starts, every one in the player's own team set; red before the fix (1 place each). `packages/fps-core/test/spawns.test.ts` adds respawn draws (all 4 safe spots reached, never the seen, close or much-less-safe one; old code cycled 3) and first-spawn order per match (stays in the team's own set, teammates never share).

**Tests changed on purpose** (no golden hashes pinned spawns): the networked test harness (`createNetworkedMatch`) now gives tdm, ffa, outposts and charge a `random` of 0 unless a test passes its own, so harness tests stay deterministic; the net test "rotates through the spawns when nobody else is alive" became "draws among the spawns..." with its own draw sequence; the spawns test about stale enemies pins `random: () => 0`.

