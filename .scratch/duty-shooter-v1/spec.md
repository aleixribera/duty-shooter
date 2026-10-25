# Duty Shooter v1: MW2019-faithful gunplay and movement core

Status: ready-for-agent

## Problem Statement

I want to build a future browser game whose gunplay and movement feel exactly like Modern Warfare (2019): the same weight, recoil, sway, timing, movement speeds and gunfight dynamics. No reusable foundation for that exists. Off-the-shelf FPS controllers feel floaty and generic. Matching MW2019 means getting hundreds of numbers right (fire rate, ADS time, sprint-to-fire, damage falloff, movement speeds) and nailing the presentation (viewmodel animation, recoil springs, audio) that makes the feel.

I also want to play it with my friends, hosted on my home server. That means the feel has to survive real network latency the way it does in MW2019, not only work offline.

The art can't be copied from MW2019, so the gun, arms, map, effects and audio all have to be generated from code. They still have to look and sound AAA where it matters most: in your hands, on screen, all the time.

## Solution

Duty Shooter is a browser FPS, playable with no downloads, that serves as a test bed and reusable core for MW2019-style gunplay.

- **The gun and movement:** a single stock M4A1 (iron sights, full-auto, no attachments) whose every behaviour comes from a sourced stats file matched to community-measured MW2019 data. MW2019's full movement set: walk, sprint, tactical sprint, crouch, prone, jump, mantle, slide and slide-cancel.
- **The map:** one original graybox map with a firing range (10/25/50 m lanes, static and moving dummies), a movement course, and a small PvP arena.
- **Multiplayer:** free-for-all for up to 8 players, server-authoritative with client prediction, reconciliation and lag compensation.
- **The shared core:** the simulation (movement, weapon, ballistics, damage, game mode) is one deterministic headless core shared by client and server. The presentation layer (viewmodel, animation, effects, audio, HUD, input) is a separate reusable package. The future game imports both.
- **Presentation:** AAA treatment for the gun, arms, effects and audio, all generated in code. The map and player models are a polished graybox.
- **Hosting:** a hardened container on the home server, exposed through the host's existing Tailscale Funnel on port 443 and gated by a simple shared passphrase.

## User Stories

### Movement

1. As a player, I want to walk, sprint and tactical sprint (double-tap sprint) at MW2019's exact speeds for the M4A1, so that crossing the map takes the time I expect.
2. As a player, I want tactical sprint to run for a limited time and then recharge, as in MW2019, so that I have to choose when to use it.
3. As a player, I want ground acceleration, friction and stopping distance to feel like MW2019, so that strafing and peeking feel familiar.
4. As a player, I want strafe and backpedal speeds to be slower than forward speed by MW2019's ratios, so that movement choices matter in gunfights.
5. As a player, I want ADS walk speed to be reduced by the M4A1's ADS move multiplier, so that aiming has a mobility cost.
6. As a player, I want to crouch and stand at MW2019's transition speeds, so that crouch-spamming and crouch peeks behave the same.
7. As a player, I want to go prone, crawl at prone speed, and get back up with MW2019's timings, so that prone is a real but committal option.
8. As a player, I want to jump with MW2019's jump height and air control, so that jumping over obstacles and jump-peeking feel right.
9. As a player, I want shooting while airborne to carry MW2019's accuracy penalty, so that jump-shotting isn't a free advantage.
10. As a player, I want to mantle onto ledges automatically within MW2019's height ranges (low vault, waist-high, high climb), so that I move through the course fluidly.
11. As a player, I want mantle animations to take MW2019's durations, so that mantling is a commitment in a fight.
12. As a player, I want to slide from a sprint with MW2019's slide distance, speed curve and camera tilt, so that slides feel identical.
13. As a player, I want to cancel a slide the way MW2019 allows, with its timing window, so that advanced movement carries over.
14. As a player, I want the camera to step smoothly up stairs and small ledges rather than snapping, so that movement looks polished.
15. As a player, I want to take fall damage from MW2019's minimum height upward, and die from high enough falls, so that height matters.
16. As a player, I want a landing dip in the camera and gun proportional to fall height, so that landings feel weighty.

