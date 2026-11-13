# Online plays like local at real ping

Status: resolved
Release: v2.189.0

Spec: `../spec.md`

`PLAN.md` item 3, pass 1 (rough). Measure online play under 100 ms and 150 ms of round trip with 2% loss: hits that land on the shooter's screen count, no rubber-banding when moving, the lobby and match flow never stall.

Acceptance: a scripted two-client run at each condition with the agreement rate of hits and the largest correction logged, and frames that show no snapback.

## Comments

**2026-11-13, loop pass 6.**

- **Reading the plan.** "100 ms of added latency" is read as the round trip a player's ping shows (50 ms each way), with 5 ms of jitter. A WebSocket is TCP, so 2% loss is no lost packet: the packet comes again a round trip and about 50 ms later (fast retransmit after three duplicate acks) and everything behind it waits. The in-memory test network had only UDP-style drops; it now has `tcp: true` for this.
- **What it found, and the fixes.** `packages/fps-core/test/real-ping.test.ts` plays each condition on three seeds: Alice taps at strafing Bob as her screen draws him, Bob walks alone, Bob walks into a match's opening countdown. Before → after:
  - *Walking alone at 150 ms:* pulled back up to 0.98 m, 365 ticks visibly → none. A TCP stall of 200 ms released 13 usercmds at once and the server kept only 12 (`MAX_QUEUED_CMDS`), so the oldest were thrown away. Now 30 (half a second).
  - *Hits:* 95% at 100 ms, 88% at 150 ms → 100% at both (shots at a Bob who had already died on the server don't count either way). A shot during a stall rewound past the 0.3 s window; the client also couldn't draw others far enough back to ride out the stalls (its delay is capped by the window). The window is now 0.5 s (`lagCompensationWindow`; ADR 0006 notes it).
  - *Others drawn:* jumps over two ticks of their walk on 1.1% and 1.5% of frames, up to 1.2 m → 0% and 0.2%, at most 0.25 m. Also a respawn beside the body no longer slides from it (`others()` doesn't interpolate between a dead and a living sample).
  - *The opening countdown:* walking into its end pulled you back 1.2 m at 150 ms (the browser run showed 1.6 m): the server holds everyone, the client predicted the walk. The client now sends and predicts the countdown's usercmds held too, until half its ping before the end; the server lets you walk 50 ms (100 ms ping) to 170 ms (150 ms) after the countdown ends, never before.
- **In the real thing.** `.scratch/next-level/ping/look.mjs` runs the built server, a TCP proxy with the delay and the loss as TCP has it, a dev server through it and a browser that joins Play Online, starts a Team Deathmatch with bots and walks, strafes and sprints for 40 s from inside the countdown. `after-150/` and `after-100/`: 0 frames corrected by more than 5 cm (worst 3 mm), others jumped on 8 of 7689 and 2 of 7561 drawn steps (worst 0.59 m), ping read 217 ms and 164 ms (median), the lobby, start and match never stalled (started in 0.5 s, still joined). The first browser run, before the countdown fix, logged 50 frames pulled back up to 1.6 m, all in the countdown's last second.
- **Second opinion** found: the countdown hold let high-ping players walk a round trip late (now half a ping; the test bounds it); the test didn't prove a countdown ran (it does now); the old window test sat at the new window's edge (latency 0.35 s now); over TCP the in-memory close could overtake data (now it waits behind it). Not changed, in `BACKLOG.md`: a client can claim the full 0.5 s of rewind (backtracking), since `viewTick` and its ping are its own word.
- **Not done in this pass:** the hit agreement is measured on a test lane, not the maps; the browser run measures your own view and others, not hits. Pass 2 can shoot in the browser run.
