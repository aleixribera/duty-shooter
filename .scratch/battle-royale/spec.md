# Battle Royale on Zero Island, and a redesigned UI

Status: ready-for-agent

Reference art: `reference/island-map.png` (the island) and `reference/regions.png` (one panel per region). They guide layout and identity. Where they disagree with this spec, the spec wins (see "Further Notes").

## Problem Statement

Duty Shooter's gunplay is tuned and its modes work, but every match is a small arena: the largest map is about 6,400 m², and no more than 12 soldiers have ever shared one. The owner wants something massive: a full-scale battle royale to play with friends and a lot of bots.

The game can't do that today:

- **Netcode:** JSON at 60 Hz, with every client sent every player. The most ever measured is 12 scripted clients, at about 3 ms a tick. Rough quadratic extrapolation breaks the tick at about 28 seats. Seats are capped at 32 and bots at 12.
- **World:** box solids in a grid, no terrain, no slope physics, no streaming, no LOD. Nav is built at startup with a sort over every node.
- **Client:** every player gets a full skinned soldier, gun and nameplate, and snapshot parsing runs on the main thread. Integrated graphics have never been measured.
- **Server:** one match per process, so a long match would lock everyone out of Play Online. The home server has 4 shared cores, 6.2 GB of RAM and a 512 MB container limit.
- **Real population:** a peak of 2 people at once, so a match full of humans will never happen. Bots aren't filler here, they are most of the crowd.

The UI was built for short arena matches. It reads as a functional tool, and the owner wants it to look far better, more polished and modern, starting with a pre-match moment that makes players feel something.

## Solution

**Battle Royale** is a new mode played only on **Zero Island**, a new map of about 1 km². It has its own main menu button and its own screen, separate from the team modes.

- **The match:** 60 seats, always full, 10 minutes. Everyone picks a loadout, spawns at a random spot and has one life. There are no items. A shrinking energy wall called **the Ring** pushes everyone together until one squad is left.
- **Squads:** Solos, Duos and Trios from the first release. Duos and Trios can be downed and revived.
- **Where it runs:** on the owner's home server for friends, or fully local in the browser against 59 bots. Both use the same screen and the same rules, with a **Server / Local bots** selector. The bot count is never lowered: performance has to be made to work.
- **The island:** six regions in realistic style at permanent dusk: Ground Zero, The Dustlands, Frostbite Peaks, Mutant Jungle, Neon City and Rogue Harbor. All of it is newly built. Old maps may donate assets but not layouts.
- **The moment before:** a 30-second Preparation screen that builds tension, ending in a camera dive to your spawn.
- **The UI:** the whole interface is redesigned to a new, higher standard, written down in `DESIGN.md`.
- **Delivery:** first a playable, nearly empty island with the complete rules, pushed to `main`. Then each region is finished and pushed one at a time.

The whole thing costs €0 a month and runs on the existing server.

## User Stories

### Getting into a match

1. As a player, I want a Battle Royale button on the main menu, so that it feels like its own game and not one more team mode.
2. As a player, I want a dedicated Battle Royale screen, so that everything about the mode is in one place.
3. As a player, I want a Server / Local bots selector on that screen, so that I can play with friends or alone without leaving it.
4. As a host, I want to pick Solos, Duos or Trios, so that the match suits who is online.
5. As a friend, I want to choose a squad slot on the Battle Royale screen, so that I end up with the people I came to play with.
6. As a player in a part-empty squad, I want bots to fill the gaps, so that I can play a Trio with one friend.
7. As a host, I want the Start button to be mine alone, so that the match begins when the group is ready.
8. As a host who leaves, I want the role to pass to the next person, so that the others aren't stranded.
9. As a player, I want the normal Play Online lobby to stay open during a Battle Royale, so that a long match doesn't lock anyone out of the team modes.
10. As a late arrival, I want to wait and spectate until the next match, so that I'm included without joining mid-match.
11. As a player on a slow connection, I want a clear load progress on the island, so that I know why I'm waiting and how long for.
12. As a solo player, I want to start a Local bots match with no server at all, so that I can play whenever I want.

### Preparation

