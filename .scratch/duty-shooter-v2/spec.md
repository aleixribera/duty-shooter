# Duty Shooter v2: the arsenal, Switchyard, objective modes and humans vs bots

Status: ready-for-agent

## Problem Statement

Duty Shooter is meant for game nights with friends: any number of us, from two to a dozen, in the one public lobby on the home server. The gunplay and movement feel right, but there isn't enough game around them for an evening.

- **One gun.** Everyone carries the same M4A1, so every fight plays the same way, at every range, on every map.
- **One map.** You learn Survival Town in twenty minutes, and then there's nowhere else to go.
- **No objective.** Team deathmatch and free-for-all give a team nothing to play around: no point to hold, no round to win.
- **Small groups feel empty.** Bot fill keeps a match going, but two or three friends get split across teams of bots, when what they want is to play together.
- **The lobby is stale and blind.** The live server still runs v1.3.0 although the repo is at v1.3.9, and the server logs nothing about who played, so nobody can tell whether a release made an evening better.

The next time we play is in several days. I want the whole game finished by then, built without checkpoints, and proven by automated checks instead of playtests, because we won't play it until it's done.

## Solution

One long arc, released as **v2.0.0**. Every ticket is tagged and pushed as it lands (v1.4.x and up), but the live lobby stays pinned to v1.3.9 until v2.0.0 ships.

- **A healthy lobby first.** The deploy is fixed so the server runs what is tagged, the live image is pinned for the length of the arc, and the server writes an event log (people and bots joining and leaving, matches starting and ending) that survives redeploys.
- **The arsenal.** Five weapons, each a real firearm type with its own Blender model, first-person animations, synthesised sound and a stats row of its own:
  - **Assault rifle:** the existing M4A1, unchanged.
  - **SMG:** a compact 9 mm submachine gun. The fastest time to kill up close, falling off fast past 15 m.
  - **Shotgun:** a 12-gauge pump. One-shot kills up close, loaded a shell at a time.
  - **Sniper rifle:** a bolt action with a scope. A one-shot kill to the upper body at any range.
  - **Pistol:** a 9 mm semi-automatic, the only secondary. A quick draw for when the primary runs dry.
- **Weapon switching**, with draw and holster times per weapon.
- **The frag grenade:** cooked by holding, thrown on release, bouncing off the world and exploding on a fuse.
- **The loadout screen:** pick a primary, a secondary and the grenade. Everything is unlocked from the start. There are no attachments and no progression, and a change applies at the next spawn.
- **Switchyard**, a new original map: a freight rail yard at dusk, medium-sized (about 1.5–2× Survival Town), with three lanes so fights happen at close, medium and long range. Its end-of-match moment is a night freight train thundering through the yard.
- **Two objective modes**, each with an original name:
  - **Outposts:** three capture zones on each map, and holding them scores.
  - **Charge:** round-based plant and defuse, with two charge sites on each map and no respawns within a round.
- **Humans vs bots:** an option for team modes that puts every person on one team, against a bot team sized to the group.
- **A 12-player lobby** (6v6). Bot fill still tops each side up to 3 while anyone plays, so a small group gets a 3v3 and more people grow the match until it's 6v6.
- **The match vote:** the intermission offers three random map-and-mode combinations, plus a humans-vs-bots toggle.
- **Bots play everything:** every weapon, the grenade, both objective modes, both maps and the humans-vs-bots setup.
- **Everything works offline too:** Bot Match on either map in every mode, and the full arsenal on the Practice Range.
- **Proof instead of playtests:** weapon balance runs, time-to-kill tables, performance budgets, a 12-player load test, full browser runs of every mode on both maps, reviewed model renders, a code review, and a final report with screenshots and a short gameplay video.

## User Stories

### A lobby that's current and measurable

1. As the owner, I want the live lobby to run exactly the version I tagged, so that my friends never play a build from weeks ago.
2. As the owner, I want the live lobby pinned to v1.3.9 while the v2 arc is being built, so that a half-finished arc never reaches the public lobby.
3. As the owner, I want a single, documented step that moves the live lobby to v2.0.0, so that the release is one deliberate action.
4. As the owner, I want every join, leave, match start and match end logged with whether it was a person or a bot, so that I can see how much we actually play.
5. As the owner, I want the event log to survive container redeploys, so that a weekend's history isn't lost at the next update.
6. As the owner, I want a short play report (sessions per day, peak people at once, matches finished, time played by people versus bots only), so that I don't have to read raw logs.
7. As the owner, I want the smoke and load-test scripts' players marked, so that they don't count as people in the play report.

### Choosing a loadout

