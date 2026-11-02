# Server down: the lobby still says "You are the host" with Start enabled

Status: open
Severity: S2 (clear UI break: the page claims a working lobby while it is reconnecting)
Found by: 35

## Repro
1. Run a server, open the page, Battle Royale, Join server, so the lobby shows "You are the host: start...".
2. Stop the server.
3. Wait over a minute.

The lobby keeps saying "In the lobby. You are the host: start..." with Start enabled and the status dot green, while `duty.driver.status` is `'reconnecting'` the whole time (over 70 s). Restarting the server recovers correctly.

## Evidence
- Screenshots `.scratch/battle-royale/shots/bugs/20-phone-server-down-lobby.jpg`, `.scratch/battle-royale/shots/bugs/21-phone-server-down-26s.jpg`.
- Driver status `reconnecting` for >70 s while the lobby text and dot were unchanged.

## Suspected area
`apps/range/src/main.ts` `updateLobby` (~589-660) and the reconnecting check (~769): the lobby view doesn't read the driver status. It should show a reconnecting line, a non-green dot, and disable Start.
