# Loop state

## Now

Aleix's requests (2026-11-13), in order; they come before PLAN.md and weakest-point work until all of them work in a real match; all built roughly (ideas beyond them go to BACKLOG.md):
1. Battle Royale lobby like Play Online's (invite link, host moves/kicks, even squads, seat back after a drop), squads friends join; attachments choosable in BR (or, if loot, say so in the lobby).
2. Pistol: why friends all hate it, compared with well-loved shooters (sourced), fixed. Reopened for its model and sights (ticket 109, shipped v2.197.1).
3. BR fights in towns: bias Zero Island's final circles, drops and bot routes to built-up areas; measure final circles and kills over many matches before and after.
4. Spectator view: improve it.
5. Multiplayer quality of life: a whole match with friends plays well.
6. Other weapons (not the M4, sniper or SMG): review against real games (TTK, spread, rate, movement, feedback), redesign the pump shotgun, burst SCAR, semi-auto rifle (sight, role) and revolver; prove with TTK and hits-per-kill at range, range runs and frames; list the changes.
7. Smarter bots (not faster or more accurate): cover, routes, situation, ammo, players left, weapon (shotgun pushes close cover, sniper holds long lines, SMG flanks).
8. (2026-11-14) Random next match the host can pick at match end, Bot Match and private lobbies: built, v2.204.0 (ticket 115).
9. (2026-11-14) Reset all progression to 0 for every browser once item 7 is built, as its last step (ticket 116).

Standing direction (Aleix, 2026-11-13), for every request above and after: study how well-loved shooters solve the same problem and copy the patterns that help (feel, tuning, feedback, UX); never recreate one game's own content (names, art, levels).

Passes 23-38: requests 1-8 built roughly (tickets 106-115, v2.195.0 to v2.204.0); PLAN item 1 (the laptop) has its two passes spent (ticket 99, levers in BACKLOG); item 1b (Backlit UI) shipped and audited.

PLAN item 7 (ticket 117): built roughly in passes 39-44 (v2.205.0 to v2.210.0); Battle Royale on loadouts stays behind `?drops=resupply` until Aleix says go. Review 2026-11-14a (pass 45): 1, 2 pass; 3, 4, 5 fail.

Passes 45-53 (PLAN order step 5, review 2026-11-14a's visible gaps, one per pass; tickets 100, 102, 103; v2.211.0 to v2.211.9); each in its ticket.

Pass 54: review 2026-11-14b (`reviews/2026-11-14b.md`; the capture gained a `progress` part: Loadout timed to the gun, Profile with guns open and save code). 1, 2, 5 pass; 3, 4, 6 fail. Its five, in order (BACKLOG "Review 2026-11-14b's open defects"): fights in the first seconds; kills hidden by your own muzzle flash or dust; camera buried in allies or geometry; Loadout 6.8 s to the gun with a sliver of a preview; the Range panel's stale numbers.

Passes 55-58 (tickets 100, 102, 117; v2.211.11-14): defects 1 (no free-for-all opens with an enemy in view; bots still meet in 2-3 s), 2 (your own flash and smoke part round the aim point), 3 (the camera no longer sits inside a teammate) and 4 (Loadout shows each gun's still in under 50 ms until its model is drawn, 6-9 s on a fresh page; the gun sways about side on; above the tiles on a phone). Next (pass 59): defect 5, the Range panel's stale numbers.

## Needs Aleix

- Overridable (pass 58): the Loadout gun sways about side on and turns when dragged, instead of turning full circle (end on, it read as a sliver).
- Overridable (pass 45): aiming through the Prism 2x or the Vantage now shows the world and the reticle only, so your own muzzle flash no longer shows inside the sight (it never covers the target); say if you want a flash there.
- Battle Royale on loadouts (PLAN item 7, pass 43): once you have played loadouts in Bot Match, say go and Battle Royale drops everyone with their loadout, the Ridgeline is a pick, Supply Drops resupply instead of holding the sniper, and nothing lies on the ground. Try it first: Local bots with `?drops=resupply`.
- Overridable (pass 42): camos Sand 1, Forest 2, Urban 3, Night 4, Gold 5 (Mastery level; Urban and Night pixelated); reticles red, green, amber, cyan or white as a dot, ring or chevron, set per optic, not per gun.
- Overridable (pass 29): the burst rifle is a bullpup model, though Aleix calls it a "SCAR"; a SCAR-shaped model would be its own step. The Vantage's fire-mode "F" glows with its reticle (same paint in the model).
- Overridable (pass 29): weapon redesign numbers (ticket 112): shotgun one aimed blast to ~10 m; Trident one burst to 36 m; Vantage three body or head+body anywhere at 380 rpm; Marshal one head shot to 35 m.
- Overridable (pass 26): the Warden 9 and Marshal .357 are now held further out when aimed (0.46 m); further would shrink the front post below 2 px on a phone.
- Overridable (pass 24): the pistol's new numbers (3 torso hits within 12 m, head x1.6) and the revolver's faster trigger (210 rpm) are a balance call; request 6 revisits the revolver.
- Overridable (pass 23): one Battle Royale at a time on the server (ADR 0009), so there is no private Battle Royale code; the invite link joins the one Battle Royale and the inviter's Squad. Private ones would need a second island process per lobby (~415 MB each). No "Even squads" either: bots fill every Squad to its size, and the host's Move does the arranging.
- The laptop: Chromium for the toaster runs, since most players use Chrome and Firefox's own presenting hides the game's cost there: run `ssh -t uni-laptop "sudo dnf install -y chromium"` once.
- A look (pass 31): open the game in Firefox on the laptop and go to Zero Island's Dustlands; is the sand blue? Firefox's WebGPU frames came out with red and blue swapped in a headless run (BACKLOG).

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84 all resolved.
- Long-running, open: 19 attachments, 102 scopes and sights, 103 easy to understand, 29 refactors, 33 the Ring's tuning (waits on 35), 35 fast on weak PCs, 36 the whole match is the countdown.
- Reviews judge PLAN.md's six objectives (the ten-row scorecard is retired). Latest: 2026-11-14b (1, 2, 5 pass; 3, 4, 6 fail).
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
- Model rebuilds: run Blender in its own process (`tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>`, runner calls `bkit.reset(); bkit.run(script, export=True)`); the shared one on 9876 gets reset by others.

- Zero Island's nav under the dev server: built (~70 s) on the first ask, kept until a source changes. A Local bots match with frames: `royale-loadouts/look.mjs` (~6 min).
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
