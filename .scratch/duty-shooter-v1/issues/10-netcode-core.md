# 10 Netcode and game mode in fps-core

Status: ready-for-agent
Milestone: 4 (netcode, other players, hit zones, FFA, arena, passphrase)
Blocked by: 07, 08, 09

## What to build

Spec "Netcode" and "Game modes": a transport interface plus an in-memory implementation with configurable latency, jitter and packet loss; the authoritative server simulation; client prediction with reconciliation (rewind and replay unacknowledged usercmds) and a smoothed correction output; snapshot interpolation of other players; lag compensation (rewind hitboxes to the shooter's view time, capped window) when projectiles spawn; a join handshake with name and passphrase, rejected before any game messages on mismatch; player cap (default 8), maximum message size, rate limit. The game-mode interface (scoring, team assignment, friendly fire, spawn selection, round flow, win conditions) and a free-for-all implementation with instant respawn furthest from enemies, kill/death counts and kill feed events. Extend the headless match harness to run a server and N clients over the in-memory transport.

## Acceptance criteria

- [ ] Networked headless tests (80 ms latency, jitter, 5% loss): prediction matches the server once reconciled; a shot at a strafing target registers where the shooter saw it, within the window; hits beyond the window are rejected; FFA scoring, kill feed events and respawns away from enemies; wrong passphrase rejected; player cap enforced.
- [ ] A determinism test covers a networked match with a fixed seed.
