# 0004 Bots are server seats, not connected clients

Status: accepted (2026-10-27, bots spec)

## Context

Bots need to fill the public lobby while few people are online, and to play offline matches against. They have to move, shoot and die by exactly the same rules as people, with no special cases in the simulation. They also must not hold the lobby open when everyone has gone, because the auto-updater waits for an empty server.

One way to build them is as loopback clients: an in-process `GameClient` per bot over a memory connection. That would receive the full snapshot broadcast for every bot, hit the idle timeout while nobody drives it, and count as a player in the status endpoint and the capacity check.

## Decision

A bot is a seat inside `GameServer` that has no connection.

- Bot ids come from the same `p<n>` counter as people, so ordering by join stays the same.
- Each tick, a bot builds its usercmd from the server's last `TickOutput` and that tick's events, through the pure `Bot` brain in `fps-core/src/bots`. It sends no `viewTick`, so the server does no rewind for its shots.
- Bots join and leave through the mode like anyone else. The mode decides their team and spawn.
- The server keeps the match topped up to the fill (`perTeam` a side). A person who joins takes a bot's seat, taken from the bigger side. The bots leave with the last person.
- `playerCount`, the capacity check and `/status players` count people only. Status reports bots separately.
- Scores mark bots (`bot: true`), so the client can show a BOT tag.

The offline Bot Match runs the same `GameServer` in the page, over a zero-latency memory network, with a normal `GameClient`. Offline and online play share every rule, the HUD and the intermission.

The bots find their way on a nav graph generated from the map's collision at startup (`buildNavGraph`), so the graph can't drift out of step with the geometry. Maps only give it hints for tight spots: doorways, stairs, and climbs.

## Consequences

- The bot brain sees what a player could see, and nothing else: the same `PlayerOutput`s, line of sight through the same world, and a reaction delay. Its only shortcut is an occasional rough sense of where an enemy is, so that nobody can hide forever.
- Bots cost server CPU: about the same as a scripted player each, measured by the server CPU benchmark.
- The join message gains `bots`. Like `mode`, it is honoured only from the first person on an empty server, which bumped the protocol to 4.
- Spawn protection (1.5 s, ending when the player fires) applies to everyone. It's tracked in `GameServer` and checked through `canDamage`.
