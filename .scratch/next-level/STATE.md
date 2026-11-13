# Loop state

## Now

Aleix's requests (2026-11-13), in order; they come before PLAN.md and weakest-point work until all of them work in a real match; item 8 is unbuilt and goes first (ideas beyond them go to BACKLOG.md):
1. Battle Royale lobby like Play Online's (invite link, host moves/kicks, even squads, seat back after a drop), squads friends join; attachments choosable in BR (or, if loot, say so in the lobby).
2. Pistol: why friends all hate it, compared with well-loved shooters (sourced), fixed. Reopened for its model and sights (ticket 109, shipped v2.197.1).
3. BR fights in towns: bias Zero Island's final circles, drops and bot routes to built-up areas; measure final circles and kills over many matches before and after.
4. Spectator view: improve it.
5. Multiplayer quality of life: a whole match with friends plays well.
6. Other weapons (not the M4, sniper or SMG): review against real games (TTK, spread, rate, movement, feedback), redesign the pump shotgun, burst SCAR, semi-auto rifle (sight, role) and revolver; prove with TTK and hits-per-kill at range, range runs and frames; list the changes.
7. Smarter bots (not faster or more accurate): cover, routes, situation, ammo, players left, weapon (shotgun pushes close cover, sniper holds long lines, SMG flanks).
8. (2026-11-14, next in line, before PLAN work) Random next match the host can pick at match end, Bot Match and private lobbies (ticket 115, his words and the reading there).
9. (2026-11-14) Reset all progression to 0 for every browser once item 7 is built, as its last step (ticket 116).

Standing direction (Aleix, 2026-11-13), for every request above and after: study how well-loved shooters solve the same problem and copy the patterns that help (feel, tuning, feedback, UX); never recreate one game's own content (names, art, levels).

Passes 23 to 30 gave each request its rough pass (v2.195.0 to v2.201.0, tickets 106 to 113; details in each ticket). Cut to BACKLOG on the way: walking bots look 18° up; bots fight from cover only on Zero Island.

Passes 32-33: PLAN item 1 (the laptop), both passes spent (ticket 99). The laptop's GPU is the bottleneck (Survival Town ~55 fps, Zero Island ~43 at the A/B spots); shipped the bloom's cheap bright pass and the TRAA's two-picture history. Levers left are first in BACKLOG for the director. Prefer `flag:` A/Bs over `post:` swaps (ticket 99).

Passes 34-36: PLAN item 1b (the whole UI in Backlit, ticket 114) shipped v2.202.0 to v2.203.1 and proven (design-audit 2026-11-13: both highs and 8 mediums fixed, open mediums in BACKLOG; frame times within noise). Item 1's laptop before/after on the benchmark page is still not run (two passes spent; levers in BACKLOG).

Pass 37: PLAN order step 2, the fresh review on the Backlit build: `reviews/2026-11-13c.md` (1, 4 pass; 2 not judgeable, the PC was loaded; 3, 5, 6 fail). Fixed its Outposts strip over the score bar; the rest in BACKLOG. Next pass: request 8 (ticket 115), then item 7 rough.

## Needs Aleix

- Overridable (pass 29): the burst rifle is a bullpup model, though Aleix calls it a "SCAR"; a SCAR-shaped model would be its own step. The Vantage's fire-mode "F" glows with its reticle (same paint in the model).
- Overridable (pass 29): weapon redesign numbers (ticket 112): shotgun one aimed blast to ~10 m; Trident one burst to 36 m; Vantage three body or head+body anywhere at 380 rpm; Marshal one head shot to 35 m.
- Overridable (pass 13): teammates' tags at the screen's edge now show only in Battle Royale; in the team modes a teammate off screen has no tag.
- Overridable (pass 27): the follow camera sits over the right shoulder (2.4 m back, 0.55 m right); a left-shoulder swap key was left out.
- Overridable (pass 26): the Warden 9 and Marshal .357 are now held further out when aimed (0.46 m); further would shrink the front post below 2 px on a phone.
- Overridable (pass 24): the pistol's new numbers (3 torso hits within 12 m, head x1.6) and the revolver's faster trigger (210 rpm) are a balance call; request 6 revisits the revolver.
- Overridable (pass 23): one Battle Royale at a time on the server (ADR 0009), so there is no private Battle Royale code; the invite link joins the one Battle Royale and the inviter's Squad. Private ones would need a second island process per lobby (~415 MB each). No "Even squads" either: bots fill every Squad to its size, and the host's Move does the arranging.
- The laptop: Chromium for the toaster runs, since most players use Chrome and Firefox's own presenting hides the game's cost there: run `ssh -t uni-laptop "sudo dnf install -y chromium"` once.
- A look (pass 31): open the game in Firefox on the laptop and go to Zero Island's Dustlands; is the sand blue? Firefox's WebGPU frames came out with red and blue swapped in a headless run (BACKLOG).

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; optic models moved to 102, muzzle/grip models left), 102 scopes and sights (pass 1 shipped), 103 easy to understand (pass 1 shipped), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Reviews judge PLAN.md's six objectives (the ten-row scorecard is retired). Latest: 2026-11-13c (1, 4 pass; 2 not judgeable; 3, 5, 6 fail).
- CI: a known soak flake, `switchyard-bots-gungame.soak.test.ts` (a bot stuck 28 s in gun game, v2.192.0); later runs passed.

## Broken

None known. Latent (ticket 101): `ProbeLightingModel.indirect` bakes `currentLighting().modelFill` into a shader at compile time; harmless while no map sets `modelFill`.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The toaster (Fedora laptop, Intel UHD): `toaster/laptop-bench.mjs` runs the benchmark page or a probe there with nothing on its screen; the recipe and probes are in ticket 99 (pass 31). Compare only within one page: its runs drift 40% with the owner on it. `REAL=1` runs it in a real full-screen window; a server inside an `lt run` script starts as `python3 -m http.server -d <dir> &` with a `trap`, or it keeps lt's lock (pass 32).
- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island's nav under the dev server: built in a worker (~70 s here) on the first ask and kept until a source changes; the capture asks for it after its match.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
