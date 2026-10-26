# Survival Town: a faithful Nuketown remake, team deathmatch, and a redesigned UI

Status: ready-for-agent

## Problem Statement

Duty Shooter's gunplay and movement are done, but there's nowhere worth playing them. The public lobby runs a small graybox arena bolted onto the practice range. It looks like a test level, it plays like a test level, and nobody remembers it after one match.

I want a map people recognise and love on sight: the original Nuketown from Black Ops (2010). It should be as accurate as public information allows, it should play well first and foremost, and it should look stunning while running fast on modest hardware. It should have no bugs or visual glitches at all: no z-fighting, seams or light leaks, no stuck spots, no way out of the map, and no invisible walls eating bullets.

Nuketown is a team deathmatch map at heart, and the game only has free-for-all. The menu and HUD were also built for a graybox test bed. They need to look as good as the new map, and they need to explain modes, teams and voting.

I can't copy anything from Black Ops, and I don't own it. Everything has to come from public references, and all art and audio still has to be generated in code.

## Solution

**Survival Town**, a recreation of the original 2010 Nuketown named after the real 1955 Nevada test town, becomes the public lobby's map. The game gains team deathmatch, and the whole UI is redesigned.

- **The map:**
  - **Layout:** both houses, the cul-de-sac, the bus and trucks, the yards and fences, rebuilt from public references (overhead layout maps, wiki measurements, gameplay video frames). Accuracy is within ±15 cm on structural features and ±30 cm on everything else. Where accuracy and playability conflict, playability wins.
  - **Movement:** the current set is unchanged (mantle, slide, tactical sprint). Players can climb anywhere the movement lets them, including the roofs.
  - **The boundary:** an invisible wall around the original's playable area, reaching into the sky.
- **The look:** stylised realism. A bold 1950s pastel palette, materials generated in code, and a fixed warm afternoon sun with baked lighting.
  - The scenery outside the boundary (desert, test-site towers, mountains, sky) is visible from everywhere.
  - Original mannequins whose heads pop off when shot.
  - An end-of-match nuke.
- **Combat:** bullets penetrate thin materials (wood, plaster, fences, glass, sheet metal) with reduced damage. Brick, concrete, ground and engine blocks stop them. Invisible blockers never stop a bullet.
- **Modes:** team deathmatch (75 kills or 10 minutes) and free-for-all (30 kills or 10 minutes). The first player into an empty server picks the mode, and everyone votes for the next mode during each intermission. The intermission is 20 s: about 6 s of nuke, then about 14 s of scoreboard and vote.
- **Soldiers:** reworked in the new style, on the same skeleton and the same hitboxes. Blue and orange team uniforms, with nameplates over teammates only.
- **The UI:** a modern tactical identity of the game's own, across every screen:
  - the main menu, with a live fly-through of Survival Town behind it
  - loading and connecting screens
  - pause and settings
  - the HUD
  - the scoreboard
  - the end-of-match screen and vote
- **The main menu offers:**
  - Play Online, showing server status, player count and current mode
  - Practice Range (offline)
  - Explore Survival Town (offline)
  - Settings
  - a player name field
  - the version number
- **The range:** the old arena is removed. The range keeps its layout and measuring grid, and gets the new lighting, sky and post-processing.
- **Sound:** all generated in code.
  - ambient sound: desert wind, birds, a creaking sign, a radio in one house
  - footsteps for every new surface
  - indoor reverb inside the houses
  - an air-raid siren and blast for the nuke
- **Rollout:** work lands on main behind flags, so the public lobby doesn't change until everything passes. A release then makes Survival Town the default.

## User Stories

### Recognising the map