13. As a player, I want a 30-second Preparation screen after the host presses Start, so that the match starts with an event rather than a menu.
14. As a player, I want to pick my loadout on that screen, so that I commit to my kit before I drop in.
15. As a player, I want my last loadout kept if I don't choose, so that I'm never left unarmed or forced to hurry.
16. As a player, I want the screen to end early when everyone is ready, so that nobody waits for nothing.
17. As a player, I want to see my squad standing lit in the foreground, so that I feel I'm going in with them.
18. As a player, I want to see the island in real 3D as the Ring ignites, so that I feel the scale of what's coming.
19. As a player, I want a low drone and a heartbeat that build, and a "60 ALIVE" count, so that tension rises before the fight.
20. As a player, I want the camera to dive from the sky to my spawn in the last 5 seconds, so that arrival feels like a drop and control snaps to me at the right moment.

### Playing the match

21. As a player, I want to spawn at a random spot well away from other squads, so that I get a moment to read the ground.
22. As a squad member, I want to spawn beside my teammates, so that we start together.
23. As a player, I want my normal weapons, feel and movement, so that the skill I've built carries over.
24. As a player, I want 3 frags that never come back, so that each one is a decision.
25. As a player, I want unlimited reserve ammo and regen, so that the only attrition is the Ring and other players.
26. As a player, I want no looting, so that the whole match is positioning and gunfights.
27. As a player, I want my first fight to reach me within about a minute, so that the opening isn't a walk.
28. As a player, I want a live count of who is alive, so that I feel the field shrink.
29. As a player, I want a compass and a full island map on a key, so that I always know where I am and where the Ring is going.
30. As a player, I want to know the next circle before it closes, so that I can plan a route.
31. As a player, I want the Ring to look and sound like a wall of crackling energy, so that I can see the danger from far away.
32. As a player outside the Ring, I want regen paused and rising damage, so that staying out is a losing bet.
33. As a player, I want the final circle to land anywhere on land, so that matches don't all end the same way.
34. As a player, I want no friendly fire, so that a squad's fights aren't spoiled by accidents.
35. As a player, I want the kill feed to tell downs from eliminations, so that I can read what's happening.

### Downed and revive

36. As a Duos or Trios player at 0 health, I want to go down and crawl, so that a squad can still save me.
37. As a downed player, I want a clear 30-second bleed-out, so that I know how long my squad has.
38. As a teammate, I want to hold a key for 5 seconds to revive, so that saving someone is a risk I choose.
39. As a revived player, I want to return at half health, so that the fight stays tense.
40. As an enemy, I want to finish a downed player, so that downing someone counts.
41. As a finished player, I want to stay dead, so that one life means one life.
42. As a squad, I want to be eliminated once everyone is down or dead, so that a wipe is a wipe.
43. As a Solos player, I want no downed state, so that dead is dead at once.
44. As a player with bot teammates, I want bots to revive me and be revivable, so that a bot in my squad is a real teammate.

### Death and the end

45. As a dead player, I want to spectate a living teammate, or my killer in Solos, so that I can stay in the match.
46. As a dead player, I want to leave at any time, so that I'm never trapped.
47. As a group, I want the match to end as soon as no humans are alive, so that nobody watches bots finish it.
48. As a player, I want my placement shown clearly, so that I know how far I got.
49. As the winner, I want the nuke ending, so that a win feels enormous.
50. As a dropped player, I want to reconnect to my seat, so that a bad connection doesn't end my match.
51. As a player, I want to return to the Battle Royale screen with my squad after a match, so that we can go again quickly.

### Bots

52. As a player, I want every seat filled, so that the island always feels alive.
53. As a player, I want bots to fight each other, so that I hear distant gunfire and arrive at fights already under way.
54. As a player, I want bots to respect the Ring and keep moving, so that they don't die standing still.
55. As a player, I want bot squads to move and revive together, so that they feel like squads.
56. As a good player, I want to win about 1 match in 4, so that a win means something.
57. As a player, I want bots not to gang up on humans, so that the island feels fair.

### The island

58. As a player, I want six regions I can recognise at a glance, so that I can call out where I am.
59. As a player, I want each region to have a dense core and lighter ground around it, so that the island has clear places worth fighting over.
60. As a player, I want real hills, canyons and slopes, so that height and cover shape fights.
61. As a player, I want to wade through rivers and shallows, so that water is terrain and not a wall.
62. As a player, I want the sea to be a clear boundary, so that I never die from confusion at the edge.
63. As a player, I want bridges linking Rogue Harbor, so that it never becomes a dead end.
64. As a player, I want to reach the Frostbite plateau but not the summit, so that no sniper rules the island.
65. As a player, I want a single permanent dusk, so that the neon, the crater and the jungle all glow against the sky.
66. As a player, I want parked trains, wrecks and vehicles as cover, so that the ground feels used.
67. As a player, I want the island to feel continuous, so that I can see distant regions and walk to them.

