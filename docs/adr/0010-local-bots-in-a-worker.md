# 0010 Local bots run the Battle Royale server in a Web Worker

Status: accepted (2026-11-03, Battle Royale spec "Server and Local bots", ticket 15). Builds on 0004 (bots as server seats), 0008 (large-map nav built ahead) and 0009 (the Battle Royale process).

## Context

The spec wants a Battle Royale playable on one machine against 59 bots, with the same screen and the same rules as the server's, and never fewer bots. The target is an integrated-graphics laptop, where the render thread has no time to spare. Bot Match already runs a `GameServer` in the page (`BotMatchDriver`), stepped on the render thread every frame over the in-memory network. At 59 bots on Zero Island that would put the whole server tick (bots' brains, nav, the Ring, relevance) on the thread that has to draw the island at 60 fps.

## Decision

- **The same server in a Web Worker.** `apps/range/src/royale-worker.ts` runs `serveLocalRoyale` (`apps/range/src/local-royale.ts`): it builds Zero Island, decodes the island's nav from the build's `nav/zero-island.nav` (fetched by the worker itself), and runs a `GameServer` set up as the Battle Royale process sets up its own: Battle Royale mode, 60 fixed seats, bots up to `WIDE_SCALE`, a lobby with the page's player as host. Its loop keeps 60 Hz by the wall clock (`TickClock`: a short stall is caught up, up to 5 ticks, the rest of a longer one let go, as the server's loop does).
- **The protocol a WebSocket carries, over the worker's channel.** `connectPort` and `servePort` (`packages/fps-core/src/net/port.ts`) are a `Connection` and a `ServerTransport` over anything with `postMessage` and a `message` event. Text and binary frames go as they would on a socket, copied rather than transferred so a sender keeps its buffer. The page's side is `LocalRoyaleDriver`, an `OnlineDriver` on that connection, so the lobby, the Preparation and its load gate, relevance, Downed and Revive, the HUD and the end are the online game's code, not a copy.
- **Started on demand, stopped on leaving.** The worker starts when the player opens a Local bots lobby, while the page builds the island on its own thread, and is terminated when the driver is disposed (leaving the game or the lobby).
- **No staleness check on the nav in the browser.** The server refuses a nav file whose world fingerprint doesn't match the island it built. In Chrome, a handful of the island's rotated solids come out a bit different in the last place of their sines and cosines from Node's, which changes the fingerprint and nothing else. The worker's file comes from the same build as its code, served `no-cache` with an ETag, so it decodes without the check.
- **A longer idle limit.** The page's player is let go after 600 s of silence instead of the server's 20 s: in another tab the page stops sending, and nobody else is waiting for that seat.

Rejected: stepping the server on the render thread as Bot Match does (the cost this decision exists to move); a `SharedArrayBuffer` link (needs cross-origin isolation headers on every response, for traffic that is a few kilobytes a snapshot); splitting the bots' brains alone into the worker (two simulations to keep in step, and not the server code the spec asks for).

## Consequences

- Measured headless on this PC (Chrome, production build, 1920 x 1080, vsync off): the worker's tick averaged 0.7 ms (p99 1.2 to 6.7 ms) with 59 bots, at 60 ticks a second, all of it off the render thread. The page's main thread spent 3.1 to 3.7 ms a frame, the same work as an online Battle Royale. The integrated-graphics target is still unmeasured on real hardware (ticket 27).
- The page holds the island twice, once for drawing and prediction and once in the worker, plus the nav (about 16 MB, about 6 MB compressed on the wire, cached by its ETag).
- By the spec's No humans left, a Local bots match ends as soon as its one person is out: there is nobody to spectate for.
- Bot Match keeps stepping its server on the render thread: its matches have at most 12 bots on small maps.