8. As a player, I want to pick a primary, a secondary and a grenade before I spawn, so that I play the way I like.
9. As a player, I want my loadout remembered between visits, so that I don't set it up every evening.
10. As a player, I want to change my loadout while dead or from the pause menu, applying at my next spawn, so that I can adapt to the map and the other team.
11. As a player, I want every weapon available from the start, so that a friend who joins for one evening isn't behind.
12. As a player, I want the loadout screen to show each weapon's role, rate of fire, damage, range and handling as simple bars, so that I can choose without reading a wiki.
13. As a player, I want a sensible default loadout (the M4A1, the pistol and a frag), so that I can just press Play.
14. As a controller player, I want to drive the loadout screen with the pad, so that I never need the mouse.

### Switching and carrying weapons

15. As a player, I want to switch between my primary and secondary with a key, the mouse wheel or a pad button, so that I can draw the pistol when my primary runs dry.
16. As a player, I want switching to the pistol to be faster than reloading a primary, so that the swap is the right call in a close fight.
17. As a player, I want to fire only once the weapon is fully raised, so that switching has a real cost.
18. As a player, I want each weapon to keep its own ammunition when I switch away and back, so that a half-empty magazine stays half empty.
19. As a player, I want sprinting, sliding, mantling and melee to work with every weapon, so that movement feels the same whatever I carry.
20. As a player, I want the rebinding screen to cover the new actions (switch weapon, throw grenade), so that every control can be changed.
21. As a player, I want other players' soldiers to hold the weapon they're actually using, so that I can read a threat before it fires.

### The SMG

22. As a player, I want the SMG to win close-range fights against every other primary except the shotgun at point-blank range, so that it has a clear job.
23. As a player, I want the SMG to lose most fights past about 25 m, so that it can't replace the rifle.
24. As a player, I want the SMG to aim down sights and recover from sprinting faster than the rifle, so that it suits aggressive movement.
25. As a player, I want the SMG's recoil to bounce but stay controllable, so that it rewards tracking and not just spraying.

### The shotgun

26. As a player, I want the pump shotgun to kill in one shot within a few metres, so that holding a doorway with it is a real threat.
27. As a player, I want its damage to fall off sharply with distance, so that it can't win medium-range fights.
28. As a player, I want to pump between shots and load shells one at a time, with a reload I can cancel by firing, so that it handles like a real pump gun.
29. As a player, I want a shotgun blast to throw several pellets in a visible spread, so that I can see why a shot hit or missed.
30. As a player, I want shotgun pellets to penetrate less than rifle rounds, so that a door doesn't become a wall of pellets.

### The sniper rifle

31. As a player, I want the sniper rifle to kill in one shot to the head, neck or upper torso at any range, so that a good shot always pays off.
32. As a player, I want shots to the lower torso and limbs to need two hits, so that a careless shot can be punished.
33. As a player, I want a scope view with real magnification, so that long lanes become playable.
34. As a player, I want the scope to sway and settle while I stand still, so that quick-scoping across the map isn't free.
35. As a player, I want to work the bolt between shots, so that a miss costs time.
36. As a player, I want the sniper to be poor from the hip and slow to aim, so that it stays a long-range weapon.
37. As a player, I want a visible scope glint when someone aims a sniper at me from range, so that I have a chance to react.
38. As a player, I want the sniper's rounds to penetrate more than the rifle's, so that thin cover doesn't save someone from it.

### The pistol

39. As a player, I want the pistol to fire as fast as I can click, up to a limit, so that it rewards quick clicks.
40. As a player, I want the pistol to win against a primary that's reloading, and lose against one that's ready, so that it fills its role without replacing a primary.
41. As a player, I want to move faster with the pistol out than with any primary, so that it suits a retreat or a chase.

### The frag grenade

42. As a player, I want to hold the grenade button to cook a frag and release it to throw, so that I can time the explosion.
43. As a player, I want to see and hear the grenade cooking, so that I don't blow myself up by accident.
44. As a player, I want a cooked grenade to explode in my hand when the fuse runs out, so that cooking has a risk.
45. As a player, I want grenades to bounce off walls, floors, roofs, fences and vehicles and roll to a stop, so that I can bank a throw into a room.
46. As a player, I want a frag to kill near its centre and hurt over a wider radius, with walls blocking the blast, so that cover works.
47. As a player, I want one frag per life, so that grenades are a tool and not spam.
48. As a player, I want a grenade indicator on my HUD when a live frag lands near me, so that I have a moment to run.
49. As a player, I want frag kills to show in the kill feed with their own icon, so that I know what got me.
50. As a player, I want my own frags to hurt me but not my teammates, so that friendly fire stays off as it is today.

