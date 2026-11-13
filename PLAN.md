# Plan

The order of work for duty-shooter. Written by the director chat; the loop's passes read it and build from the top. The vision is `.scratch/next-level/spec.md` and wins over this file: its six objectives (2026-11-13) are what every item serves.

Decided with Aleix on 2026-11-13:
- The countdown idea lands in play; it stays.
- Five objectives, in this order: multiplayer and lobby controls, runs on a toaster, gameplay and world, weapons, easy to understand.
- One graphics preset. Never add Low/Medium/High/Ultra or a quality tier; make the one picture cheaper instead.
- The ten-row scorecard is retired: it graded a scripted player strafing at walls and stopped moving after review (d). Reviews now judge the six objectives.
- Placeholder names stay plain (Smoke, Flash, Fast Hands, Soft Soles, Blast Vest): a newcomer reads them at once.
- Bots ping only in Battle Royale; everywhere else they are annoying (Aleix).
- Scopes and sights are super important (Aleix): they are a named part of the weapons item, not a later attachment detail.
- Progression is the sixth objective (Aleix, 2026-11-13): progress stays in the browser with a save code; 4 guns at the start and one more about every 2 Ranks, all 9 by Rank 12, any gun tried in the Practice Range; customizing is attachments, Mastery camos and optic reticles (no soldier looks yet); a main-menu loadout editor; unlocks shown after the match, not during the fight. Battle Royale uses the same loadouts: no looting, and Supply Drops never hold the sniper.

## Current stage: the six objectives

Work top to bottom, each item rough first (it works end to end) before any item gets a second pass. Tickets live in `.scratch/next-level/issues/`; file one per item when you start it. Tickets filed from review (h) on are worked only if they are something broken a player meets; the rest are closed as superseded by this plan.

