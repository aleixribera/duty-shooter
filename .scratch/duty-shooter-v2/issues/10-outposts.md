# 10 Outposts

Status: resolved
Release: v1.5.0
Blocked by: 02

Mode interface growth (mode state in snapshot, canRespawn, rounds, mode events), Outposts rules, Survival Town zones, HUD (markers + zones strip), bots (team planner).

## Comments

- Mode interface:
  - `ModeId` gains `outposts`. `teamMode(id)` says which modes are team modes, so the client doesn't test for `'tdm'`.
  - `GameMode` gains `scoreLimit`, `canRespawn(id)` (the server checks it before a respawn) and `objective()`, which is the mode's state in every snapshot (`MatchStatus.objective`).
  - `ModeContext.zones` carries the map's zones. A `capture` mode event is added, and `MatchResult.reason` gains `scoreLimit`, `roundLimit` and `forfeit`.
  - Round boundaries come with Charge (ticket 11), the first mode that needs them.
- Team handling moved out of TDM into `TeamRoster` (`modes/teams.ts`): joins, rebalancing, first spawns at the team's set, safe respawns and the kill feed. TDM and Outposts both use it, and its behaviour is unchanged (the modes and spawns tests pass as they were).
- Outposts rules (`modes/outposts.ts`):
  - A zone takes 10 s for one player. The rate is 1×, 1.5× for two and 2× for three or more.
  - Flipping an enemy zone takes twice as long. With both teams inside, the zone is contested and frozen.
  - My own calls where the spec is silent: an empty zone's half-done capture drains back at one player's rate; the holders standing in their zone drain the other side's progress the same way; and a team must undo the other side's progress before starting its own.
  - Every held zone scores 1 point a second. The match ends at 200 points, or with the leader at 10 minutes (a tie is a draw). Kills add nothing to team points.
  - On the scoreboard each player's score is kills plus 5 per capture they stood in for.
  - Spawns: `scoredSpawn` gains a `favoured` rank after the 8 m and sight rules. Outposts favours spawns within 20 m of a held zone's edge.
- Survival Town zones: A is the north house's ground floor, B is the cul-de-sac (r 5 m) and C is the south house's ground floor (r 3.5 m). Each house zone stops below the upstairs floor. A test checks there are nav nodes inside each zone.
- Bots:
  - `planOutposts` (`bots/planner.ts`) is a team planner that the server runs every second for each bot team. Bots go for zones the team doesn't hold (nearest first, spread out with a crowding cost), and a held zone keeps one defender, or two while it is under threat. The plan is deterministic.
  - `BotView.objective` passes the bot its zone. The brain walks to the zone, roams and holds only inside it, and chases noises no more than 12 m past its edge.
  - Fixed along the way: `#follow` replanned every second even toward a fixed goal, which turned a bot back to a doorway node behind it. It now replans only when the goal moves or the bot is stuck.
  - Also fixed: a bot hopping at a ledge it couldn't climb never counted as stuck, because each jump "gained height". Height now counts only once the bot has landed.
  - Not done: the spec's frag "at a zone under threat". Frags still go at remembered enemies, which covers an enemy in a zone the bot just saw.
- HUD:
  - The match bar shows team points against the 200 limit. A strip under it shows A/B/C with the holder's mark and colour, the capture progress in the capturing team's colour, and a blink while contested.
  - Each zone has a marker in the world (letter and distance), kept on screen at the edges.
  - Captures show in the kill feed ("Blue took B from Orange").
  - The end screen names the reason (score limit, ...).
  - The Bot Match and empty-server mode pickers offer Outposts. The intermission vote still offers TDM and FFA until ticket 12 replaces it.
- Tests:
  - `outposts.test.ts`: capture times and rates, flipping, contesting, draining, scoring, limits, spawns, snapshot and capture event over the network, planner.
  - Survival Town: zones have nav nodes; four minutes of bots-only 3v3 Outposts, where both teams capture and a zone changes hands.
  - `ui-model`: Outposts is a team mode.
  - Checked in the browser: an offline 3v3 Outposts match shows the strip filling and the markers.
- `docs/balance.md` regenerated after the bot routing fix. All bands still pass; the overall shares are shotgun 43 %, SMG 58 %, M4A1 59 %, sniper 40 %.