### Performance

68. As a friend on an integrated-graphics laptop, I want 60 fps at 1080p, so that I can play with the group.
69. As a Local bots player, I want all 59 bots at full count, so that it's the same game as online.
70. As a server owner, I want one match to fit on the home server alongside its other services, so that this stays free.
71. As a player, I want the island to appear without long hitches, so that the game doesn't feel like it's straining.

### Density and balance

81. As a player, I want the land between Cores to be full of trees, rocks and terrain, so that crossing it is a choice of routes rather than a walk across a bare plain.
82. As a player with a close-range weapon, I want cover within a short sprint, so that I'm not simply sniped in the open.
83. As a sniper, I want a few long lanes and open risky ground, so that my weapon still has a role.
84. As a player, I want every Region to feel dense in its own way, so that the island feels like a real place.
85. As a player hiding in foliage, I want bots to be unable to see me through it, so that concealment works against them too.

### The redesigned UI

72. As a player, I want every screen to look polished and modern, so that the game feels finished the moment it opens.
73. As a player, I want a cinematic main menu, so that the game makes an impression before I press anything.
74. As a player, I want presses to answer instantly, so that polish never costs responsiveness.
75. As a player, I want the HUD redesigned and easier to read, so that I take in more at a glance.
76. As a player, I want the lobby, settings, scoreboard and pause screens to match, so that the game feels like one product.
77. As a player, I want the team modes to benefit too, so that the redesign isn't limited to Battle Royale.

### Trying and maintaining it

78. As a developer, I want `?explore=zero-island` to walk the island alone, so that a region can be checked without running a match.
79. As a developer, I want a benchmark link anyone can open on a real laptop, so that the integrated-graphics target can be measured.
80. As a developer, I want the load test to reach 60 seats, so that server capacity is measured rather than guessed.

## Implementation Decisions

### Domain language

Add these to `GLOSSARY.md` when each one lands:

- **Battle Royale**: the mode. Not "BR" in the product.
- **Zero Island**: the map. A map, in the sense the glossary already uses.
- **Region**: one of the island's six areas. Never "Zone", which stays with Outposts.
- **Core**: a Region's dense, fully detailed place.
- **Ring**: the shrinking safe area and its wall.
- **Stage**: one hold-and-shrink step of the Ring.
- **Squad**: one, two or three seats that win or lose together.
- **Downed**, **Bleed-out**, **Revive**, **Finish**.
- **Preparation**: the pre-match screen. It replaces the Countdown in this mode.

Update stale entries as they're touched, including the Charge-only spectator and "either map".

### Match rules

- **Ownership:** a new mode class in the core, alongside the others, with a mode id. It's offered only through the Battle Royale screen, so it stays out of the lobby's mode picker. It plays only on Zero Island.
- **Seats:** always 60, with bots filling every empty seat. A person takes a bot's seat as bot fill does today. The current limits of 32 seats and 12 bots stop applying to this mode only.
- **Squads:** 60 solos, 30 duos or 20 trios. The core gains a squad identity on seats, which replaces two-team logic in this mode. Squad size is a mode option. No friendly fire between squadmates.
- **Spawning:** a validated random point on land, at least 100 m from every other squad, with squadmates a few metres apart. Spawn protection (1.5 s) stays. If playtests show the first fight regularly takes over a minute, tighten spawn spacing before changing anything else.
- **Loadout:** the existing primary, secondary and grenade, locked when Preparation ends. Reserve ammo stays unlimited.
- **Frags:** 3 per seat, bots included, not refilled. The simulation gains a per-mode starting frag count, and the HUD shows it.
- **Health:** existing regen rules, paused while outside the Ring.
- **One life:** `canRespawn` is false. A Finished or bled-out seat is out.
- **Ring:** 10 minutes in total, with the first shrink starting at 1:00, and 6 Stages. Each Stage holds, then shrinks to a new circle fully inside the last, which ends the match by 10:00 at the latest. The next circle is known and shown throughout. Each final circle's centre must be on land. All circles come from a match seed, so a test can replay them. Damage rises per Stage, and the exact table is a stat in the stats file and tuned by bot soaks. Starting radii and damage are tuning, not a contract.
- **Winning:** the last Squad with anyone alive wins. Being downed doesn't count as alive. If the last seats die on the same tick, the higher kill count wins, then the lower seat number, so a result always exists.
- **Early end:** when no humans are alive, the match ends at once, and placement comes from how many squads remained.
- **Late joiners and reconnects:** nobody enters mid-match as a player. Arrivals spectate. A dropped player keeps their seat for the existing hold, and a bot plays it meanwhile so a seat is never a free kill. They take it back on return.
- **Ending:** the winner gets the nuke ending, a new shot aimed at Ground Zero, then the scoreboard, then the Battle Royale screen with squads kept.