### Weapon feel and presentation

51. As a player, I want each weapon to have its own first-person model, animations (draw, holster, idle, fire, reload, inspect, sprint) and recoil, so that each one feels like its own gun.
52. As a player, I want each weapon to have its own synthesised fire, mechanical and reload sounds, with the existing wall muffling and distance falloff, so that I can tell weapons apart by ear.
53. As a player, I want the same impacts, tracers and muzzle flashes as today, scaled per weapon, so that the new guns fit the existing look.
54. As a player, I want the kill feed to show the weapon used for each kill, so that I learn what's working.
55. As a player, I want the HUD's ammo counter to show the current weapon's magazine and the grenade, so that I know what I have.
56. As a player, I want the viewmodel viewer to show every weapon's animations, so that the owner can review them quickly.

### Switchyard

57. As a player, I want a second map that looks and plays nothing like Survival Town, so that an evening has variety.
58. As a player, I want Switchyard's three lanes (a long track lane, a middle lane between rows of freight cars, and a tight lane through the sheds and the signal box), so that every weapon has a place to shine.
59. As a player, I want to climb onto freight cars, platforms and the signal box where the movement allows it, so that the map has height to fight over.
60. As a player, I want to shoot through thin sheet-metal carriages and wooden sheds, but not through locomotives, concrete or rails, so that penetration makes sense to read.
61. As a player, I want Switchyard to work as a 3v3 and as a 6v6, so that it plays well with any group size.
62. As a player, I want the dusk look (low sun, long shadows, sodium lamps coming on), with baked lighting like Survival Town's, so that the map is beautiful and fast.
63. As a player, I want scenery beyond the boundary (lines of track running away, hills, a distant town), so that the map doesn't feel boxed in.
64. As a player, I want a freight train to thunder through the yard at the end of a match, so that Switchyard has its own ending moment the way Survival Town has the nuke.
65. As a player, I want ambient yard sounds (distant horns, clanking couplings, buzzing lamps) kept below gunfire and footsteps, so that the map feels alive without masking players.
66. As a player, I want no stuck spots, gaps or ways out of Switchyard, and no invisible walls that eat bullets, so that the map holds up to my friends trying to break it.

### Outposts

67. As a player, I want three zones on each map that my team can capture by standing in them, so that there's something to fight over beyond kills.
68. As a player, I want a zone to capture faster when more teammates stand in it, up to a limit, so that teamwork pays off.
69. As a player, I want a zone with both teams in it to be contested and frozen, so that I have to clear it before I can take it.
70. As a player, I want my team to score every second for each zone we hold, so that holding two zones beats chasing kills.
71. As a player, I want zone markers on screen and the zones' state on the HUD, so that I always know where to go.
72. As a player, I want spawns that favour my team's held zones but never put me right next to an enemy, so that a zone is worth holding and spawn traps don't happen.

### Charge

73. As a player, I want round-based plant and defuse with no respawns within a round, so that each life matters.
74. As an attacker, I want to plant the charge at either of two sites by holding the use button, so that we can choose where to strike.
75. As a defender, I want to defuse a planted charge by holding the use button, or win by wiping out the attackers before they plant, so that both sides have two ways to win.
76. As a player, I want the charge to be carried by one attacker, dropped when they die and picked up by any attacker, so that protecting the carrier matters.
77. As a player, I want planting and defusing to take a few seconds, interrupted if I move, fire or get killed, so that they're risky.
78. As a player, I want a 90 s round, a 40 s fuse once planted, first to 4 rounds, and a side swap at halftime, so that a match lasts a sensible part of an evening.
79. As a player, I want to change my loadout between rounds, so that the side and the site can shape what I bring.
80. As a dead player, I want to watch a living teammate until the round ends, so that I stay in the game.
81. As a player, I want a clear round-start countdown, round-win banner and a team-wipe or detonation outcome, so that I always know why a round ended.
82. As a player, I want the charge's beeping to speed up as the fuse runs down, so that the last seconds are tense.

### Humans vs bots

83. As a small group of friends, I want all of us on one team against a team of bots, so that we play together instead of against each other.
84. As a group, I want the bot team sized to us (one bot per person plus two, at least four, capped by the lobby), so that the fight is fair whatever our number.
85. As a group, I want a friend who joins mid-match to join our team and add a bot to the other side, so that the match stays balanced.
86. As a group, I want humans vs bots in every team mode (team deathmatch, Outposts and Charge), so that we can play any objective together.
87. As the first player on an empty server, I want to switch humans vs bots on when I pick the mode, so that an evening can start that way.

### The lobby and the vote

