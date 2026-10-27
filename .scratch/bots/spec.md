# Bots on Survival Town: offline Bot Match and public-lobby fill

Status: resolved

## Problem Statement

Survival Town has no AI. Offline, the only way to see the map is to walk it alone, and the public lobby is often empty or a 1v1. I want bots that move, fight and die like real players at a moderate difficulty. I want to play against them offline, and to use them to fill the public lobby as an option, with a small number a side. The map and the modes also need proper spawn rules.

## Solution

- **Bots** are server seats with no connection (ADR 0004). They play by the same rules as people and are shown with a BOT tag in the scoreboard and kill feed. Names are player-like, picked from a list.
- **Nav graph**, generated from the map's collision at startup (about 900 nodes on Survival Town), with hints for doorways, stairs and climbs. It covers the ground, the upper floors, the roofs and the vehicles.
- **The brain**, moderate difficulty:
  - **Seeing:** a field of view and line of sight through the world, a few times a second.
  - **Hearing:** shots within 40 m, and hits taken.
  - **Aim:** a human reaction delay (about 0.26-0.38 s), aim error that settles, a turn-rate cap, and recoil pulled down with a lag.
  - **Firing:** bursts at range and ADS beyond 9 m.
  - **Moving:** strafing, crouching at range, chasing from memory, roaming, holding angles, sprinting, sliding, mantling on climb links, and an occasional rough sense of where an enemy is.
  - **Personality:** each name plays a little differently.
- **Lobby fill.**
  - `BOTS_PER_TEAM` (default 3) fills each side while anyone plays. In FFA that's 6 in all.
  - `MAX_BOTS_PER_TEAM` (default 4, at most 4) caps what the first person on an empty server may pick on Play Online.
  - People take bots' seats, and the bots leave with the last person. Status counts people only.
- **Bot Match**, offline: TDM or FFA, 1v1 to 4v4 (FFA: 2 to 8 players). It runs the same game server in the page and pauses with the game.
- **Spawn rules:**
  - FFA uses the scored spawn, with the out-of-sight preference team deathmatch already had.
  - Both modes never spawn within 8 m of a living enemy if another spawn will do, and avoid the player's own last two spawns.
  - Survival Town has 6 more FFA points (garages, east side paths, street end), 20 in all.
  - Spawn protection lasts 1.5 s and ends when the player fires.
- **Protocol 4:** the join message gains `bots`, scores gain `bot`, and status gains `bots`, `botsPerTeam` and `maxBotsPerTeam`.

## Testing Decisions

- **Core** (`bots.test.ts`, `bots-server.test.ts`, `spawns.test.ts`):
  - A* and the generated graph.
  - A bot walks through a doorway and climbs a crate.
  - A bot kills a target in the open.
  - A bot never fires without the target in view.
  - Reaction time is at least 0.2 s.
  - The moderate band: median time to kill a strafing player at 20 m is 0.7-2.5 s.
  - Determinism.
  - Fill, seat hand-over, caps, and the join choice.
  - Bots stay frozen in the intermission.
  - Spawn protection.
  - The spawn rules.
- **Survival Town** (`survival-town-nav.test.ts`):
  - Coverage and connectivity.
  - Every node is standable and inside the boundary.
  - Every spawn has a node near it.
  - A 3-minute bots-only 3v3: both teams score, nobody leaves the boundary, and no bot roams in place for 8 s.
- **Server CPU benchmark:** 2 people with 6 bots cost less than 8 scripted people.

## Out of Scope

Difficulty settings other than moderate, bots on the Practice Range, and bots that vote.