1. As a player who knows Nuketown, I want Survival Town's layout to match the original's, so that my muscle memory, routes and favourite spots carry over.
2. As a player, I want doors, windows, cover heights and wall positions within 15 cm of the original, so that the gunfights I know (the window peeks, the bus, the truck, the garage) play the same way.
3. As a player, I want the cul-de-sac, yards, fences and house interiors in the original's proportions, so that rotation times and sightlines feel right.
4. As a player, I want the original's iconic props reproduced in spirit (the bus, the trucks, the boat, the picket fences, the mannequins, the population sign) with original designs, so that the map is unmistakable without copying anything.
5. As a player, I want a population sign that counts the players in the lobby and the kills this match, so that the original's best detail survives in an original form.
6. As the owner, I want the map called "Survival Town" everywhere, with no Nuketown, Treyarch or Activision names, logos or signage, so that the public repo and lobby carry no takedown risk.

### Moving around the map

7. As a player, I want to walk, sprint, tactical sprint, slide, crouch, go prone, jump and mantle exactly as I do now, so that the new map doesn't change the game's feel.
8. As a player, I want to climb onto anything the movement lets me reach, including the roofs, so that I can find creative positions.
9. As a player walking on a sloped roof, I want it to feel like a smooth slope rather than a staircase, so that roof play feels natural.
10. As a player, I want to never get stuck on geometry, snag on an invisible edge, or fall through the world, so that movement is always predictable.
11. As a player, I want collision to match what I see within a few centimetres, so that I'm never blocked by air or walk into a visible object.
12. As a player, I want an invisible wall at the edge of the playable area that can't be climbed, jumped, slid or mantled past, so that nobody can leave the map.
13. As a player, I want angled objects (the bus, the trucks, diagonal fences) to collide along their real angle, so that I can hug them as closely as they look.
14. As a player, I want doors and windows sized so that I can move and mantle through them the way the original allowed, so that the classic flanks work.

### Shooting on the map

15. As a player, I want invisible blockers (the boundary wall, the hidden roof steps) to never stop my bullets, so that every shot lands where it visibly should.
16. As a player shooting at a sloped roof, I want my bullets to hit the visible slope, not a hidden staircase, so that impacts look right.
17. As a player, I want bullets that leave the playable area to hit the scenery with normal impact effects, so that the world feels solid.
18. As a player, I want to shoot through wooden walls, plaster, fences, glass and sheet metal with reduced damage, so that wallbangs work as they did on Nuketown.
19. As a player, I want brick, concrete, the ground and vehicle engine blocks to stop bullets, so that real cover protects me.
20. As a player, I want visible impacts on both sides of a penetrated surface, so that I can tell when I'm being shot through cover.
21. As a player, I want penetration to be decided by the server with the same lag compensation as normal hits, so that wallbangs are fair online.
22. As a player, I want to shoot the mannequins' heads off, so that the original's easter egg survives.
23. As a player, I want mannequin heads to never block a bullet, popped or not, so that a prop never steals a kill.
24. As a late joiner, I want to see the mannequin heads already popped this match, so that everyone sees the same world.

### Team deathmatch

25. As a player, I want to play team deathmatch on Survival Town, so that I can play Nuketown the way it's best known.
26. As a player, I want to join the smaller team automatically, so that teams stay fair without menus.
27. As a player, I want teams rebalanced at the start of each match, keeping as many people on their old team as possible, so that matches start fair without needless shuffling.
28. As a player, I want friendly fire off, with no damage, hit markers or flinch from teammates, so that crossfire doesn't punish my team.
29. As a player, I want my team to start at our own house and later spawns to be near teammates and away from enemy sightlines, so that I don't spawn into a gunfight.
30. As a player, I want a team deathmatch to end at 75 team kills or 10 minutes, so that matches last as long as the original's.
31. As a player, I want a match that times out level to end in a draw, so that the result is honest.
32. As a player, I want teammates to wear one uniform colour and enemies the other (blue and orange), so that I can tell friend from foe at a glance, even with colour blindness.
33. As a player, I want a nameplate over teammates and none over enemies, so that I can find my team without enemies being highlighted.
34. As a player, I want the HUD to show both team scores, the time left and my team, so that I always know the state of the match.

### Free-for-all

35. As a player, I want free-for-all on Survival Town to end at 30 kills or 10 minutes, so that matches match the original's length.
36. As a player, I want a free-for-all that times out to be won by the player with the most kills, or drawn on a tie, so that the timer settles it.
37. As a player, I want free-for-all spawns on Survival Town away from living enemies, so that spawns stay safe in the smaller map.
38. As a player, I want the HUD to show the leader's score, my score and the time left in free-for-all, so that I know how close the match is.

