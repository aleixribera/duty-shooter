# 03 Team deathmatch, the match timer and draws

Status: resolved
Milestone: 1 (core, headless)
Blocked by: none

## What to build

The second game mode, plus time limits for both modes. See the spec section "Modes, intermission and voting (shared core)".

- **Team deathmatch** implements the existing game-mode interface:
  - Two teams.
  - **Joining:** a joiner goes to the smaller team, or on a tie to the team with the lower score.
  - **Rebalancing:** at match start, teams rebalance with the fewest moves possible.
  - **Friendly fire** is off: a team hit does no damage and produces no hit, flinch or kill events.
- **Team spawns:**
  - A map supplies one spawn set per team.
  - A player's first spawn of a match is chosen from their team's set.
  - Later spawns are scored by nearness to living teammates and distance from living enemies, with no enemy line of sight to the spawn point.
  - A map with no team sets falls back to free-for-all spawn points, scored the same way.
- **Win conditions as mode options:** a kill limit and a time limit.
  - TDM defaults: 75 kills or 600 s. FFA defaults: 30 kills or 600 s.
  - A time-out picks the leader, or declares a draw on a tie, so `matchEnd` gains a draw outcome.
  - The server broadcasts the match clock.
- **Harness:** the networked harness can run TDM, and team assignments appear in player outputs.

## Acceptance criteria

- [x] Networked tests for TDM:
  - joiners balance
  - the match-start rebalance makes the fewest moves
  - friendly fire produces no damage and no events
  - the kill limit ends the match with the right winner
  - a time-out declares the leader, or a draw on a tie
  - first spawns come from the team's set
  - later spawns avoid enemy sightlines
- [x] Networked tests for FFA: a time-out picks the most kills, or declares a draw, and both limits work.
- [x] The existing FFA and spawn tests still pass.

## Comments

Resolved together with 04, since the intermission replaces the old restart cycle. `TeamDeathmatch` and the reworked `FreeForAll` live in `packages/fps-core/src/modes/`; both take `killLimit` and `timeLimit` (TDM 75 / 600 s, FFA 30 / 600 s by default) and report a `MatchResult` (winner, draw, reason) that the server turns into `matchEnd`. Team spawn scoring (out of enemy sight first, then far from enemies and near teammates) is in `modes/spawns.ts`. Teams are 1 (blue) and 2 (orange); `Simulation.setTeam` applies the match-start rebalance, which keeps everyone's team and moves the latest joiners of the bigger team until the sides are within one. Tests: `packages/fps-core/test/modes.test.ts`, all networked under 80 ms latency, jitter and 5 % loss. The networked harness defaults to FFA so the older tests keep their meaning; the live server defaults to TDM.
