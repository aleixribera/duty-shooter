# An eliminated player who comes back is told to join the match

Status: resolved
Release: v2.108.15
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

## Comments
- Fix: the Battle Royale screen's session state gains `out`: the seat has died (one life) or its Squad has a place. Back on the page, such a seat reads "You're out of this match: watch it, and play the next one." with "Watch the match", never "Join the match". `apps/range/src/main.ts` works it out from the seat's score (`deaths > 0` or `place`).
- Test in `royale-lobby-view.test.ts`.
- Seen live: host out by a cooked frag, reloads, rejoins the server: the line and button above; Watch puts it straight into the watch bar with its place, no health or ammo. Shots `shots/bugs/t48/before-host-after-reload.jpg`, `after-host-after-reload.jpg`, `after-host-rejoined.jpg`.