### Choosing the mode

39. As the first player into an empty server, I want to pick team deathmatch or free-for-all from the Play Online menu, so that I start the mode I want.
40. As a player joining a server that already has players, I want to see its current mode and player count before I enter, so that I know what I'm joining.
41. As a player, I want to vote for the next match's mode during every intermission, so that the lobby plays what most people want.
42. As a player, I want to change my vote until the vote closes, so that I can follow the room.
43. As a player, I want a tied or empty vote to keep the current mode, so that the result is predictable.
44. As a player, I want the vote's countdown and live tally on screen, so that I know when it closes and how it's going.
45. As a player, I want the mode never to change in the middle of a match, so that nobody gets moved mid-fight.

### The end of a match

46. As a player, I want the match to end with a nuke detonating over Survival Town (siren, flash, shockwave, mushroom cloud), seen from where I'm standing, so that every match ends with the original's signature moment.
47. As a player, I want my input frozen from the end of the match until the next one starts, so that nothing scores or dies after the result.
48. As a player, I want the scoreboard and the vote after the nuke, so that I see the result before choosing the next mode.
49. As a player, I want the next match to start 20 s after the last one ended, on fresh spawns, with the map restored, so that the loop is quick and clean.
50. As a player, I want the nuke to change only what's drawn, never collision, so that it can't cause bugs in the next match.

### Visuals

51. As a player, I want Survival Town to look stunning, in stylised realism with 1950s pastel houses, a warm afternoon sun, believable materials and soft bounce light, so that the map is a pleasure to play on.
52. As a player, I want every surface to have convincing material detail (wood siding, shingles, brick, asphalt, grass, sand, painted metal, glass), all generated in code, so that nothing looks flat or blocky up close.
53. As a player, I want no z-fighting, no visible seams, no light leaking through corners, no floating or buried props, and no stretched materials, so that nothing breaks the illusion.
54. As a player, I want soldiers lit consistently with the world (darker under roofs and in shade), so that players don't glow indoors.
55. As a player, I want the desert, test-site towers, mountains and sky around the town, so that the world doesn't end at a fence.
56. As a player, I want soldiers reworked to match the new style, so that they don't look out of place in a detailed world.
57. As a player, I want the reworked soldiers to keep exactly the same hitboxes, so that the change is cosmetic only.
58. As a player, I want small effects that cost almost nothing (dust motes in the light, heat shimmer in the distance), so that the scene feels alive without hurting the frame rate.

### Performance

59. As a player on integrated graphics, I want 60 fps at 1080p on Low, so that the map is playable on a laptop.
60. As a player on a mid-range GPU, I want 144 fps on Normal, so that the map stays competitive.
61. As a player on an RTX 5060, I want 144 fps at 1080p on High with no frame-time spikes, so that the best preset is smooth.
62. As a player, I want the map to load in under 2 s, so that joining is quick.
63. As the owner, I want the server to keep about the same CPU cost for 8 players on Survival Town as on the old arena, so that the home server stays comfortable.

### Sound

64. As a player, I want footsteps that match the surface I'm on (wood floor, grass, asphalt, gravel, sheet metal, concrete), so that I can hear where enemies are.
65. As a player, I want indoor reverb inside the houses and the garage, so that sound tells me where gunfights are.
66. As a player, I want ambient desert wind, distant birds, a creaking sign and a faint radio from one house, so that the town feels inhabited.
67. As a player, I want an air-raid siren and a blast for the nuke, so that the ending lands.
68. As a player, I want ambient sounds quiet enough never to mask footsteps or gunfire, so that atmosphere doesn't hurt play.

### Menu and UI