88. As a player, I want the lobby to hold up to 12 people, so that the whole group fits on a big night.
89. As a player, I want a small group to play 3v3 with bots and a larger group to grow toward 6v6, so that a match is never empty and never overcrowded.
90. As a player, I want the intermission vote to offer three random map-and-mode combinations, so that we keep getting variety without a long list.
91. As a player, I want a humans-vs-bots toggle in the vote that a majority switches on or off, so that the group decides together.
92. As a player, I want the next map to load during the vote, so that the next match starts on time.
93. As a player whose machine is still loading when a match starts, I want to join it as soon as the map is ready, so that a slow load never kicks me.
94. As a player, I want the Play Online tile to show the current map, mode, people, bots and whether it's humans vs bots, so that I know what I'm joining.

### Bots

95. As a player, I want bots to carry varied loadouts that suit their personality, so that a bot match feels like playing against people.
96. As a player, I want bots to use each weapon at its range (rushing with the SMG and shotgun, holding lanes with the sniper), so that they don't misuse weapons.
97. As a player, I want bots to switch to the pistol when their primary runs dry mid-fight, so that they behave like people.
98. As a player, I want bots to throw frags at enemies they know are holding a spot, and to run from frags landing near them, so that grenades matter both ways.
99. As a player, I want bots to capture, defend and contest Outposts zones, so that objective matches against bots work.
100. As a player, I want bots to carry, plant and defuse the charge and to defend sites, so that Charge works against bots.
101. As a player, I want bots to find their way around Switchyard as well as around Survival Town, so that the new map works with bots.

### Offline

102. As a player, I want offline Bot Match on either map, in every mode, with humans vs bots, so that I can try everything alone before game night.
103. As a player, I want every weapon and the grenade on the Practice Range, with a lane for long-range sniping, so that I can learn each gun.
104. As a player, I want to explore Switchyard alone from the main menu, so that I can learn it before playing.
105. As a player on the GitHub Pages copy, I want all of the above offline, so that the copy stays useful.

### Performance and quality

106. As a player on modest hardware, I want Switchyard to stay within the same per-preset frame budgets as Survival Town, so that the new map runs as smoothly.
107. As the owner, I want the server to stay at 60 Hz with 12 players (people and bots) on either map, so that a big night doesn't lag.
108. As the owner, I want weapon balance checked automatically, so that no weapon dominates on game night.
109. As the owner, I want a final report with screenshots, a short gameplay video and the results of every check, so that I can see the finished game before my friends do.

## Implementation Decisions

### The deploy and the event log (ticket zero)

