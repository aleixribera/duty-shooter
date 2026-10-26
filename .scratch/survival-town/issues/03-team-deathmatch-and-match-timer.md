# 03 Team deathmatch, the match timer and draws

Status: ready-for-agent
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

- [ ] Networked tests for TDM:
  - joiners balance
  - the match-start rebalance makes the fewest moves
  - friendly fire produces no damage and no events
  - the kill limit ends the match with the right winner
  - a time-out declares the leader, or a draw on a tie
  - first spawns come from the team's set
  - later spawns avoid enemy sightlines
- [ ] Networked tests for FFA: a time-out picks the most kills, or declares a draw, and both limits work.
- [ ] The existing FFA and spawn tests still pass.

## Comments