69. As a player, I want a main menu with a live fly-through of Survival Town behind it, so that the game makes a great first impression.
70. As a player, I want Play Online, Practice Range, Explore Survival Town, Settings, a name field and the version on the main menu, so that everything I need is one click away.
71. As a player, I want Play Online to show whether the server is up, how many players are on, and the current mode, so that I know before I join.
72. As a player, I want my name remembered between visits, so that I don't retype it.
73. As a player, I want clear loading and connecting screens with progress and readable errors (server down, full, version mismatch), so that I always know what's happening.
74. As a player, I want pause and settings screens in the new style, with every existing setting kept, so that nothing I rely on disappears.
75. As a player, I want the HUD (health, ammo, crosshair, kill feed, hit markers, scores, timer) restyled to match without changing how it behaves, so that it looks new and plays the same.
76. As a player, I want a scoreboard on a held key that shows teams or the free-for-all ranking with kills, deaths and ping, so that I can check the match at any time.
77. As a player, I want an end-of-match screen with the winner, my stats and the vote, so that the intermission is informative.
78. As a player, I want the UI to look like Duty Shooter's own identity rather than a copy of CoD's menus, so that it's original.
79. As a player, I want the UI to work with mouse, keyboard and gamepad, so that every input I use today keeps working.

### Offline and the range

80. As a player, I want Practice Range offline from the main menu, with its lanes, dummies and movement course, so that I can still warm up and test.
81. As a player, I want the range to keep its grid and layout but use the new lighting, sky and post-processing, so that it doesn't look broken next to the new menu.
82. As a player, I want Explore Survival Town offline, so that I can learn the map alone.
83. As a visitor to the Pages copy, I want both offline options, so that I can try the game without the server.
84. As the owner, I want the old arena removed, so that there's one online map to maintain.

### Rollout and verification

85. As the owner, I want work to land on main behind flags, with the public lobby unchanged until release, so that players never see a half-built map.
86. As the owner, I want a release that makes Survival Town and the new UI the default only after the full checklist passes, so that "no bugs" is checked before it goes live.
87. As the owner, I want a browser benchmark that flies a fixed camera path for each preset and reports frame times, draw calls, triangles and load time, so that performance is measured the same way every time.
88. As the owner, I want fixed reference camera spots that give repeatable screenshots, so that visual regressions and accuracy can be compared side by side.
89. As the owner, I want a reference file of public measurements, each with its source, that the map is tested against, so that "accurate" is a number, not an opinion.
90. As a developer, I want the shared core to stay free of any map, so that the future game can reuse it with its own maps.
91. As a developer, I want maps defined as data supplied by the app, so that more maps can follow Survival Town.

## Implementation Decisions

### The world model (shared core)

- **Solids replace boxes.** The world is a list of **solids**, each with:
  - a shape: an axis-aligned box, or a box rotated around the vertical axis (yaw only)
  - a **material**
  - what it blocks: **players**, **bullets** or both

  Existing maps keep working, because a plain box is an axis-aligned solid that blocks both.
- **Player clip** is a solid that blocks players only: the boundary wall, the hidden roof steps, and any smoothing blockers. **Bullet surfaces** are solids that block bullets only: sloped roof faces and the near scenery.
- **Bullet surfaces may be fully oriented** (any rotation), because a ray against an oriented box is cheap and exact. Solids that block players stay limited to yaw rotation, which keeps the movement sweep simple and safe.
- **A uniform spatial grid** (cells of about 4 m) is built once from the solids. Movement sweeps and bullet raycasts query only the cells they cross. Results are identical to the old linear scan, only faster, and determinism holds.
- **Materials:** `brick`, `asphalt`, `gravel`, `sand`, `sheetMetal` and `plastic` join the existing set. `metal` stays the solid, bullet-stopping kind, used for engine blocks and steel. The material drives impacts, footsteps and penetration.
- **Sloped roofs** are walkable through player clip steps 5 cm high under the visible slope. On the client, the camera smooths the eye-height change on each step-up, so walking a slope reads as a slope.

### Bullet penetration (shared core)