### Downed and revive

- Duos and Trios only. At 0 health a seat becomes Downed unless it was already Downed, or the rest of its Squad is out, in which case it dies.
- Downed: crawl speed, no firing, no frags, no regen, its own health pool that enemies can reduce to Finish. Bleed-out is 30 s and is not paused or sped up by the Ring.
- Revive: hold the interact key within reach for 5 s. Moving away or taking damage cancels it. No limit on how often. The Revived seat returns at half health with its loadout and remaining frags.
- Bots go Downed and Revive by the same rules. A bot weighs a Revive against nearby threats and the Ring.
- Needs a crawl pose and a revive action on the soldier model, built in Blender through its generator script, and a Downed first-person camera.

### Zero Island

- **Layout:** as in `reference/island-map.png`: Frostbite Peaks north-west, Mutant Jungle north-east, Neon City east, Rogue Harbor south, The Dustlands south-west, Ground Zero in the centre. A railway links the regions and rings the crater. About 1 km² of land, in the sea. The sprint across takes about 2 min 40 s.
- **Look:** realistic, matching the game's existing soldiers and guns, keeping the reference's layout and colour identity. Permanent dusk with one low sun over the sea to the south-west, so Rogue Harbor and the Dustlands catch the sunset and the Jungle and Neon City sit in shadow where their own lights carry them.
- **New work only:** no map layout is reused. Assets such as props and building pieces may be.
- **Cores:** each Region has one Core of about Crash's size, 6,000 to 10,000 m², where building detail is spent. The ground between Cores is not empty: see "Density and sightlines".

| Region | Core and landmarks (from `reference/regions.png`) |
| --- | --- |
| **Ground Zero** | The crater with the blue-glowing core at its centre, blast barriers, bunkers, cooling pipes, and the factory and rail hub on the rim |
| **The Dustlands** | Layered canyon mesas, the crashed jet, mining shacks, wrecked buggies as cover |
| **Frostbite Peaks** | Reachable snow base and radar plateau, bases, watchtower, stopped cable cars, ice walls. Summit is scenery |
| **Mutant Jungle** | The giant glowing tree, crystals, stone ruins, a stream that can be waded |
| **Neon City** | Streets, an elevated highway, about 4 enterable buildings and some reachable roofs. Skyscrapers are outer shells |
| **Rogue Harbor** | Moored cargo ship, cranes, warehouses, container stacks, airstrip, piers |

- **Density and sightlines:** the owner played the blockout and found it far too open and too easy for snipers. All of the island gets filled, in every Region, so a sniper is one option and not the answer.
  - **Shape first:** ridges, gullies, berms and embankments break long sightlines at no drawing cost.
  - **Hard cover:** rocks, walls, wrecks, trunks and terrain stop bullets, and sit within a short sprint of anywhere a player can stand.
  - **Soft cover:** bushes, tall grass and foliage hide a player but don't stop bullets. Bots' sight has to respect them, so a bot never aims through a bush it couldn't see through.
  - **Region character:** dense forest in the Jungle, pines and rock outcrops on the Peaks, canyons and boulders in the Dustlands, scrub and pylons around Ground Zero, trees and walls on the approaches to the city and harbour.
  - **Measured, not judged by eye:** a sightline test samples standing points across the island. Targets to tune from: median clear line of sight about 60 m or less, and every standing point within about 25 m of hard cover. The crater floor, airstrip and a few long lanes stay deliberately open and risky, so the sniper keeps a place.
  - **Frame budget:** vegetation is instanced with distance LOD and has to hold the 60 fps target.