- **Diagnose before fixing.** The live server reports v1.3.0 while main is at v1.3.9, although the auto-updater should have taken every image. The ticket finds the cause (a failing CI run, an image that was never published, the updater, or the server's tag) and fixes it at the source.
- **Pinning for the arc.** Compose already takes the image from `DUTY_IMAGE`. CI also publishes a `:vX.Y.Z` image tag for each version tag. The server's stack `.env` pins `DUTY_IMAGE` to the v1.3.9 image for the length of the arc, so the auto-updater keeps it there. The v2.0.0 release sets it back to `:latest`. The deploy doc describes both steps.
- **The event log** is one JSON line per event, appended to a file on a named volume. That volume is the server's only writable path; the root filesystem stays read-only. The events are `join`, `leave`, `matchStart` and `matchEnd`, each with a time, the player id and name, `bot` (true or false), `script` (true for smoke and load-test players, which join with a marker) and, for matches, the map, mode, humans-vs-bots flag, duration and result. The same lines also go to stdout.
- **The play report** is a small script that reads the event log and prints sessions per day, peak people at once, matches finished, and time played by people versus bots only.

### Weapons (shared core)

- **Weapon definitions are data.** The stats file gains a `weapons` table keyed by weapon id (`m4a1`, `smg`, `shotgun`, `sniper`, `pistol`). Each row holds handling (fire rate, fire mode, magazine, reload timings and kind, draw, holster, ADS, sprint-to-fire, movement speed multiplier), damage (range bands, hit-zone multipliers, pellets per shot, penetration budget multiplier), accuracy (hipfire spread, recoil pattern parameters, scope sway) and presentation hints (zoom, scope or iron sight). The M4A1's existing values move into its row unchanged, provenance and all, so its behaviour doesn't change by one tick.
- **Provenance for the new weapons.** Real-world facts (cyclic rate, magazine capacity, muzzle velocity) are sourced from public firearm references. The game numbers (damage, ranges, recoil, ADS and handling times) are `estimated`, with a method that ties each one to the time-to-kill targets below. They aren't taken from any other game's weapon tables. Display names avoid manufacturer trademarks.
- **Time-to-kill targets** against 100 HP with torso hits, which the balance tests check:

  | Weapon | Close | Medium | Long |
  | --- | --- | --- | --- |
  | M4A1 (unchanged) | 4 shots | 5 shots | 6 shots |
  | SMG | about 170 ms within 12 m | about 330 ms by 25 m | worse than the M4A1 past 25 m |
  | Shotgun | one shot within 5 m | two shots within 12 m | no reliable kill past 18 m |
  | Sniper | one shot, head, neck or upper torso, at any range | | lower torso and limbs: two shots |
  | Pistol | about 450 ms within 10 m | | |

- **Weapon state per carried weapon.** A player carries a loadout: two weapon slots and a grenade count. Each slot keeps its own weapon state (ammunition, action, recoil index). The weapon state machine gains a `holster` action, per-weapon timings, and new reload kinds: shell-by-shell (the shotgun, cancellable by firing) and bolt or pump cycling between shots (the shotgun and the sniper). The pistol is semi-automatic, with a cap on its fire rate.
- **Usercmd additions:** a `SwitchWeapon` button (the press toggles slots), a `Grenade` button (held to cook, released to throw) and a `Use` button (held for plant and defuse). Mouse wheel and the number keys map to switching on the client.
- **Pellets.** The shotgun fires several pellets per shot as separate projectiles, in a seeded pattern, each with its own damage falloff. Pellet hits on one player in one shot merge into a single damage event and a single hit marker.
- **The sniper scope** is presentation (a scope overlay and higher magnification) plus a core rule: scoped spread includes a sway that settles over about 1.5 s while the player stands still. Sway is deterministic, driven by the weapon clock.
- **Scope glint** is a presentation effect, shown to others when a sniper is aimed down sights and the viewer is more than 20 m away inside the scope's view cone.
- **Player outputs** gain the current weapon id and grenade count, so that clients and bots see what everyone carries.
- **Kill events** gain the weapon id, or `frag` for a grenade.

### Grenades (shared core)

- **A grenade is a simulated physics object** in the core, stepped at 60 Hz alongside projectiles: gravity, bounces off any solid that blocks bullets or players, energy lost on each bounce, rolling friction, and rest. It's deterministic and lives in the match output, so that clients draw it and late joiners see it.
- **The fuse** is 4 s from the moment cooking starts. A grenade cooked until it runs out explodes in the hand.
- **The explosion** does 150 damage at the centre, falling linearly to 0 at 7 m, so it kills within about 3 m at full health. A ray from the explosion to each hitbox part that's blocked by a bullet-blocking solid cancels that part's damage. Penetrable materials don't let the blast through.
- **One frag per life.** Friendly fire stays off for grenades as for bullets. A player's own frag damages them.
- **The thrower's identity is carried by the grenade,** so a kill after the thrower dies still counts for them.

### Loadouts (shared core, presentation package)

- **The loadout** is a small value: `{ primary, secondary, grenade }`. In this arc the secondary is always the pistol and the grenade always the frag, but the shape allows more later.
- **The join message carries the loadout,** and a new `loadout` client message changes it at any time. The server applies a change at the next spawn, and between rounds in Charge.
- **The loadout screen** is part of the UI identity Survival Town introduced. It opens from the pause menu and from the death screen, and it's stored locally like the name. Bots pick from a per-personality weighted list.

### Modes (shared core)

- **The game-mode interface grows** to cover objectives and rounds, so that Outposts and Charge implement the same interface as team deathmatch and free-for-all. The additions are:
  - mode-specific state in the snapshot: zones, the charge and the round
  - a `canRespawn` rule
  - round boundaries that reset positions and loadouts without ending the match
  - mode events for captures, plants, defuses and round outcomes
- **`ModeId`** becomes `'tdm' | 'ffa' | 'outposts' | 'charge'`. `MatchResult.reason` gains `scoreLimit`, `roundLimit` and `forfeit`.
- **Outposts** rules:
  - three zones per map, each a vertical cylinder from the map definition
  - capturing a neutral zone takes 10 s for one player, and the rate scales with the number of capturing players, up to 2× for three or more
  - flipping an enemy zone takes twice as long
  - a zone with both teams inside is contested and its progress freezes
  - each held zone scores 1 point per second
  - the first team to 200 points wins, or the leader after 10 minutes
  - kills don't score team points
  - spawns favour the team's held zones, under the existing spawn rules (never within 8 m of a living enemy if another spawn will do)
- **Charge** rules:
  - two teams, attackers and defenders, and two charge sites per map, each a box volume from the map definition
  - a round is 90 s, and the fuse is 40 s once planted
  - planting takes 4 s and defusing 6 s, and moving, firing or being damaged cancels either
  - one attacker carries the charge; it drops where the carrier dies, and any attacker can pick it up
  - attackers win a round by detonation or by eliminating every defender before a plant; defenders win by defusing, by eliminating every attacker before a plant, or when time runs out with no plant
  - the first team to 4 rounds wins, and sides swap after round 3
  - no respawns within a round; dead players spectate a living teammate
  - a round starts with a 5 s freeze in which loadouts can still change
- **Humans vs bots** is a match setting for any team mode, not a mode of its own. When it's on, every person joins team 1 and the bot team is `max(4, people + 2)`, capped so that the total stays within the lobby. A person joining mid-match adds a bot to the other side (when there's room). Bot fill's usual `perTeam` doesn't apply in that match. `MAX_BOTS_PER_TEAM` rises to 6 for this.
- **Team names and colours** stay blue and orange.