- A per-material penetration table lives in the stats file, with a note on where each value comes from. Each row has a thickness cost and a damage multiplier, and the materials that stop bullets outright are marked.
- A bullet's raycast continues through penetrable solids until its penetration budget runs out. Each solid it passes reduces damage by that material's multiplier. Values are tuned for playability against how Nuketown wallbangs behaved.
- Entry and exit impacts are both reported as events, so the client can draw both.
- Penetration runs inside the server's existing lag-compensated hit check, so prediction, reconciliation and rewinding are unchanged.
- **Mannequins:** mannequin heads are bullet-passable **props** with an id. A hit produces a prop event and never reduces the bullet's damage. The server keeps the set of popped props in the match state, sends it to joining clients, and clears it at match start.

### Modes, intermission and voting (shared core)

- **Team deathmatch** implements the existing game-mode interface alongside free-for-all.
  - Two teams. Joiners go to the smaller team; on a tie, to the team with the lower score.
  - Teams rebalance at match start with the fewest moves possible.
  - Friendly fire is off: team hits do nothing and produce no hit or flinch events.
  - Spawn choice: each team spawns at its own house for the first spawn of a match. After that, it scores team spawns by nearness to teammates and distance from enemy sightlines.
- **Win conditions are mode options:** a kill limit and a time limit. TDM is 75 kills or 600 s. FFA is 30 kills or 600 s. A time-out picks the leader, or declares a draw on a tie. `matchEnd` gains a draw outcome.
- **The intermission is one server-timed sequence:**

  | Time from match end | Phase |
  |---|---|
  | 0–6 s | Nuke |
  | 6–20 s | Scoreboard and vote |
  | 20 s | `matchStart` |

  Input is frozen for the whole intermission: usercmds are ignored and nothing scores or dies.
- **Mode voting:** each connected player has one vote, changeable until the window closes. The plurality wins; a tie or no votes keeps the current mode. The server broadcasts the tally.
- **Mode for an empty server:** the first player's join request may carry a preferred mode. It's honoured only when no other players are connected. Otherwise the joiner gets the current mode.
- **The protocol version is bumped.** New messages carry the current mode, team assignments, intermission phase and deadlines, vote tally, popped props, and match timer.

### Maps (the app)

- **Maps are data the app supplies to the core**, which imports nothing from them. A map definition provides:
  - its id and display name
  - its solids
  - spawn sets for FFA and for each TDM team
  - indoor zones, for reverb
  - visual-only decoration
  - props
  - reference camera spots
  - the benchmark camera path
  - the menu fly-through path
  - its scenery
- **There are two maps:** **Survival Town** and the **Practice Range**. The old arena section and its spawns are removed from the range. The range keeps its lanes, dummies and movement course.
- **Every visual element of Survival Town is tied to its collision.** Each one is either generated from a solid, or declares the solid it decorates. A decoration is allowed to protrude at most 5 cm beyond that solid's surface. Non-colliding decoration (grass blades, distant scenery) is marked as such and kept out of reach of player movement.
- **The reference file** is data in the app. It lists public measurements, each with its source and tolerance class (structural ±15 cm, other ±30 cm). The map module exposes the matching measurements from its own geometry, so the two can be compared.
- **The boundary** is player clip that reaches into the sky, traced along the original's playable edge.

### Server and lobby (the app)

- The server takes its map from configuration, so Survival Town can be enabled before release. It runs the chosen mode and handles voting through the mode layer.
- **A lobby status endpoint** reports map, mode, players, capacity and phase. It's alongside the existing health endpoint, and the Play Online menu uses it.
- The server CPU cost for 8 players on Survival Town must stay within the measured 5–9 % of one core, with a small margin. The spatial grid is what keeps the larger number of solids from raising it.

### Rendering (presentation package)