- **Boundary:** the sea's edge is a Boundary. Wadeable water slows movement slightly and sounds different. There's no swimming, and no deep water a player can reach.
- **Art:** every model comes from a Blender generator script, is checked in preview renders and then in the game, as the repo's rule for map art says.

### World engine

- **Terrain:** a heightfield in the map's data, usable headless in the core, sampled by movement and bullets. This is a new collision primitive beside box solids and extends ADR 0001 and ADR 0002, so it gets its own ADR. Hidden player-clip steps aren't an option at this scale.
- **Slopes:** movement walks up to a set slope limit and slides beyond it. The spec's reachable and unreachable areas, including the summit, are enforced by slope and Boundary.
- **Broad phase:** large-world queries for players, bullets and frags go through a spatial index. Anything that walks all players per projectile or per bot goes, since it's what makes today's tick quadratic.
- **Build time:** collision and nav are generated ahead of time and shipped as data, since a build at server start would be too slow on this scale.

### Bots at scale

- **Nav:** hierarchical: a coarse Region-level graph over chunked local nav, loaded from build output. `nearestNode` no longer sorts everything. This extends ADR 0004's nav graph.
- **Brains:** far-from-humans bots think less often and may use simplified movement and fights, as long as outcomes stay believable. Bots near humans run at full rate.
- **Behaviour:** routes to the next circle, fights other Squads, moves as a Squad and Revives. Existing bot styles and moderate skill stay, with no difficulty setting, and tuning targets a good player's win rate of about 1 in 4.
- **Fair target choice:** bots pick targets without any preference for humans.

### Netcode

- **Interest management:** each client gets full-rate data for nearby seats, reduced rate for mid-range and only what the map needs beyond that. Relevance comes from distance and whether a seat could plausibly be seen or heard, and a seat a client can't reach yet is simply not sent.
- **Encoding:** a binary snapshot codec replaces JSON for snapshots, with a protocol version bump. All modes use it, so there's one path to maintain.
- **Rates:** simulation stays at 60 Hz, so movement and weapon stats are unchanged. Battle Royale snapshots run at 20 to 30 Hz, with the exact rate set by the load test. Team modes keep 60 Hz.
- **Bots** have no connection and cost no snapshot traffic.
- **Lag compensation** keeps working with the lower snapshot rate and at this seat count, for its existing 0.3 s window.

### Server and Local bots

- **Server:** a Battle Royale match runs in its own OS process inside the existing deployment, behind the one public address, so clients never see a second URL and a slow match can't touch the Play Online tick. It starts when a Battle Royale lobby is first needed. The container memory limit is raised to whatever the measured match needs, within what the box has free (about 3.8 GB).
- **Hosting is unchanged:** home server, same public route, €0.
- **Limits:** the 12-sockets-per-address rule gets an allowance for the load test alone.
- **Local bots:** the same server code runs in a Web Worker, so the 59 bots never share the render thread. The bot count is fixed at 59.
- **Client threading:** snapshot decoding moves off the main thread if the frame budget needs it.

### Client rendering

- **Terrain and streaming:** chunked terrain and model loading with distance LOD, and baked lighting per chunk. Assets stream during the match where possible, and the first spawn's surroundings load during Preparation.
- **Distance:** far-off regions stay visible as simplified shapes and imposters.
- **Soldiers:** three levels: full skinned near, cheap animated at mid range, instanced imposters far away. Nameplates near only.
- **Budgets:** download under about 150 MB in total and under about 40 MB before the first match can start, cached between visits. Those are targets to prove in the first release and revise from measurement. Spec-level performance target: 60 fps at 1080p on integrated graphics.
- **Weak machines:** lowering visual detail is allowed. Lowering the seat or bot count isn't.
- **Load gate:** all humans must have what they need before Preparation's dive starts, with a limit after which a slow player joins once loaded and a bot holds the seat meanwhile.
- **Bake:** lighting is baked per chunk. If that outgrows the build, baked results get committed and the bake moves out of the normal build.

### Main menu and Battle Royale screen

