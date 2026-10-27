# 0005 The server holds every lobby map, and humans vs bots is a match setting

Status: accepted (2026-10-27, v2 spec, ticket 12)

## Context

The v2 spec asked for an intermission vote over three random map-and-mode options, a majority vote on humans vs bots, and a ready message so a client still loading the next map would spectate until it caught up (protocol 6). Before this ticket landed, the owner gave the online server a lobby where the host picks and starts each match (protocol 7). The vote no longer has a home online, but map switching and humans vs bots still do.

## Decision

- **Maps.** `GameServer` holds a list of `ServerMap`s (collision, spawns, zones, sites, nav graph), all built at startup. The host picks one in the lobby (`lobby` message, `map`), and the server moves to it at the next `matchStart`: the simulation's world is swapped, and each bot gets a fresh brain on the new map's nav graph (same seat, name and profile). `LobbyState.maps` lists them and `MatchStatus.map` names the map being played. The Practice Range is not a lobby map.
- **Loading.** Each page follows the host's pick while still in the lobby: a new `Game` on that map takes over the same `OnlineDriver`, which predicts on the new collision. The lobby page's Join button waits until the map's lighting is in. There is no server-side ready message. Start seats everyone in the lobby at once, so a page still loading (like a player who hasn't pressed Join yet) has a body standing at its spawn, covered only by the usual spawn protection. Following the pick in the lobby gives a page the whole time the host spends choosing to load, so this is rare.
- **Humans vs bots.** A setting (`hvb`), picked by the host in the lobby (or by the first joiner on a server without one, or the Bot Match menu). In team modes, entrants carry a `side`: people team 1, bots team 2. `TeamRoster` never moves a player with a side when it balances. The bot team is `hvbBots(people) = min(max(4, people + 2), maxPerTeam, seats left)`; the usual fill does not apply. Free-for-all ignores the setting. Status and the event log carry `hvb`.
- `MAX_BOTS_PER_TEAM` is 6 and `DEFAULT_MAX_PLAYERS` 12. The protocol stays at 7: every new field is optional on the way in, and a client from before the switch never sends `map` or `hvb`.

## Consequences

- No intermission map vote online. Bot Match keeps its mode vote, on the map picked in the menu.
- Startup builds every lobby map's nav graph: a second or two, once.
- The match does not wait for a slow page: its player stands at spawn, open to fire once spawn protection ends, until the page is ready and they press Join. A server-side ready message (sit out until ready) would close that gap; it needs a protocol bump, so it is left for later.