### Weapon handling

17. As a player, I want the M4A1's fire rate, damage per range band and hit-zone multipliers to match MW2019's stock M4A1, so that time-to-kill is identical.
18. As a player, I want aim-down-sights to take the M4A1's exact ADS time, with the zoom and FOV change MW2019 uses for iron sights, so that aiming feels the same.
19. As a player, I want sprint-to-fire and tactical-sprint-to-fire delays to match MW2019, so that I can't shoot instantly out of a sprint.
20. As a player, I want hipfire spread to match MW2019, including its growth while moving and jumping, so that hipfire works at the same ranges.
21. As a player, I want ADS fire to be accurate except for recoil, as in MW2019, so that recoil control is the skill.
22. As a player, I want the M4A1's recoil to follow its MW2019 pattern (vertical climb, horizontal drift, first-shot kick) in a repeatable, learnable way, so that I can master it.
23. As a player, I want visual recoil (gun kick, camera shake, muzzle rise) separate from the actual recoil, as in MW2019, so that firing looks violent but stays controllable.
24. As a player, I want a tactical reload (rounds left in the mag) and an empty reload (bolt release), with MW2019's different timings, so that reloading early is a meaningful choice.
25. As a player, I want the reload to finish logically at MW2019's add-ammo point, not at the end of the animation, so that reload cancels behave the same.
26. As a player, I want to cancel a reload by sprinting or doing other actions the way MW2019 allows, so that reload management feels familiar.
27. As a player, I want the stock M4A1's magazine size and reserve ammo, so that ammo pressure matches.
28. As a player, I want to inspect my weapon by holding reload, so that I can admire the model.
29. As a player, I want a draw animation on spawn, so that spawning feels polished.
30. As a player, I want the bullets to be projectiles with the M4A1's muzzle velocity and drop, so that hitting moving targets at range feels like MW2019.
31. As a player, I want a quick melee with MW2019's lunge range and damage, so that close-range encounters have that option.
32. As a player, I want my view to flinch when I'm hit, by MW2019's amount, so that whoever shoots first has the edge.

### Viewmodel and presentation

33. As a player, I want a detailed M4A1 with real proportions, made of beveled meshes with anodized aluminium, polymer and edge-wear materials, so that the gun looks AAA even though no assets were downloaded.
34. As a player, I want gloved first-person arms whose hands sit correctly on the grip and handguard in every animation, so that the viewmodel looks believable.
35. As a player, I want the gun to sway and lag behind when I turn the camera, so that it feels like it has weight.
36. As a player, I want walk and sprint bob that scales with speed, plus distinct sprint and tactical-sprint gun poses, so that movement reads in the viewmodel.
37. As a player, I want spring-based recoil kick on the gun each shot, so that firing feels punchy.
38. As a player, I want the viewmodel drawn with its own FOV and never clipping into walls, so that it always looks clean.
39. As a player, I want a muzzle flash that lights the nearby environment, plus smoke from the muzzle after sustained fire, so that firing looks cinematic.
40. As a player, I want ejected shell casings that bounce and settle, so that firing has physical detail.
41. As a player, I want bullet impacts to leave decals and spawn material-appropriate sparks or dust, so that the world reacts to my shots.
42. As a player, I want blood effects when I hit other players, so that hits are clear.
43. As a player, I want killed players to collapse as ragdolls, so that kills feel satisfying.

### Audio

44. As a player, I want a layered gunshot (transient crack, low body, mechanical action, environment-dependent tail), so that the M4A1 sounds powerful.
45. As a player, I want distant gunshots to sound different from nearby ones, so that I can judge where fights are happening.
46. As a player, I want positional footsteps for other players that vary by surface and movement state, so that I can hear enemies coming.
47. As a player, I want distinct reload sounds (mag out, mag in, bolt release), so that reloads feel tactile.
48. As a player, I want distinct sounds for slide, mantle, landing and prone, so that movement feels physical.
49. As a player, I want hit-marker, kill-marker and headshot sounds, so that I get clear confirmation when I land shots.
50. As a developer, I want all audio to go through a sound interface that recorded samples can later replace, so that procedural synthesis isn't a dead end.

