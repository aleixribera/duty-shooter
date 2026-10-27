# 02 Bots in the game server, lobby fill and spawn rules

Status: resolved
Release: v1.3.1
Blocked by: 01

## What to build

Bot seats in `GameServer` (ADR 0004), the fill and its join choice, protocol 4, `BOTS_PER_TEAM` and `MAX_BOTS_PER_TEAM` in the server app, compose and docs. Spawn protection, the 8 m and last-two-spawns rules, FFA scored spawns, and 6 more FFA points on Survival Town.

## Acceptance

- [x] One person gets a 3v3; people take bots' seats; the bots leave with the last person.
- [x] Status counts people only and reports the bot fields.
- [x] The bots-only 3v3 runs three minutes cleanly.