### The match vote, map switching and the lobby (shared core, server)

- **The server holds every lobby map** (Survival Town and Switchyard, not the Practice Range): solids, spawn sets, objective volumes and nav graphs, all built at startup. A match runs on one of them, and the server switches maps at `matchStart`.
- **The vote replaces the mode vote.** At the start of the intermission, the server draws three distinct map-and-mode options, at random from the pool, never repeating the current combination. Players vote for one option and, separately, on humans vs bots. A plurality wins the option, and a tie is broken at random among the tied options. Humans vs bots switches on with a strict majority of the people voting, and otherwise stays as it was. The tally is broadcast.
- **The empty-server choice** (the first person's map, mode and humans-vs-bots, plus bots per team) is honoured as today.
- **Loading the next map.** The vote phase tells clients the winning map as soon as it's decided (a few seconds before `matchStart`), so they load it in the background. A client that isn't ready at `matchStart` stays connected as a spectator and spawns when it reports ready.
- **Each map supplies its own end-of-match sequence** (Survival Town's nuke, Switchyard's freight train), driven by the same intermission timeline.
- **The lobby cap** defaults to 12 (`MAX_PLAYERS`). Bot fill's default stays at 3 a side.
- **The protocol version is bumped to 6.** It covers loadouts, weapon ids, grenades, objective state, rounds, the match vote, humans vs bots, map switching and the client's ready message. Clients on an older protocol get the existing "reload" message.
- **Status** gains the humans-vs-bots flag and reports the current map, which can now change.

### Bots (shared core)

- **The brain stays a pure function** of what a player could see (ADR 0004), extended for the new kit:
  - **Weapon choice:** engage at the current weapon's preferred range and close or open distance to it. Switch to the pistol when the primary runs dry at under 10 m with an enemy in view.
  - **Sniper behaviour:** hold long lanes from nav-graph spots tagged as long sightlines, and scope in only when stopped.
  - **Shotgun and SMG behaviour:** push toward close range along cover.
  - **Grenades:** throw at an enemy remembered behind cover within 25 m, or at a zone or site under threat, using a solved arc against the world. When a live frag within 7 m is in view, run from it to the nav node that best breaks line of sight.
  - **Outposts:** a team-level planner, held by the server per bot team, assigns bots to zones (capture the nearest neutral zone, defend a held one, contest a lost one), and the brain treats its assigned zone as its goal.
  - **Charge:** the planner picks a site for the attackers and splits defenders across both sites. The carrier moves to the site with an escort and plants when no enemy is in view. Defenders retake and defuse. Bots never defuse with a visible living enemy unless the fuse is short.
- **Personalities gain loadout weights,** so each bot name tends toward its own weapons.
- **Difficulty stays moderate,** and the existing moderate band test keeps it there for the M4A1.

### Switchyard (the app)

- **A map definition like Survival Town's:** solids (yaw-rotated where needed, ADR 0002), player clip and bullet surfaces (ADR 0001), materials and penetration (ADR 0003), FFA and team spawn sets, Outposts zones, Charge sites, indoor zones, decoration, props, reference spots, the benchmark path and the menu fly-through. The core imports nothing from it.
- **Layout:**
  - **The long lane:** open running track, with sightlines of 60–80 m.
  - **The middle lane:** rows of freight cars and flatbeds at 25–40 m. Some cars are open boxcars you can run through.
  - **The close lane:** the engine shed, the workshop and the two-storey signal box, with rooms of 5–10 m.
  - Cross-routes link the lanes every 20–30 m, so no lane is a corridor.
  - Team spawns sit at the two ends of the yard.
  - The Outposts zones go in the shed, at the middle cars and on the long lane. The Charge sites are the signal box and the fuel depot.
- **Size:** about 1.5–2× Survival Town's playable area, checked against the bot-only and spawn tests at 3v3 and 6v6.
- **Art:** buildings, freight cars, the locomotive and props are modelled in Blender, following the existing weapon pipeline. Each visual element is tied to its collision under the decoration rule (within 5 cm of its solid). Materials are code-generated node materials, as on Survival Town, so the lighting bake and the material families stay as they are.
- **Lighting:** a fixed dusk sun with a long low angle, baked like Survival Town's, plus sodium lamps baked as emissive sources.
- **The freight train** is presentation only: a moving mesh, light and sound, driven by the intermission timeline. It never touches collision.
- **The nav graph** is generated from Switchyard's collision, with hints for doors, ladders, boxcar entries and roof climbs, and it tags long-sightline nodes for snipers.

### Practice Range (the app)

- The range gains a loadout station (the loadout screen) and a 100 m sniping lane with targets at 25, 50, 75 and 100 m. The dummies report damage per hit, so every weapon's falloff can be read there.

### Presentation (presentation package)

- **Viewmodels:** each weapon is authored in Blender following the M4A1 pipeline, with its first-person animations built in the existing viewmodel system, and reviewed in the viewer before it's called done.
- **Third-person:** soldiers hold the current weapon, attached to the existing hand sockets, with the hitboxes unchanged.
- **Audio:** each weapon gets synthesised voices (fire close and distant, mechanical sounds, reloads, switching) built from the existing parts. The frag gets its own bounce, cook and explosion sounds. Charge gets plant, defuse and fuse-beep sounds. Switchyard gets its own ambience bank, and the train its approach and pass-by. Everything goes through the existing occlusion, muffling and mix.
- **HUD:** the ammo counter shows the current weapon and the grenade. The grenade indicator, objective markers, the zones strip, the round and charge state, the spectator view and the weapon icons in the kill feed all join the HUD in the existing UI identity.
- **UI:** the loadout screen, the three-option vote with the humans-vs-bots toggle, the Play Online tile's new fields, Bot Match setup with map, mode and humans-vs-bots, and an Explore Switchyard menu entry.

### Glossary and decision records

- **The glossary gains:** weapon, loadout, primary, secondary, frag, Switchyard, Outposts, zone, Charge, charge site, round, humans vs bots, and match vote (which replaces mode vote).
- **A new ADR** records why the server holds every map and switches at `matchStart`, instead of running one map per process.

### Build order

1. **Ticket zero:** the deploy fix, the image pin, the event log and the play report.
2. **Weapon definitions and loadouts in the core:** the stats table, per-slot state and switching, with the M4A1 unchanged.
3. **The SMG and the pistol:** core behaviour, models, animations and sound.
4. **The shotgun:** pellets, pump action and shell-by-shell reloads, with its model, animations and sound.
5. **The sniper:** bolt action, the scope, sway and glint, with its model, animations and sound.
6. **The frag grenade:** physics, explosion, model, sound and the HUD indicator.
7. **The loadout screen** and the range's loadout station and sniping lane.
8. **Bots with the new kit:** weapon choice, sniping, switching and grenades.
9. **Weapon balance runs** and tuning until they pass.
10. **Outposts:** core, HUD, Survival Town zones and bots.
11. **Charge:** core, HUD, Survival Town sites and bots.
12. **Humans vs bots,** the 12-player lobby and the match vote with map switching.
13. **Switchyard:** layout, collision, spawns, zones, sites and nav as plain geometry, then its tests.
14. **Switchyard art:** Blender models, materials, lighting bake, scenery and lamps.
15. **The freight train and Switchyard's audio.**
16. **The offline additions:** Bot Match on every map, mode and humans-vs-bots setting, and Explore Switchyard.
17. **The performance pass and the load test** on both maps.
18. **The release:** full browser runs, renders reviewed, a code review, the final report, the v2.0.0 tag, and the live lobby moved off its pin.

## Testing Decisions

- **What makes a good test:** it checks behaviour visible in a match's outputs, a map's data, the server's messages or the UI model. It never checks internals. Expected values come from the stats file, the mode options or the map definition, never hand-copied numbers.
- **Seam 1, the headless and networked match (fps-core), as today.** The headless match gains loadouts on `PlayerSpawn`, and the networked match gains maps, modes and the vote through `GameServer` options. Nearly every new rule is tested here. The existing test files are the prior art.
  - **Weapons:**
    - every weapon's fire rate, magazine, reload and cycling timings against its stats row
    - switching times, and no firing before the weapon is raised
    - each slot keeps its own state
    - the shotgun's pellet pattern, merged damage and cancellable reload
    - the sniper's one-shot zones and settling sway
    - the M4A1's existing tests pass unchanged
    - determinism holds with every weapon
  - **Time-to-kill tables:** a test computes each weapon's shots to kill and time to kill at fixed distances and checks them against the targets above. The table is also printed into the balance report.
  - **Grenades:** bounces off axis-aligned and yaw-rotated solids, rest, the fuse, cooking and the in-hand explosion, damage falloff, blocking by walls, no friendly damage, self damage, and a kill credited after the thrower dies.
  - **Modes:**
    - Outposts' capture rates, contesting, scoring, limits and spawns
    - Charge's plant and defuse timings and cancels, carrier drop and pick-up, every round outcome, the side swap, the match limit, no respawns and spectating
  - **Humans vs bots:** team sizes for 1 to 12 people, a mid-match join adding a bot, and a lobby that empties.
  - **The vote:** three distinct options that never repeat the current one, plurality and tie-breaking, the humans-vs-bots majority, and map switching with a client that isn't ready yet.
  - **Bots:**
    - each weapon used at its range, and a switch to the pistol when the primary is dry
    - grenade throws that land within 3 m of a reachable target, and running from a live frag
    - Outposts and Charge played to an end by bots only, with both outcomes possible
    - the moderate band test unchanged
  - **Balance runs:** bot-vs-bot duels with every pair of primaries, at 5, 15, 30 and 60 m, with seeded spawns and enough duels per cell to keep the noise down. Two rules must hold:
    - every weapon's overall win rate against each other weapon, across all distances, is between 40% and 60%
    - in its own range band, each weapon beats every other weapon more than half the time
- **Seam 2, the map tests (the app), as today for Survival Town:**
  - Switchyard's solids, boundary and decoration rule
  - the nav graph's coverage and connectivity, standable nodes and a node by every spawn
  - zones and sites reachable by both teams
  - 3-minute bot-only runs at 3v3 and 6v6 in every mode, with nobody leaving the boundary and no bot stuck for 8 s
  - Survival Town's existing tests, plus its new zones and sites
- **Seam 3, the server (the app):** status and the event log, through the existing server tests. The load test (12 players and bots on each map at 60 Hz on the home server) is the existing load-test script, extended.
- **Seam 4, the presentation package:** the UI model (the loadout screen, the vote, the HUD's new parts), audio voice definitions and the weapon asset checks, following the existing client tests (the UI model, map audio and M4A1 asset tests).
- **In the browser, with `remote-test --local`:**
  - the benchmark on Switchyard and Survival Town on every preset, within Survival Town's budgets
  - a scripted full match of every mode on both maps, plus humans vs bots, checking for errors and stalls
  - reference-spot screenshots of Switchyard
  - a short recorded gameplay video for the final report
- **Model review:** preview renders of every weapon and every Switchyard model, looked at before each is called done, and the same models checked in the game afterwards.
- **Where tests run:** Node suites run on the home server through `remote-test`. Anything that drives a browser runs locally through `remote-test --local`.

## Out of Scope

- Recreating any other game's maps, weapons, modes or tuning. Every new map, mode name and set of weapon numbers is original to Duty Shooter.
- Attachments, weapon variants and camouflages, and secondaries other than the pistol.
- Smoke grenades, flashbangs and other tactical or lethal equipment besides the frag.
- Accounts, progression, unlocks and persistent stats per player.
- Bot difficulty settings, and bots that vote.
- Invite links, parties and a Discord join webhook.
- More than one lobby at a time, and choosing the lobby size.
- Killcams and replays.
- Mobile and touch controls, and Safari.
- Destructible geometry, and any change to collision during a match (the train is presentation only).
- Dynamic time of day and weather.
- A third map, and the Practice Range in the match vote.
- Playtests during the arc. The owner's group plays at the end.

## Further Notes

- **No checkpoints.** The owner asked for this arc to run to the end without stopping. Where the earlier arcs stopped for approval (UI mockups, the look test), this arc relies on the automated checks above, preview renders, and the final report. Decisions that would normally go to the owner are recorded in the ticket that makes them.
- **Release rule.** Per AGENTS.md, every ticket is committed on main, tagged and pushed. Pushes publish images, but the pin keeps the live lobby on v1.3.9 until the release ticket.
- **The live version mismatch** (v1.3.0 live against v1.3.9 tagged) was found while planning this arc and is the first thing ticket zero looks at.
- **Prior art:** the M4A1's Blender pipeline (`tools/weapon`) is the template for every new model. The Survival Town spec's map, art, lighting and benchmark decisions apply to Switchyard unless this spec says otherwise.