- **Stylised-realism materials** are built as code-generated node materials, one family per material (siding, shingles, brick, asphalt, grass, sand, concrete, painted metal, sheet metal, wood fence, glass, plastic). Detail comes from patterns computed in world space, so no texture files are needed.
- **Static lighting is baked at build time on the CPU.** The bake covers the sun's shadows, ambient occlusion and one bounce. It's stored as generated data in the build, which is code output, not a download.
- **Dynamic objects** (soldiers, mannequin heads, effects) are lit from a baked light-probe grid and cast realtime shadows. The presets scale shadow resolution, GTAO, bloom and anti-aliasing as they do today.
- **Draw calls are kept low** by merging static geometry per material, and using instancing for repeated props (fence pickets, shingles, foliage). Distant scenery uses simplified meshes.
- **The nuke** is a presentation-only effect driven by the intermission's timeline: siren, flash, shockwave, mushroom cloud and colour grading. It never touches collision, and the world is restored visually at match start.
- **The reworked soldier** keeps the existing skeleton, procedural posing and hitbox parts. Only the meshes and materials change, with blue and orange team uniforms.
- **Nameplates** are drawn over teammates only.

### Audio (presentation package)

- Footstep banks are added for the new materials, and ambient sources are placed by the map.
- The indoor/outdoor reverb switch is driven by the map's indoor zones.
- The nuke siren and blast are synthesised like the existing sounds.
- Ambient loudness is capped below footstep and gunfire levels.

### UI (presentation package and app)

- A new visual identity is applied to every screen:
  - the main menu, with the fly-through
  - loading and connecting
  - pause and settings
  - the HUD, plus team score, timer and mode
  - the held scoreboard
  - the end-of-match screen and vote
- How the HUD behaves is unchanged, apart from the additions it needs for modes and the timer.
- The main menu entries are Play Online, Practice Range, Explore Survival Town and Settings, plus a name field (stored locally) and the version.
- In the Pages copy, the menu hides Play Online and offers the two offline entries.
- Mouse, keyboard and gamepad all drive the menus.
- UI mockups are published for approval as the first checkpoint, before the UI is built.

### Rollout

- Everything lands on main behind flags: a server setting picks the map and modes, and a client flag shows the new UI and menu. The public lobby stays as it is until release.
- **Build order:**
  1. Solids, the grid and player clip.
  2. Penetration and props.
  3. Team deathmatch, timers, intermission and voting.
  4. Survival Town layout as plain geometry, with the reference file, spawns and the boundary.
  5. Benchmark and reference camera spots.
  6. UI mockups (checkpoint 1).
  7. A look test of one finished house (checkpoint 2).
  8. Full art, baked lighting and scenery.
  9. The soldier rework.
  10. The nuke.
  11. Audio.
  12. The UI build.
  13. The performance pass.
  14. The release.
- **The release** makes Survival Town the default lobby map with TDM as the starting mode, turns the new UI on, removes the arena, and is tagged as a new version.

## Testing Decisions

- **What makes a good test:** it checks behaviour visible in a match's outputs or in a map's data, never the internals of the sweep, the grid or the netcode. Expected values come from the stats file, the mode options, and the reference file's tolerances.
- **Seam 1, the existing headless and networked match, extended to take solids.** The current test files are the prior art; they already script usercmds tick by tick and check the outputs.
  - **Collision:**
    - walking into and sliding along yaw-rotated solids
    - stepping and mantling onto them
    - player clip blocks the hull, but no ray
    - bullet surfaces stop rays but not the hull
    - grid results identical to the linear scan on randomised worlds
    - determinism unchanged
  - **Penetration:**
    - damage after one and two penetrable layers matches the table
    - stopping materials stop
    - entry and exit impact events
    - a lag-compensated wallbang on a strafing target, under the networked conditions (80 ms latency, jitter, 5 % loss)
  - **Props:**
    - a mannequin head hit produces a prop event and doesn't reduce damage
    - a late joiner receives the popped set
    - the set resets at match start
  - **Team deathmatch:**
    - joiners balance
    - teams rebalance at match start with the fewest moves
    - friendly fire does nothing
    - kill limit and time limit, with draws
    - first-life spawns at the team's house, later spawns away from enemies
  - **Free-for-all:** the new limits and time-out results.
  - **Intermission:**
    - phase timing of 6 s and 20 s
    - input frozen
    - nothing scores
    - the next match starts on fresh spawns
  - **Voting:**
    - plurality wins
    - a tie or no votes keeps the mode
    - votes can be changed until the window closes
    - the first joiner's mode is honoured only on an empty server
    - the mode never changes mid-match
  - **Protocol:** an old-version client is rejected.
