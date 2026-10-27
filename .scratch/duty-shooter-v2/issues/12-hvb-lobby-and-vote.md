# 12 Humans vs bots, the 12-player lobby and the match vote with map switching

Status: open
Blocked by: 11

HvB team sizing, MAX_PLAYERS 12, MAX_BOTS_PER_TEAM 6, server holds every lobby map and switches at matchStart, 3-option vote + HvB majority, map announced before matchStart, ready message / spectator until ready, status fields, next protocol version, ADR.

## Comments

- 2026-10-27, from the owner (in the lobby-page session, outside this arc): the online server now has a **lobby** between matches, and the owner chose "the host presses Start" over a vote. The first person in is the host; they pick mode, bots a side and map on the lobby page and press Start. After every match: nuke (6 s), scoreboard (10 s), then everyone goes back to the lobby. So online there is no 3-option vote any more: the mode vote only runs in Bot Match. For this ticket that means: map switching becomes the host's map pick (`LobbyState.maps` already lists the lobby's maps; today only the server's one map), the HvB sizing goes in as a lobby choice, and "ready / spectator until ready" maps onto the lobby (people in the lobby are out of play until Start; a mid-match joiner plays at once). Code: `GameServer` option `lobby`, `LobbyState` on `MatchStatus.lobby`, client messages `lobby` and `start` (protocol stays 7), `packages/fps-client/src/ui/lobby.ts`. Tests: `packages/fps-core/test/lobby.test.ts`.
