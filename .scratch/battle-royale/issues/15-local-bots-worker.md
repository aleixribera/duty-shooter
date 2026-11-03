# Local bots in a worker

Status: resolved
Release: v2.113.0
Blocked by: 07,12

Spec: `../spec.md`

Spec: Server and Local bots. Same server code in a Web Worker with all 59 bots. New ADR.

## Comments

- Shape (ADR 0010): `apps/range/src/royale-worker.ts` runs `serveLocalRoyale` (`apps/range/src/local-royale.ts`), the Battle Royale process's `GameServer` setup (60 fixed seats, bots up to `WIDE_SCALE`, a lobby) in a Web Worker. The page talks to it with the WebSocket protocol over the worker's channel (`connectPort`/`servePort`, `packages/fps-core/src/net/port.ts`) through `LocalRoyaleDriver`, an `OnlineDriver`, so lobby, Preparation, load gate, relevance, HUD and end are the online code. 59 bots, never fewer.
- The worker fetches `nav/zero-island.nav` itself (16.5 MB, about 6 MB gzip on the wire, ETag-cached) and decodes it without the world-fingerprint check: Chrome's sines and cosines differ from Node's in the last bit on 43 of the island's rotated solids, which changes the fingerprint and nothing else. The nav comes from the same build as the code.
- The page's player is let go after 600 s of silence, not 20 s, so a minute in another tab doesn't lose the match. The match doesn't pause with the menu, as online.
- Battle Royale screen: Server / Local bots is a real choice before joining (fixed once in a lobby). Local bots shows "Open lobby", its own steps (Starting the bots, Building Zero Island, Joining the lobby), no passphrase, and "A bot plays it" on bot seats. A worker that fails says so on the screen; one that dies mid-match closes the game's connection.
- Found on the way: in Duos or Trios, a person out while their Squad's bots still stood got "No winner" back on the screen, as No humans left placed nobody still standing. The Squads still standing now share the last of their places ("12th of 20"), per the glossary's "placed by how many Squads remained". Online gets the same fix.
- Spectating: by the spec's No humans left, a Local bots match ends the moment its one person is out, so there's nothing to spectate. Not changed; it's the online rule too.
- Measured headless on this PC (Chrome, production build, 1920x1080, vsync off, 40 s of play each): Solos frame 3.14 ms mean, p99 4.7 ms; Trios 3.07-3.38 ms mean, p99 5.0-5.2 ms; main thread 3.0-3.4 ms a frame (all of it the page's own rendering and client); the worker's tick 0.52-0.75 ms mean, p99 0.8-6.7 ms, at 60 ticks a second off the main thread. Integrated graphics still unmeasured on real hardware (ticket 27).
- Play-through: `.scratch/battle-royale/local-bots/play.mjs` (SQUADS=1 and 3): screen, lobby in about 3 s, Preparation with 60 alive, play, the end back on the lobby with the place ("40th of 60", "12th of 20"). Shots in `.scratch/battle-royale/shots/local-bots/`, desktop and phone width. The design-audit skill wasn't run: it works through parallel reviewer subagents, which the implementer rules forbid; the screen was checked by eye at both widths instead.
