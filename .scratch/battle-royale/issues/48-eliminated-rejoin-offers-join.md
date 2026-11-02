# An eliminated player who comes back is told to join the match

Status: open
Severity: S3
Found by: 35

## Repro
1. Battle Royale, get eliminated, then reload the page and open the Battle Royale screen.
2. Read the lobby.

It says "The match has started. Join it to drop in." with a "Join the match" button, though the player can only watch.

## Evidence
- Screenshots `.scratch/battle-royale/shots/bugs/16-host-after-reload.jpg` and, after joining, `.scratch/battle-royale/shots/bugs/17-host-rejoin-dead.jpg`.

## Suspected area
`apps/range/src/main.ts` `updateLobby` (~589-660): the copy and the button don't know the seat is out. Say the player is out and offer to watch.