### HUD and feedback

51. As a player, I want a hipfire crosshair that hides on ADS, as in MW2019, so that the HUD stays minimal.
52. As a player, I want hit markers, a red kill marker and a headshot variant, so that I know what my shots did.
53. As a player, I want a directional damage indicator when I'm shot, so that I know where to turn.
54. As a player, I want an ammo counter, so that I know when to reload.
55. As a player, I want a kill feed, so that I can follow what's happening in the match.
56. As a player, I want a toggleable ping and fps counter, so that I can diagnose performance.
57. As a player on the range, I want an overlay showing time-to-kill, distance to target and my recoil trace, so that I can compare against MW2019 footage and data.

### Controls and settings

58. As a player, I want MW2019's default key bindings, all rebindable, so that my muscle memory carries over. The defaults are:
    - Shift: sprint. Double-tap Shift: tactical sprint.
    - C: crouch, and slide while sprinting.
    - Ctrl: prone.
    - Space: jump and mantle.
    - R: reload. Hold R: inspect. V: melee.
    - Right-click: ADS.
59. As a player, I want hold or toggle options for ADS and crouch, so that I can match my preference.
60. As a player, I want a sensitivity setting on MW2019's scale, so that my MW2019 value gives the same cm/360.
61. As a player, I want an ADS sensitivity multiplier and MW2019's affected/independent ADS FOV option, so that ADS sensitivity matches MW2019.
62. As a player, I want an FOV slider that defaults to 80, so that the view matches MW2019's default.
63. As a Chromium player, I want raw mouse input with no OS acceleration, so that my aim is consistent.
64. As a Firefox player, I want the game to work fully, with a one-time tip to turn off Windows "Enhance pointer precision", so that my input is consistent even without raw pointer lock.
65. As a player, I want my settings and the passphrase remembered in my browser, so that I don't have to re-enter them every session.

### Graphics and performance

66. As a player on integrated graphics, I want a Low preset that holds 60 fps at 1080p (dynamic render scale, reduced shadows, no ambient occlusion or volumetric effects), so that I can play on a basic laptop.
67. As a player on a gaming laptop, I want a Normal preset that holds 144 fps at 1080p on an RTX 3050/4050-class GPU, so that the game is smooth.
68. As a player with a desktop GPU, I want a High preset with every effect on (cascaded shadows, ambient occlusion, bloom, temporal anti-aliasing, muzzle-flash lighting, volumetric smoke) that still holds 144 fps at 1080p on an RTX 5060, so that it looks stunning without hurting the feel.
69. As a player whose browser falls back to WebGL2, I want the game to run, capped at the Normal preset, so that it never fails to load.
70. As a player, I want mouse look applied every rendered frame, independent of the simulation tick, so that aiming never feels delayed.

### Multiplayer

71. As a player, I want to join from a browser URL by entering a name and the shared passphrase, so that only my friends can get in.
72. As a player, I want my own movement and shots to respond instantly despite latency, so that the game feels local.
73. As a player, I want my hits to register where the target was on my screen when I fired, within the lag-compensation window, so that gunfights feel fair to the shooter.
74. As a player, I want other players to move smoothly, without jitter or teleporting, so that I can track them.
75. As a player, I want gentle, mostly invisible correction when my prediction disagrees with the server, so that I don't rubber-band under normal conditions.
76. As a player, I want other players shown as stylised blocky soldiers whose pose follows their run, crouch, prone, slide and aim pitch, and who hold a third-person M4A1, so that I can read what they're doing.
77. As a player, I want damage applied by MW2019's hit zones (head, neck, upper torso, lower torso, arms, legs) with the M4A1's multipliers, so that headshots and leg shots behave correctly.
78. As a player, I want 100 health that regenerates after MW2019's delay, so that disengaging works.
79. As a player, I want to respawn instantly after death, away from enemies, so that free-for-all keeps flowing.
80. As a player, I want free-for-all with up to 8 players and kill/death counts, so that my friends and I can fight.
81. As a player, I want to practise on the range and movement course while friends are fighting in the arena, all on the same map, so that one session supports both.
82. As a developer, I want game rules behind a game-mode interface (scoring, teams, friendly fire, spawn rules, round flow, win conditions), with a team ID on every player from the start, so that team deathmatch, Gunfight and Domination can be added later without changing the core.

