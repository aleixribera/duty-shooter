# Plan

The order of work for duty-shooter. Written by the director chat; the loop's passes read it and build from the top. The vision is `.scratch/next-level/spec.md` and wins over this file: its five objectives (2026-11-13) are what every item serves.

Decided with Aleix on 2026-11-13:
- The countdown idea lands in play; it stays.
- Five objectives, in this order: multiplayer and lobby controls, runs on a toaster, gameplay and world, weapons, easy to understand.
- One graphics preset. Never add Low/Medium/High/Ultra or a quality tier; make the one picture cheaper instead.
- The ten-row scorecard is retired: it graded a scripted player strafing at walls and stopped moving after review (d). Reviews now judge the five objectives.
- Placeholder names stay plain (Smoke, Flash, Fast Hands, Soft Soles, Blast Vest): a newcomer reads them at once.

## Current stage: the five objectives

Work top to bottom, each item rough first (it works end to end) before any item gets a second pass. Tickets live in `.scratch/next-level/issues/`; file one per item when you start it. Tickets filed from review (h) on are worked only if they are something broken a player meets; the rest are closed as superseded by this plan.

0. **Bots stop pinging offline** (Aleix's complaint, 2026-11-13: "they are annoying, and should only ping in multiplayer"). Today a bot's pings go out on every server, Bot Match and Local Battle Royale included (`fps-core/src/net/server.ts`, around line 1578). Bots ping only in online matches (Play Online and the server's Battle Royale), and there sparingly: no repeat on an enemy already marked, and a cooldown per bot, so a side's pings never stack in the feed or the HUD.
   Acceptance: a Bot Match and a Local Battle Royale run with no bot ping in the feed, the HUD or the sound; an online match with bot fill still shows bot pings, at most one per bot per cooldown; a test holds both.
1. **A review that sees what a player meets.** Rebuild `reviews/capture.mjs` (and the review method in `.claude/iterate.md`) so the scripted player turns toward the nearest enemy and gets kills, a match is run on to its last minute, sound is recorded, every map and mode is visited in turn, two clients share an online lobby, and frame times are logged. The reviewer gives each objective pass or fail with evidence and its biggest gap.
   Acceptance: one capture holds a hit marker and score popup on a kill, a frame and audio from the last minute, a lobby with two clients, and a frame-time summary.
2. **Lobbies you can bring friends into** (objective 1). Today the server runs one public lobby of 12 that everyone with the link joins. Add private lobbies with their own link, a party that stays together between matches, host controls over teams (move a player, balance) and kick, and rejoining your seat after a dropped connection.
   Acceptance: three scripted clients: the host makes a private lobby, two join by its link, the host moves one to the other side and kicks the other, starts the match; a client cut off for 5 s comes back into its seat.
3. **Online plays like local at real ping** (objective 1). Measure under 100 ms and 150 ms of added latency with 2% loss: hits that land on the shooter's screen count, no rubber-banding when moving, the lobby and match flow never stall.
   Acceptance: a scripted two-client run at each condition with the agreement rate of hits and the largest correction logged, and frames that show no snapback.
4. **Runs on a toaster** (objective 2, ticket 35). The one picture at 60 fps on integrated graphics. Reference toaster: the Fedora laptop's integrated GPU (`ssh uni-laptop`, run headless, nothing on its screen); this PC's throttled runs (`one-picture/potato.mjs`) stand in when it is away.
   Acceptance: `?benchmark` on every map on the laptop: mean 60 fps or better at the screen's own resolution, 1% low 40 or better; Battle Royale's Zero Island included.
5. **Gameplay and the world feel good** (objective 3). Every map, not only Survival Town: the gaps the new review finds in movement, spawns, flow, the countdown across the whole match (ticket 36's later parts) and the Ring (ticket 33).
   Acceptance: the review's objective 3 passes on every map.
6. **Every weapon feels good** (objective 4). Each gun in the arsenal fired in the Practice Range: its own sound, recoil that returns, a hit marker and kill confirm that land, a role no other gun fills.
   Acceptance: a clip per weapon with sound, and the review's objective 4 passes for each.
7. **Easy to understand in a short time** (objective 5). From opening the link to playing in seconds, and a first match that teaches by doing.
   Acceptance: with a fresh profile, a scripted newcomer reaches a live match in under 15 s from the page opening; the first match shows its hint line and goal, and the review's objective 5 passes.

## Acceptance for the stage

A review passes all five objectives, and Aleix has played one match of each mode online with friends without a complaint.

## Later

- Attachments (ticket 19): after the stage, if weapons need more depth.
- Refactors (ticket 29): when an item above needs them.