- **Seam 2, the real Survival Town run through the same harness**, with the existing range map tests as prior art:
  - **Spawns:** every spawn (FFA and both TDM sets) stands clear of geometry and on the ground.
  - **Reachability:** scripted walk, jump, slide and mantle routes reach every intended area, roofs included.
  - **Containment:** the boundary can't be crossed. Sweeps of runs, jumps, slides and mantles from every roof edge and fence along the boundary end inside the playable area.
  - **Bullets:** a ray fired along and through every player clip solid is never stopped by one, and rays fired from inside the boundary reach the scenery.
  - **Accuracy:** every reference measurement is within its tolerance class.
  - **Collision matches visuals:** every decoration sits within 5 cm of the solid it declares, and non-colliding decoration is out of movement reach.
  - **Materials:** every walkable surface has a footstep material, and every solid has a valid penetration row.
- **Seam 3, the new browser benchmark flag.**
  - **What it runs:** it loads a map, flies the fixed benchmark path once per preset, and reports frame-time percentiles, GPU time where the browser exposes it, draw calls, triangles and load time. A companion flag places the camera at each reference spot for screenshots.
  - **Budgets on the owner's RTX 5060 at 1080p:**
    - High: 144 fps with no spikes.
    - Normal: GPU frame time ≤ 4.5 ms.
    - Low: GPU frame time ≤ 3 ms.
    - All presets: under 250 draw calls and under 1.5 M triangles.
    - Load: under 2 s.
- **Outside the automated seams:**
  - The **playtester agent** clicks through every screen and both offline modes. It checks the console for errors and takes screenshots at the reference spots.
  - The **owner** approves the two checkpoints.
  - **Accuracy** is also checked side by side against frames from public gameplay video at the reference spots.
  - **Server CPU** is measured with 8 clients against the live container.
- **Tooling:** Vitest for seams 1 and 2, as today. Seam 3 runs in the browser and is driven by the playtester agent.

## Out of Scope

- The Nuketown name, and Treyarch's or Activision's names, logos, signage or posters. Also anything taken from the game's files.
- Nuketown 2025, Nuketown '84 or any other version, and any map other than Survival Town and the Practice Range.
- Map rotation and map voting. The online lobby runs Survival Town only.
- Modes other than TDM and FFA, mid-match votes, and more than one lobby.
- Bots, killcams and replays.
- Breakable windows, destructible geometry, or any other collision change during a match. The nuke changes only what's drawn.
- Dynamic time of day and weather.
- True sloped-surface collision, and triangle-mesh collision.
- Character customisation, and any soldier change that alters hitboxes.
- Downloaded or purchased models, textures or audio.
- Low and Normal measured on their real target hardware (integrated graphics, RTX 3050/4050). The budgets on the RTX 5060 stand in for them. A laptop test is optional.
- Mobile and touch controls.

## Further Notes

- **"Millimetre" accuracy isn't reachable without the game's own data**, which won't be used. The reference file's sourced measurements and tolerances define what "accurate" means here. The owner doesn't own Black Ops, so there are no in-game captures.
- **This spec replaces parts of the v1 spec's out-of-scope list:** themed environments, team deathmatch and penetration are now in scope. The v1 spec's out-of-scope list is updated to match.
- **Decision records:**
  - `docs/adr/0001`: separating movement collision from bullet collision (player clip and bullet surfaces)
  - `docs/adr/0002`: solids rotated around the vertical axis, plus the spatial grid
  - `docs/adr/0003`: penetration by material
- **The terms used here are defined in `GLOSSARY.md`.**
- **Baking lighting at build time** adds a build step that runs in both the container build and the Pages build. Its output is generated, never committed or downloaded.
- **The repo is public.** No secrets, hostnames or passphrases in any file.
- **Uncommitted changes:** the working tree had uncommitted deletions of v1 issues 03–12 and edits under `docs/agents/` before this work started. Those are the owner's and stay untouched. Commits stage only this work's files.