- **Main menu:** Play Online, Battle Royale, Bot Match, Practice Range, Settings. Update the rule in `AGENTS.md` that lists the menu.
- **Battle Royale screen:** holds the Server / Local bots selector, the Solos / Duos / Trios picker, the Squad slots with friends and bot fills, connection state and Start. Battle Royale isn't in the team-mode picker or in Bot Match.
- **Spectating and the map** are shared HUD parts, available to other modes only if a later ticket wants them.

### Preparation

The default answer would be a timed loadout menu. This one is staged instead:

1. Dark, with the island in real 3D from above as the Ring ignites around it.
2. The player's Squad lit in the foreground, using the real soldier models, with the loadout picker alongside.
3. A low drone and a heartbeat rising, with "60 ALIVE" held on screen.
4. In the last 5 seconds the camera dives to the player's spawn and control snaps to them.

Timed at 30 s, ending early when everyone is ready, keeping the last loadout otherwise. The screen has to run on the integrated-graphics target. This is the deliberate exception to "no screen fades" in `DESIGN.md`.

### UI redesign

- **Scope:** main menu, Battle Royale screen, Preparation, lobby, settings, HUD for every mode, scoreboard, pause, load screens and connection states. Every mode benefits.
- **Direction:** the generic modern answer is glass panels, gradients and glow. This departs from it by keeping the "machined instrument over a live map" character and raising its craft: a real type scale with confident scale contrast, choreographed motion, a richer live 3D backdrop and sharper hierarchy. The test of the direction is that it looks like one designed game, not a template.
- **Process:** rewrite `DESIGN.md` first through `design-md` and `taste-skill:design-taste-frontend`, add tokens to the theme file, then restyle screen by screen. Check real screenshots at desktop and phone width, and finish each with `design-audit`.
- **Rule changes in `DESIGN.md`:**
  - A hazard colour for the Ring, used only for the Ring, is added beside the one signal colour.
  - Choreographed motion is allowed where it adds meaning. A press must still answer within the frame.
  - A single self-hosted display face is allowed if its subset stays under about 40 KB and the system font still paints first.
  - Square silhouettes, signal discipline and "no generic AI look" rules stay.
- **Constraints kept:**
  - The first page load still reaches no three.js, so the menu appears before the engine.
  - Menu steps stay under about 60 ms in `perf.mjs`.
  - Effects stay cheap to draw over a live map.
  - HUD readability in play comes before style.

### Delivery

Work goes straight to `main` with a version tag per commit, as `AGENTS.md` says. Order:

1. **Prove the engine:** netcode, spatial index, 60-seat load test on the home server, with bots and scripted clients. If the load test can't pass, the owner hears the numbers before any art gets built on it. Their budget stays €0, so this is a report, not a purchase.
2. **Terrain and island blockout:** terrain, slopes, water, Boundary, nav, `?explore=zero-island`.
3. **Rules:** the mode, Squads, Downed and Revive, Ring, spawns, ending, compass and map, spectating.
4. **UI foundation:** new `DESIGN.md`, the main menu and Battle Royale screen, then Preparation.
5. **Local bots** in a worker.
6. **First playable release:** the whole island, nearly empty, with complete rules, on server and locally, pushed to `main`.
6a. **Island cover pass:** terrain shaping and real cover across the whole island, before the first playable release, so bots and players learn the real island.
6b. **Vegetation kit:** trees, shrubs, grass and rocks for every Region, built in Blender and placed with the rendering work, before the Regions.
7. **Regions, one release each:** Ground Zero, The Dustlands, Rogue Harbor, Neon City, Frostbite Peaks, Mutant Jungle (the heaviest to render, so it goes last).
8. **UI redesign of the remaining screens:** can run alongside the regions, and is its own ticket per group of screens.
9. **Final tuning** of the Ring, bots and performance on the finished island.

New ADRs: terrain collision, interest-managed binary snapshots, Battle Royale as its own process, and server code running in a worker.

## Testing Decisions

A good test checks what a player or the server can observe through a public interface, never private state. Stats come from the stats file, so a test doesn't pin a number that tuning will change.

**The seams, highest first.** These are the same seams the repo already has. Only the last two are new:

