# Battle Royale runs in its own server process

Status: resolved
Release: v2.108.1
Blocked by: 07

Spec: `../spec.md`

Spec: Server and Local bots. Own OS process behind the one public address, started on demand, memory limit set from measurement, Play Online unaffected. New ADR. Deployed and checked on the home server.

## Comments

From ticket 03: this process needs `warmUp` (`apps/server/src/warm-up.ts`) before it takes players, or the first ticks run to 60 ms. Play Online beside 60 seats was only measured under the test slice's CPU cap: measure it again once they share the container.

Done in v2.108.0 (the code, ADR 0009) and v2.108.1 (the memory limit, from measurement).

- **Shape.** One container, two processes. The process on the public address forks the Battle Royale process from the same bundle (`ROYALE_PROCESS=1`, `MODE=battle-royale`, 60 seats, no port) the first time `/royale/status` or `/royale/ws` is asked for. Each `/royale/ws` upgrade is handed over with its socket over the IPC channel (`child.send(msg, socket)`), and the child replays it on its own HTTP server, so the origin check, the per-address socket limit and deflate run there, and Battle Royale traffic never crosses Play Online's thread. Rejected: a second container, proxying the bytes, and a worker thread (ADR 0009).
- **Lifecycle.** `/royale/status` says `starting: true` until the child is ready, and the page waits on that before opening its socket; an upgrade that arrives first is held for up to 30 s. After 3 min empty in the lobby, the child is stopped. After a crash, `/royale/status` returns 503 for 5 s, then a fresh child starts. A child whose parent is gone exits. Ticket 30's warm-up and profiler run in the child as they do in the standalone `MODE=battle-royale` server.
- **Ticket 12's leftovers fixed.** `/status` is Play Online's alone and never names Zero Island. `/healthz` `players` counts both processes (the updater restarts only at 0), plus a separate `royalePlayers`. Event-log lines from the child carry `"process":"royale"`, and the play report keys sessions by process.
- **Measured** on the home server: v2.108.0 in a spare container with no memory limit, run alongside live. Play Online had 12 scripted players and a Battle Royale had 2 scripted players and 58 bots, at the same time for 5 min.
  - Container peak: 582 MiB (`memory.peak`). The Play Online process was about 240 MB RSS and the Battle Royale process about 415 MB.
  - Battle Royale: 20 snapshots/s, round trip p99 25.7 ms, worst tick 12.4 ms.
  - Play Online: 60 snapshots/s, round trip p99 40.9 ms.
  - Limit set to **1 GB** (`mem_limit` and `memswap_limit`). The box had 3.8 GB available.
- **Live server change.** In `/opt/homelab/stacks/duty-shooter/compose.yaml`, `mem_limit` and `memswap_limit` went from `512m` to `1g`, edited in place. The backup is `compose.yaml.bak-20261102`. Then `docker compose up -d --wait`, which came back healthy with `memory.max` = 1073741824. No `.env` change.
  - The server's compose has drifted from the repo: it also has `oom_score_adj: -500` and a different comment. I left both as they were, so copying the repo file over it would drop `oom_score_adj`.
- **Checked live** through the public route `https://aleix.tailfef0f7.ts.net:10000/` (Funnel to 127.0.0.1:3090, the address the arcade portal hands out), on v2.108.0, using `.scratch/battle-royale/process/both-at-once.mjs`.
  - With two headless Chromes, Play Online (Survival Town TDM, 1 player and 7 bots, 21 ms) and a Battle Royale (1 player and 59 bots) were under way at the same time. Screenshots are in `.scratch/battle-royale/process/shots/live-*`.
  - Live container afterwards: `memory.peak` 298 MiB, healthy.
  - A second run joined the first run's Battle Royale still under way and was offered "Watch the match", which is correct.
  - Earlier, on a local build: killing the child left `/healthz` ok, `/royale/status` returned 503 and then restarted. Killing the parent took the child down with it.
- **Not verified, and possibly pre-existing.** Funnel names the visitor in `X-Forwarded-For`, but the server trusts that only from loopback. If Docker's userland proxy makes connections arrive from the bridge gateway, every Funnel visitor would share one 12-socket limit. Worth checking separately.
- **Stale doc.** `docs/deploy.md` "Funnel" still says this game is on `:443`. Funnel now has it on `:10000`, and the arcade portal is on `:443`.