### Range and course

83. As a player, I want range lanes at 10, 25 and 50 m with static dummies that have MW2019 hit zones and reset after being killed, so that I can measure TTK at each range.
84. As a player, I want dummies moving on rails at walking and sprinting speed, so that I can practise tracking and leading projectiles.
85. As a player, I want a movement course with mantle ledges at each height band, slide lanes, stairs, ramps, gaps and a drop high enough to cause fall damage, so that I can test every movement mechanic.
86. As a player, I want the map's surfaces to show a measurement grid and look like a polished studio blockout, so that I can judge distances and the map still looks good.

### Reuse and operations

87. As a developer of the future game, I want to import the headless simulation core and the presentation package without importing this game's map or modes, so that I can reuse the gunplay.
88. As a developer, I want every weapon and movement number in one editable, sourced stats file, so that tuning and auditing against MW2019 data is simple.
89. As a developer, I want every surface to carry a material tag, so that impact effects, footstep sounds and future penetration have what they need.
90. As a developer, I want the network transport behind an interface, so that WebSocket can later be swapped for a UDP-like transport without touching game code.
91. As the host, I want a Docker image built by CI and published to GHCR, the same way as my existing game, so that deploying is a pull-and-restart.
92. As the host, I want the container hardened the same way as my existing game (localhost-only binding, read-only filesystem, all capabilities dropped, a memory limit, log rotation), so that exposing it is safe.
93. As the host, I want the passphrase and player cap set in the stack's environment file, not in the public repo, so that I can change them without rebuilding.
94. As the host, I want the game served on the host's Tailscale Funnel at port 443 without disturbing the existing game on port 8443, so that both stay available.

## Implementation Decisions

### Platform and structure

- **Platform:** a browser game in TypeScript, using Three.js for rendering and Vite for building. Development and testing run on Node 24.
- **Packages:** one monorepo with four:
  - **`fps-core`:** the headless, deterministic simulation. Movement, weapon state, ballistics, hit zones, damage, health, the game-mode interface, and lag-compensation history. It has no rendering, DOM or audio dependencies, and both client and server run it.
  - **`fps-client`:** presentation and input. Rendering setup and graphics presets, the viewmodel (gun and arms built in code, animation, procedural layers), third-person player models, effects, audio synthesis behind a sound interface, HUD, input and settings, client prediction and interpolation.
  - **`range` app:** this game. The map, the free-for-all mode, menus and the passphrase prompt.
  - **`server` app:** Node with `ws`. Runs the authoritative simulation and checks the passphrase.
- **Reuse boundary:** the future game depends on `fps-core` and `fps-client` only.
- **Glossary:** no glossary or ADRs exist yet. The terms in this spec (Simulation, usercmd, tick, pmove, viewmodel, stats file, game mode, headless match, hit zone) are the starting vocabulary for the glossary.

### Simulation

- **Fixed tick:** the simulation runs at 60 Hz on both client and server, deterministically.
- **Inputs:** each tick a client produces a usercmd: buttons, movement axes, view angles, and the sub-tick timestamps of fire presses, so that shots aren't quantised to ticks.
- **Mouse look:** applied every rendered frame for the local camera. The usercmd carries the latest angles.
- **Movement:** Quake/IW-lineage pmove written for this project, with acceleration, friction, air control, step-up, ground snapping and stance transitions. It collides against a world made of boxes; there's no physics engine.
- **Movement states:** walk, sprint, tactical sprint (limited duration and recharge), crouch, prone, jump, mantle (three height bands, timed and committal), slide and slide-cancel, plus landing and fall damage.
- **Weapon state machine:** idle, firing, ADS in and out, sprint-to-fire, reload (tactical vs. empty, with an add-ammo point and cancel rules), inspect, draw and melee.
- **Accuracy:** hipfire spread grows with movement and airborne state. ADS has no spread beyond recoil.
- **Recoil:** a deterministic pattern per shot index, kept separate from visual recoil. Only the pattern affects the simulation; visual recoil lives in `fps-client`.
- **Ballistics:** projectiles with muzzle velocity and gravity drop, simulated on the server. Spawning a projectile rewinds other players' hitboxes to the shooter's view time, within a capped lag-compensation window.
- **Hit zones:** each player's hitboxes cover head, neck, upper torso, lower torso, arms and legs, with the M4A1's multipliers from the stats file.
- **Health:** 100 HP, regenerating after a delay. Flinch is applied to the victim's view on hit.
- **Materials:** every world box carries a material tag (concrete, metal, wood, …). Penetration isn't implemented, but the tag is there for it.

