# Loop state

## Now

Aleix's requests (2026-11-13), in order; they come before PLAN.md and weakest-point work until all seven work in a real match (ideas beyond them go to BACKLOG.md):
1. Battle Royale lobby like Play Online's (invite link, host moves/kicks, even squads, seat back after a drop), squads friends join; attachments choosable in BR (or, if loot, say so in the lobby).
2. Pistol: why friends all hate it, compared with well-loved shooters (sourced), fixed. REOPENED (Aleix, 2026-11-13, after v2.196.0): "The pistol's gun model, especially the sight, was not very good, it takes a lot of vision from the screen." The Warden 9's model and iron sights (hip and ADS) cover too much of the screen. Next pass takes this first: compare how popular shooters frame a pistol (how much of the screen it takes; a thin front post and rear notch), then fix the model, sights and viewmodel framing, with before/after frames.
3. BR fights in towns: bias Zero Island's final circles, drops and bot routes to built-up areas; measure final circles and kills over many matches before and after.
4. Spectator view: improve it.
5. Multiplayer quality of life: a whole match with friends plays well.
6. Other weapons (not the M4, sniper or SMG): review against real games (TTK, spread, rate, movement, feedback), redesign the pump shotgun, burst SCAR, semi-auto rifle (sight, role) and revolver; prove with TTK and hits-per-kill at range, range runs and frames; list the changes.
7. Smarter bots (not faster or more accurate): cover, routes, situation, ammo, players left, weapon (shotgun pushes close cover, sniper holds long lines, SMG flanks).

Standing direction (Aleix, 2026-11-13), for every request above and after: study how well-loved shooters solve the same problem and copy the patterns that help (feel, tuning, feedback, UX); never recreate one game's own content (names, art, levels).

Pass 23 shipped request 1 (v2.195.0, ticket 106). Pass 24 shipped request 2's handling and damage (v2.196.0, ticket 107: a click up to 0.1 s early is kept; 3 torso hits within 12 m). Pass 25 shipped request 3 (v2.197.0, ticket 108): a map names its towns (Zero Island's Cores); the Ring closes in one in 80 % of matches with every circle holding it, Squads at towns start first, crates land in a town inside their circle, bots take ground in towns (60 %). Over 18 matches (`towns/before.txt`, `after.txt`): last circle in a town 0 → 15 of 18, kills in towns 12 → 50 %, from Stage 4 on 3 → 46 %, Ring deaths 31 → 10. Next pass: request 2 reopened (the pistol's model and sights), then request 4.

Before: PLAN item 4 waits on the laptop (unreachable on Tailscale again at passes 22 and 23).

## Needs Aleix

- Overridable (pass 13): teammates' tags at the screen's edge now show only in Battle Royale; in the team modes a teammate off screen has no tag.
- Overridable (pass 24): the pistol's new numbers (3 torso hits within 12 m, head x1.6) and the revolver's faster trigger (210 rpm) are a balance call; request 6 revisits the revolver.
- Overridable (pass 23): one Battle Royale at a time on the server (ADR 0009), so there is no private Battle Royale code; the invite link joins the one Battle Royale and the inviter's Squad. Private ones would need a second island process per lobby (~415 MB each). No "Even squads" either: bots fill every Squad to its size, and the host's Move does the arranging.
- The Fedora laptop on and on Tailscale (or at home on the LAN) for one benchmark run: item 4's acceptance is measured on it.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; optic models moved to 102, muzzle/grip models left), 102 scopes and sights (pass 1 shipped), 103 easy to understand (pass 1 shipped), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Reviews judge PLAN.md's five objectives (the ten-row scorecard is retired). Latest: 2026-11-13b (1, 2 pass; 3, 4, 5 fail).
- CI: v2.192.0's main run failed once on a soak flake (`switchyard-bots-gungame.soak.test.ts`: a bot stuck 28 s at -15.6,0.1,20.1 in gun game); the same commit's tag run passed. v2.193.0's and v2.193.1's runs passed. v2.193.2 to v2.194.1 passed.

## Broken

None known. Latent (ticket 101): `ProbeLightingModel.indirect` bakes `currentLighting().modelFill` into a shader at compile time; harmless while no map sets `modelFill`.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- Online at real ping: `node .scratch/next-level/ping/look.mjs <out> <rtt> <loss>` plays Play Online through a TCP-like lagging proxy (own server 3010, proxy 3811, dev server 5181); `PING_REPORT=1 npx vitest run packages/fps-core/test/real-ping.test.ts` prints the in-memory numbers.
- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- Zero Island's nav under the dev server: built in a worker (~70 s here) on the first ask and kept until a source changes; the capture asks for it after its match.
- Toaster stand-in: `node .scratch/next-level/toaster/bench.mjs <label> [rate] [maps]` (benchmark page, uncapped, CPU throttle after load); `bench-builds.mjs` lists shader builds and long frames in a flight (`DEV=1` for `?bench`). The capture's range stall was the range's load, not play (ticket 99).
