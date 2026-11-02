# Server down: the lobby still says "You are the host" with Start enabled

Status: resolved
Release: v2.108.6
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

## Comments

- Cause: `updateLobby` in `apps/range/src/main.ts` built the lobby and Battle Royale views from the last match state it heard and never passed the driver's status, so neither page could tell `reconnecting` from a live lobby.
- Fix: both views take `reconnecting`. The Battle Royale screen's joined line and main button now come from the pure `royaleSession()` (`packages/fps-client/src/ui/royale-lobby.ts`): while reconnecting the dot is amber (`busy`), the line reads "Lost the connection to the server. Reconnecting: the match waits until it’s back.", the button is a disabled "Reconnecting…", and the Squad size, Join and Start a new Squad are held. The Play Online lobby page holds the host's picks and Start the same way and says "Lost the connection. Reconnecting…" beside the button (the phone layout hides that line; the disabled button says it there).
- Didn't promise a time in the line: the server holds a dropped seat 300 s, but nothing after a restart.
- Repro and check: `.scratch/battle-royale/t38/server-down.mjs [tag] [royale|lobby]` (own server on 3211, Vite on 5191). Before: `reconnecting` for 20 s with "ds-state up: … You are the host" and Start match enabled, on both pages. After: busy line and disabled controls at 5 s and 20 s, back to the host line and Start 15 s after the server restarts. Screenshots `.scratch/battle-royale/shots/bugs/t38/after-*.jpg` (desktop, phone, lobby).
- `design-audit` not run: it fans out to subagents, which the implementer rules forbid. The change reuses the existing state line and button styles; checked at desktop and phone width.