### Stats

- **One stats file holds every number:** weapon and movement values, each with its source (sym.gg or TrueGameData where available) and the date collected.
- **Collection:** a research task fills the file. No value is invented. Any number without a source is marked as estimated, with how it was estimated.

### Netcode

- **Authority:** the server is authoritative. Clients predict their own player by running `fps-core` locally, then reconcile against server snapshots by rewinding and replaying unacknowledged usercmds. Corrections are smoothed visually.
- **Other players:** drawn by interpolating between snapshots at a small delay.
- **Transport:** an interface, implemented with WebSocket for v1, at 60 Hz in both directions. An in-memory implementation with configurable latency, jitter and packet loss is part of the core, for testing.
- **Joining:** the join handshake carries the player name and passphrase. The server compares the passphrase with its environment configuration and rejects a mismatch before accepting any game messages. The server also enforces a player cap (default 8), a maximum message size and a rate limit, as the existing game does.

### Game modes

- **Interface:** a game-mode interface owns scoring, team assignment, friendly-fire rules, spawn selection, round flow and win conditions.
- **v1:** free-for-all only. Instant respawn at the spawn point furthest from enemies, kill/death counts and a kill feed.
- **Teams:** every player has a team ID from day one.

### Rendering and presentation

- **Renderer:** Three.js's WebGPU renderer with TSL post-processing, falling back to WebGL2 automatically. The fallback is capped at the Normal preset.
- **Graphics features:** physically based materials, cascaded shadows, ambient occlusion, bloom, tonemapping, temporal anti-aliasing, muzzle-flash point lighting, volumetric smoke, decals, shell casings and impact particles. The presets switch features on and off and scale them.
- **Viewmodel:** rendered with its own FOV and depth handling, so it never clips into walls.
- **Animation:** authored animations are keyframes in code. Procedural layers on top add sway, turn inertia, bob, spring recoil and the landing dip.
- **Other players:** stylised blocky soldiers that animate procedurally. Ragdolls are cosmetic, client-side and not synced.
- **Audio:** Web Audio synthesis behind a sound interface (play an event at a position with parameters), so recorded samples can replace any voice later.
- **Input:** Pointer Lock with `unadjustedMovement` when the browser supports it. Firefox without it gets a one-time tip about Windows pointer precision.
- **Settings:** stored in browser storage, with every read and write guarded so the game still works if storage is unavailable.

### Map

- **Layout:** one original map. A firing range with 10/25/50 m lanes, static and rail-moving dummies; a movement course; and a small symmetrical Gunfight-sized PvP arena.
- **Geometry and look:** built from tagged boxes, using a grid-textured polished-graybox look. 1 world unit = 1 metre.

### Deploy

- **Repo:** public on GitHub. A container workflow modelled on the existing game's builds and publishes the image to GHCR.
- **Server stack:** a Compose stack on the home server with the same hardening as the existing game. Bound to localhost only, and exposed through the host's Tailscale Funnel on port 443. The existing game on 8443 is untouched.
- **Configuration:** the passphrase and player cap live in the stack's environment file, not in the repo.
- **Updates:** pulled by hand, as for the existing game.

### Build order

Each milestone is playable before the next starts:
1. Movement and the course, offline.
2. Weapon simulation, viewmodel and the range, offline.
3. Audio, effects, HUD and graphics presets.
4. Netcode, other players and hit zones, free-for-all, the arena and the passphrase.
5. Deploy.