1. **Headless match:** a real `GameServer` with bots and test clients, driven tick by tick, with results read from what clients receive. This is the main seam for the mode, Squads, Downed and Revive, the Ring, Winning, reconnects and relevance.
2. **Map soak:** the existing `*-bots-*` pattern on Zero Island: nav reachability, no stuck bots, every Stage reachable, match always ends in time.
3. **Scripted browser:** `bot-runs`, `record`, `perf.mjs` and `chaos.mjs` for the real game, run with `remote-test --local`, for Preparation, the menu path, the HUD and full matches.
4. **Load test (extended):** 60 seats on the home server, measured from the server, recording tick time, CPU, memory and upload. Pass bar: 99th-percentile tick under 12 ms and worst under 16.7 ms, with Play Online unaffected.
5. **Benchmark link (new):** a page anyone can open on a real laptop, which runs a scripted full match view and prints frame times.

**Modules and what they prove:**

- **Mode rules:** Squad win and loss, one life, 3 frags, no friendly fire, early end, tie-break. Prior art: the Charge and gun game tests.
- **Ring:** seeded circles stay nested, finish on land and finish by 10:00, and damage rises, with regen paused. Prior art: the Outposts zone tests.
- **Downed and Revive:** all rules above, including Revive being cancelled, Finish and Squad wipe. Prior art: Charge's no-respawn rounds.
- **Spawns:** spacing holds across many seeds, and spawns are always on land inside the Boundary.
- **Terrain:** heightfield collision, slope limit, bullets hitting ground, and the summit being unreachable. Prior art: the pmove and world tests.
- **Bots:** a soak per Squad size, Squads move and Revive together, nobody stands outside the Ring forever, and win-rate tuning stays on target. Prior art: `balance.test.ts`.
- **Netcode:** codec round trip, relevance sends near seats and leaves out far ones, reconnect, and the fall-back to slower rates. Prior art: the net tests and `chaos.mjs`.
- **Local bots:** the worker runs a full match to the end with 59 bots and identical rules.
- **UI model:** Battle Royale screen state, Squad slots, Preparation flow and ready logic. Prior art: the UI model tests.
- **Purity:** the existing purity and headless tests still pass, with terrain in the core and map data reaching the server.

- **Sightlines:** a headless sampler over the island's terrain and solids reports the density targets and fails when they regress. Prior art: nav reachability in the bot soak support.

**Bugs and shipping:** as with the rest of the repo, UI isn't finished until screenshots at desktop and phone width have been looked at, and each Region isn't finished until its model has been seen in preview renders and in the game.

## Out of Scope

- Loot, inventory, armour, ammo economy, attachments, healing items.
- Vehicles, including the buggies, snowboards, cable cars and flying cars in the reference art. They're parked scenery, cover or set dressing at most.
- Choosing a drop zone, a plane or parachutes, despite the "Choose your drop zone" text in the reference art. Spawns are random on the ground.
- Moving trains in the first version.
- Swimming and deep water.
- Accounts, progression, ranked play, stats that persist, matchmaking with strangers, anti-cheat beyond server authority.
- More than one Battle Royale at a time on the server.
- Paid hosting.
- Phones, touch and Safari as playable targets (phone width is still checked for layout).
- A difficulty setting for bots.
- Using Battle Royale on other maps, or Zero Island in other modes.

## Further Notes

- **Measured on 2026-11-01 from the play report:** peak 2 people at once, 3 people on the busiest day, 2 h 44 min of human play and 13 h 41 min of bot play, all from a five-day log. If 20 or more real people ever play at once, the 60-seat limit and bot-heavy design should be revisited.
- **Art guide versus spec:** the reference art is cartoon-styled and shows vehicles and a drop. The owner picked realistic style, on foot and random spawns, so those parts of the art are identity only.
- **Largest open risk:** 59 local bots plus the island at 60 fps on integrated graphics, with no lowering of bot count. It can't be confirmed from the owner's RTX PC. The benchmark link has to be run on a real integrated-graphics laptop, and until someone does that, the target stays reported as unverified.
- **Second risk:** the home server's upload speed isn't documented, and the public route adds 50 to 150 ms over TCP. With friends-sized groups this should hold, since bots use no bandwidth, and the load test will confirm it.
- **Numbers are extrapolations** wherever they describe more than 12 seats, because nothing above 12 has ever been measured. The first delivery step exists to replace them with real ones.
- **Other sessions** are working in this checkout, including on the bot nav and Crash code. Stage only your own files, and re-read `nav.ts` before changing it.