0. **Bots ping only in Battle Royale** (Aleix's complaint, 2026-11-13: first). Today a bot that spots an enemy pings it for its side in every mode (`#pingSeen` in `fps-core/src/bots/bot.ts`, sent by `net/server.ts`), which fills the feed with "<bot>: Enemy spotted" and puts markers in the world in Bot Match and Play Online. Keep bot pings, and bots heeding pings, in Battle Royale; turn bot pings off everywhere else. People's own pings stay in every mode.
   Acceptance: a Bot Match and a Play Online TDM with bots run several minutes with no bot ping in the feed or the world, a test holding that, and a local Battle Royale where a bot squadmate still pings an enemy.
1. **Runs well on Aleix's laptop** (objective 2, ticket 35; Aleix, 2026-11-13: "The game doesn't currently run well on my integrated graphics laptop": low fps overall and stutters, everywhere, not one map). Both are in scope: the mean frame time and the hitches (shader compiles, texture uploads, garbage collection, anything that spikes a frame). The one picture at 60 fps on integrated graphics; never by adding a lower preset. The reference toaster is that laptop: Lenovo V15 G5, Intel UHD Graphics (Raptor Lake-P, i7-13620H), Fedora 44 on GNOME Wayland, **Firefox 160** (no Chrome installed). Measure it there first, in Firefox, before changing anything: frame time and GPU time per map and in the main menu, at the screen's own resolution and scale, to find what costs the frame on this GPU and browser; this PC's Chrome numbers don't stand in for it. Aleix allows tests to run on the laptop directly (2026-11-13): over `ssh uni-laptop`, a real Firefox window in his desktop session is fine (the `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000` prefix), and it measures the real GPU path, which headless may not; close it when done. Run the game on it from a production build served from this PC or the laptop, not the dev server. When the laptop is away (`ssh uni-laptop` times out), this PC's throttled runs (`one-picture/potato.mjs`) guide the work and the laptop confirms it.
   Acceptance: on the laptop in Firefox, `?benchmark` on every map (Zero Island and the main menu included): mean 60 fps or better, 1% low 40 or better, no frame over 100 ms after the first 5 s of a match, with the before and after numbers in the ticket.
2. **A review that sees what a player meets.** Rebuild `reviews/capture.mjs` (and the review method in `.claude/iterate.md`) so the scripted player turns toward the nearest enemy and gets kills, a match is run on to its last minute, sound is recorded, every map and mode is visited in turn, two clients share an online lobby, and frame times are logged. The reviewer gives each objective pass or fail with evidence and its biggest gap.
   Acceptance: one capture holds a hit marker and score popup on a kill, a frame and audio from the last minute, a lobby with two clients, and a frame-time summary.
3. **Lobbies you can bring friends into** (objective 1). Today the server runs one public lobby of 12 that everyone with the link joins. Add private lobbies with their own link, a party that stays together between matches, host controls over teams (move a player, balance) and kick, and rejoining your seat after a dropped connection.
   Acceptance: three scripted clients: the host makes a private lobby, two join by its link, the host moves one to the other side and kicks the other, starts the match; a client cut off for 5 s comes back into its seat.
4. **Online plays like local at real ping** (objective 1). Measure under 100 ms and 150 ms of added latency with 2% loss: hits that land on the shooter's screen count, no rubber-banding when moving, the lobby and match flow never stall.
   Acceptance: a scripted two-client run at each condition with the agreement rate of hits and the largest correction logged, and frames that show no snapback.
5. **Gameplay and the world feel good** (objective 3). Every map, not only Survival Town: the gaps the new review finds in movement, spawns, flow, the countdown across the whole match (ticket 36's later parts) and the Ring (ticket 33).
   Acceptance: the review's objective 3 passes on every map.
6. **Every weapon feels good, scopes first** (objective 4).
   - **Scopes and sights** (super important to Aleix; ticket 19's optic part moves here): every gun's iron sights, the Reflex and Prism 2x optics, and the sniper's and the Vantage's scopes. Each is a real model on the gun, lines up when aiming down sights, has a clean sight picture (reticle, lens, eye relief, edge) and zooms and sways as its gun should.
   - **Every gun:** fired in the Practice Range with its own sound, recoil that returns, a hit marker and kill confirm that land, and a role no other gun fills.
   Acceptance: a frame of every gun aimed down sights with each sight it can take, at desktop and phone width, all aligned on the target; a clip per weapon with sound; and the review's objective 4 passes for each.
7. **Progression woven into the game** (objective 6). Builds on the Profile, Rank, Mastery and Challenges already in (tickets 17-20) and on the scope and attachment models from item 6. Rough first, in this order:
   - **Unlocks:** a new Profile starts with a rifle, an SMG, a shotgun and a pistol, each as strong as any locked gun; one more gun unlocks about every 2 Ranks, all 9 by Rank 12 (about 3 to 4 hours). Locked guns show what unlocks them and can be fired in the Practice Range.
   - **Customizing:** all four attachment slots (ticket 19) seen on the gun model; camos earned by Mastery; a reticle colour and shape for each optic.
   - **The loadout editor** on the main menu: the gun in 3D turning slowly with its attachments and camo on it, the gunsmith rows beside it with locked tiles saying what opens them, and 3 named loadouts picked at spawn in every mode. It loads fast, runs well on the toaster and looks cool (`DESIGN.md`, no stock AI look).
   - **After the match:** a results screen with the XP bar filling, Mastery steps, Challenges done and anything unlocked, with "equip it" and "play again". During the fight only the score popups and one small notice when an unlock lands.
   - **A profile screen** (Rank, lifetime numbers, Mastery, unlocks) and a **save code** that exports the Profile and imports it on another PC.
   - **Battle Royale on loadouts:** each player drops with the loadout they chose, everything they have unlocked; ground loot is gone; Supply Drops stay but never hold the Ridgeline .308 (they hold a resupply instead), and the Ridgeline is a loadout gun like the rest.
   Acceptance: a fresh Profile shows 4 guns open; a Profile at Rank 12 shows 9; the editor opens from the menu in under a second on this PC and holds 60 fps on the toaster, with frames at desktop and phone width; a Bot Match ends on a results screen with the bar filling and an unlock to equip; the save code carries a Profile into a fresh browser; a local Battle Royale starts every player with their loadout, shows no loot on the ground, and a Supply Drop opened without a sniper inside.
8. **Easy to understand in a short time** (objective 5). From opening the link to playing in seconds, and a first match that teaches by doing.
   Acceptance: with a fresh profile, a scripted newcomer reaches a live match in under 15 s from the page opening; the first match shows its hint line and goal, and the review's objective 5 passes.

## Acceptance for the stage

A review passes all six objectives, and Aleix has played one match of each mode online with friends without a complaint.

## Later

- Refactors (ticket 29): when an item above needs them.