The simulation is built in fixed ticks from milestone 1, so netcode slots in without a rewrite.

## Testing Decisions

- **The single automated seam is the headless match.** The real server simulation and one or more client simulations from `fps-core` run in a test process, connected through the in-memory transport with configurable latency, jitter and packet loss. A test does three things:
  - Sets up a world made of tagged boxes, for example a lane with a dummy at 25 m, or a ledge of a given height.
  - Scripts each client's usercmds tick by tick.
  - Checks what the server and clients report: positions, velocities, stance and movement state, weapon state, ammo, health, hits with their zones, kills, scores, flinch, fall damage, and join acceptance or rejection.
- **What makes a good test:** it checks only behaviour that's visible in the match's outputs, never internal state of pmove, the weapon logic or the netcode. Expected values come from the stats file and its tolerances, so the tests are the "judged on the numbers" check.
- **Zero-latency, single-client tests cover the stats:**
  - **Movement:** sprint and tactical-sprint speeds and duration, strafe and backpedal ratios, ADS walk speed, crouch, prone and stance timings, jump height, mantle height bands and durations, slide distance and the slide-cancel window, fall-damage thresholds.
  - **Weapon:** fire rate, damage by range and hit zone, TTK at 10/25/50 m, ADS time, sprint-to-fire, tactical vs. empty reload timing and the add-ammo point, reload-cancel rules, hipfire spread bounds, a recoil pattern that repeats exactly, projectile travel time and drop at range.
  - **Combat:** melee lunge and damage, flinch magnitude, health-regeneration delay.
- **Networked tests (e.g. 80 ms latency, jitter, 5% loss) cover the netcode:**
  - Client prediction matches the server state once reconciled.
  - A shot at a strafing target registers at the point and time the shooter saw, within the lag-compensation window.
  - Hits beyond the window are rejected.
  - Free-for-all scoring, kill feed events and respawns away from enemies.
  - A wrong passphrase is rejected, and the player cap is enforced.
- **Determinism:** the same usercmd script always produces exactly the same match outputs.
- **Tooling and prior art:** Vitest. There's no prior art in this repo yet; the headless match harness is the first test infrastructure and the pattern later tests follow.
- **Outside the automated seam:**
  - **Feel and visuals:** the viewmodel, animation, effects, audio and HUD are checked by the playtester agent in the browser (loads, no console errors, every action works) and by the user's side-by-side comparison with MW2019 footage, using the range overlay's recoil trace.
  - **Graphics performance:** the presets are checked by measuring fps in the browser on the target hardware.

## Out of Scope

- Attachments, loadouts, and any weapon other than the stock M4A1, including secondaries and weapon switching.
- Lethal and tactical equipment (frags, flashbangs, …).
- Bullet penetration. Material tags are included so it can be added later.
- Game modes other than free-for-all. The interface is built, but team deathmatch, Gunfight and Domination aren't implemented.
- Killcams and replays.
- Voice chat.
- Controller support and aim assist.
- Weapon mounting, door-peek leaning, and dolphin dive or omnimovement.
- Realistic themed environments, and realistic character models.
- Downloaded or purchased art and audio assets.
- Accounts, persistent progression, matchmaking, and multiple lobbies.
- Safari support.
- Automatic image updates on the server.
- Using MW2019's name, branding, or any copied assets, layouts or audio.

## Further Notes

- "Exact" means matched to publicly measured MW2019 data within stated tolerances, plus a side-by-side feel check. MW2019's source code isn't available, so the stats file's sourcing and tolerances define what "correct" means.
- Synthesised gunshot audio is the biggest risk to the AAA bar. The sound interface exists so recorded samples can replace it if synthesis falls short.
- Firefox raw-input behaviour with Windows "Enhance pointer precision" turned off still has to be verified in practice. Treat it as an assumption until tested.
- The home server is a 4-core Ryzen 3 PRO 2200G with about 4 GB of RAM free. An 8-player, 60 Hz server with projectile simulation is expected to fit easily. Check it during milestone 4.
- The repo is public. Never commit the passphrase, hostnames from the stack's environment, or any other secret.
