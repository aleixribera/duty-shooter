# 11 Multiplayer: server app, WebSocket transport, other players

Status: ready-for-agent
Milestone: 4 (netcode, other players, hit zones, FFA, arena, passphrase)
Blocked by: 10

## What to build

`apps/server`: Node + `ws`, a WebSocket transport implementing the transport interface at 60 Hz, passphrase and player cap from the environment, serving the built range app. Client: WebSocket transport, a join screen with name and passphrase (remembered in browser storage) (65, 71), prediction, reconciliation and interpolation wired into the game loop (72-75), ping in the HUD. Other players as stylised blocky soldiers with procedural poses for run, crouch, prone, slide and aim pitch, holding a third-person M4A1 (76); cosmetic client-side ragdolls on death (43); blood on hits; kill feed and K/D (80); respawn. The range and course stay usable while others fight in the arena (81). An offline mode stays available for solo range practice.

## Acceptance criteria

- [ ] Playtester agent with two browser tabs against a local server: both join, see each other move smoothly, shoot each other, the kill feed and K/D update, respawn works, a wrong passphrase is rejected.
- [ ] Server CPU and memory with 8 simulated clients measured and reported.
