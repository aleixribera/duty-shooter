# 0009 Battle Royale plays in a process of its own, behind the one address

Status: accepted (2026-11-02, Battle Royale spec "Server and Local bots", ticket 13). Builds on 0004 (bots as server seats) and 0006 (binary snapshots).

## Context

Ticket 12 put Battle Royale inside the Play Online server: the island was built into that process, a Battle Royale lobby took over the one `GameServer`, and while a Battle Royale ran nobody could play Play Online. The island and a 60-seat match also took that process from about 106 MB to about 317 MB, against the live container's 512 MB limit, and after a Battle Royale emptied `/status` still reported its lobby, so the Play Online tile read "Battle Royale on Zero Island". The spec wants a Battle Royale in its own OS process, behind the same public address, started when it's needed, with the memory limit set from measurement and Play Online untouched by a slow or crashed match.

## Decision

- **Two processes in the one container.** The server that holds the public address (the main process) plays the team modes and serves the page, `/healthz`, `/status` and `/ws` as before, and never holds Zero Island. Battle Royale runs in a child Node process, forked from the same bundle with `ROYALE_PROCESS=1`, `MODE=battle-royale` and 60 seats. It is the same server code as a `MODE=battle-royale` server on its own (the load test's), with ticket 30's warm-up (`spendFirstUpgrade`, then the rehearsed openings and match) and tick profiler, so what the gate measured is what runs.
- **One address, two paths.** `/royale/status` answers the Battle Royale screen with the child's lobby status, and `/royale/ws` is its socket. Nothing else changes for a client: the same origin, the same protocol.
- **The connection goes to the child whole.** On a `/royale/ws` upgrade the main process checks the origin, then sends the request's method, path and headers over the IPC channel with the socket's handle (`child.send(message, socket)`), and keeps nothing: its copy is destroyed once the handle has gone. The child replays the upgrade on its own HTTP server, so the origin check, the 12-sockets-per-address rule and WebSocket compression run there as they do in the main process. After that the main process never sees a byte of Battle Royale traffic, so a 60-seat match costs Play Online's thread nothing. Before sending, the socket's `server` field is cleared: Node otherwise sends it the cluster's way, and the main HTTP server's close then waits for an answer from a child that may be gone.
- **Started on demand, stopped when idle.** The child starts the first time `/royale/status` or `/royale/ws` is asked for, so opening the Battle Royale screen warms it while the page builds the island. Until it reports ready, `/royale/status` says `starting: true` and the page waits before opening its socket; an upgrade that arrives sooner is held up to 30 s. Twice a second the child sends its status; after 3 minutes with nobody in it and its lobby idle, the main process stops it and the memory goes back to the box.
- **A crash ends only its own match.** When the child exits on its own, the main process logs it, refuses the Battle Royale for 5 s (`/royale/status` answers 503, which the screen shows as a server restarting) and then starts a fresh one when it's next asked for. Play Online's loop doesn't notice. A child whose parent has gone exits, so nothing is left behind.
- **The health check counts both.** `/healthz` reports `players` as the people in Play Online and in the Battle Royale together, with `royalePlayers` apart: the updater restarts the container only when it reads 0, and a restart ends both.
- **One event log, told apart.** The child appends to the same `events.jsonl` with `"process": "royale"` on every line. The play report keys a session by process and seat, since seat ids repeat between the two, and the child's `serverStart` ends only its own sessions.

Rejected: a second container (a second port and route, or a proxy in front, for a match that's off most of the time); proxying the socket's bytes through the main process (every Battle Royale snapshot would cross Play Online's thread); a `worker_threads` worker (one heap limit and one crash for both, and the `ws` server and upgrade path would have to be split by hand).

## Consequences

- Play Online and a Battle Royale play at the same time. `/status` is Play Online's alone and never names Zero Island.
- Memory: the main process sits at about 130 to 145 MB (most of it the page's precompressed files), and the child adds the island, its nav and a 60-seat match. The measured peak and the container limit it set are in `docs/deploy.md` ("Hardening").
- A Battle Royale's first player waits for the child's start and warm-up, about 6 to 9 s, while the page builds the island anyway: on this PC the Battle Royale screen to its lobby took 8.7 s, against 4.9 s in ticket 12 with no warm-up at all.
- `MODE=battle-royale` on its own still runs a Battle Royale server alone, which the load test and the gate use. `WS_PATH=/royale/ws` points the load test at a main server's Battle Royale.
- Local bots (ticket 15) run the same server code in a Web Worker on the page: nothing here.
