# Glossary

The words this project uses for its domain. Use these terms in code, issues, tests and docs, and avoid the listed synonyms.

## World and collision

**Solid**:
One piece of world collision: an axis-aligned box, or a box rotated around the vertical axis. Bullet surfaces may have any rotation. Each solid has a material, and declares whether it blocks players, bullets or both.
_Avoid_: brush, collider, box (except for a plain axis-aligned solid)

**Material**:
The surface type of a solid (wood, brick, sheet metal, …). It decides impacts, footsteps and penetration.
_Avoid_: surface type, physmat

**Player clip**:
A solid that blocks players but never bullets. Examples: the boundary wall, and the hidden steps under sloped roofs.
_Avoid_: invisible wall (for the concept in general), clip brush

**Bullet surface**:
A solid that blocks bullets but never players. Examples: a sloped roof's visible face, and the near scenery.
_Avoid_: hitscan collider

**Boundary**:
The player clip around a map's playable area, reaching into the sky.
_Avoid_: out-of-bounds, kill zone (there is none)

**Terrain**:
A map's ground as a heightfield, colliding beside its solids: a grid of corner heights, two triangles a cell. Nothing goes through it, and past its rectangle there is no ground, so a Boundary closes it.
_Avoid_: floor, landscape, mesh collision

**Zero Island**:
The Battle Royale's map: about a square kilometre of land on Terrain, with a Boundary out in the shallows. Its ground is generated in code when the map is built. Played through the Battle Royale screen; walked alone with `?explore=zero-island`.

**Region**:
One of Zero Island's six areas: Ground Zero, The Dustlands, Frostbite Peaks, Mutant Jungle, Neon City and Rogue Harbor. Never "Zone", which stays with Outposts.

**Core**:
A Region's dense, fully detailed place, about the size of Crash. Grey blocks stand in for them until each gets its own ticket.

**Slope limit**:
The steepest terrain a player can walk up, 45 degrees. Past it the ground stops them like a wall, and a player on it slides down and can't jump.
_Avoid_: max incline

**Wading**:
Moving with the feet in water at least a set depth: slower, with its own footstep. There is no swimming.
_Avoid_: swimming, shallow water

**Penetration**:
A bullet carrying on through a penetrable solid with reduced damage, as set by the material's row in the stats file.
_Avoid_: wallbang (fine in player-facing text, not in code)

**Prop**:
A solid with an id that bullets can hit without losing damage, for example a mannequin head. Hitting one produces a prop event. Popped props reset at match start.
_Avoid_: breakable, destructible

**Decoration**:
Visual-only geometry tied to the solid it decorates, kept within 5 cm of that solid's surface.
_Avoid_: detail mesh

**Map model**:
A Blender model from a map's model file, drawn in place of the solids it stands for (a freight car's underframe, a tank's barrel). Those solids still collide and still cast shadows in the bake, but get no faces of their own, and every vertex of the model stays within 5 cm of them.
_Avoid_: prop (that's a shootable solid), mesh

## Maps

**Map**:
Data the app supplies to the core. It holds the solids, spawn sets, indoor zones, decoration, props, scenery, reference spots and camera paths. The core imports nothing from any map.
_Avoid_: level

**Survival Town**:
The recreation of the original 2010 Nuketown, and the public lobby's map. Never call it "Nuketown" in the product.

**Switchyard**:
The second lobby map, original to Duty Shooter: a freight rail yard at dusk with three lanes. The long lane (open running track) is in the north, the middle lane (two rows of freight cars, with an alley between) runs through the centre, and the close lane (workshop, engine shed, fuel depot) is in the south. The signal box stands between the long lane and the cars. Team 1 starts at the west end and team 2 at the east end.
_Avoid_: rail yard, train map

**Open boxcar**:
A freight car on Switchyard with a door in each side and pallet steps up to it, so players run through it between the lanes. A closed boxcar has no doors; crates beside some of them climb to the roof.

**Practice Range**:
The offline range map: firing lanes, dummies, the sniping lane, the loadout station and the movement course.
_Avoid_: the range app (that's the `apps/range` package, which hosts both maps)

**Sniping lane**:
The Practice Range's long lane: a bench and targets at 25, 50, 75 and 100 m, each on a board showing its distance.

**Loadout station**:
The rack behind the Practice Range's firing line where the Use button opens the loadout screen.

**Reference file**:
The sourced public measurements of the original map, each with a tolerance class: structural ±15 cm, other ±30 cm.

**Reference spot**:
A named camera position in a map, used for repeatable screenshots and accuracy comparisons.

**Indoor zone**:
A volume in a map that switches audio to indoor reverb.

**Distance detail**:
How a large map is drawn lighter the farther it is (ticket 10, ADR 0011): soldiers by Soldier level, the far ground merged into blocks of chunks, and the map's surfaces in 512 m blocks that keep only their big solids (6 m and up) past 400 m. Lowering it is allowed on weak machines; the seat and bot count never are.
_Avoid_: LOD (in product text)

**Soldier level**:
How much of a soldier is drawn, by its distance from the camera (divided by a scope's magnification): full (posed every frame, casting its shadow) out to 60 m, cheap animated (posed every third frame, no shadow) out to 150 m, and past that a far stand-in, a box per body piece in its stance, every far soldier of a look and stance in one instanced draw.
_Avoid_: imposter (the stand-ins are boxes, not pictures)

## Weapons

**Weapon**:
One gun with its row in the stats file: the M4A1, the Wasp 9 SMG, the Harrow 12 shotgun, the Ridgeline .308 sniper rifle or the Warden 9 pistol.
_Avoid_: gun (fine in player-facing text), item

**Loadout**:
What a player carries into a life: a primary, a secondary and a grenade (or none). A change applies at the next spawn; offline, at once.
_Avoid_: class, kit

**Primary**:
The loadout's main weapon, in slot 1: the M4A1, the SMG, the shotgun or the sniper rifle.

**Secondary**:
The loadout's sidearm, in slot 2: the pistol.

**Frag**:
The fragmentation grenade: cooked by holding the grenade button, thrown on release, one a life.
_Avoid_: nade (fine in player-facing text)

## Matches

**Mode**:
The rules of a match: team deathmatch (TDM), free-for-all (FFA), Outposts, Charge, gun game or Battle Royale.
_Avoid_: playlist, game type

**Battle Royale**:
The mode played only on Zero Island: 60 seats in Squads, one life, 3 frags, and the Ring closing until one Squad is left. It seats its own, so the server's seat and bot limits don't apply. Those who come late spectate, and a bot plays a dropped seat until its player is back. It isn't in the lobby's mode picker.
_Avoid_: BR

**Squad**:
The seats playing together in a Battle Royale: one (Solos), two (Duos) or three (Trios). Squadmates can't hurt each other, and the last Squad with anyone alive wins.

**Ally tag**:
The mark over each teammate, or Squadmate in a Battle Royale: their name with a chevron up to 40 m in sight, the chevron alone further off or behind walls, held to the screen's edge when they're off it. A Downed ally's tag is a red cross with how far, or Revive once in reach. Enemies never get one.
_Avoid_: nameplate

**Battle Royale screen**:
Where a Battle Royale is set up, reached from the main menu: where it plays (the server, or Local bots), the Squad size, your Squad's seats and the other Squads, the server's state in one line, and Start. Joining an empty server makes you the lobby's host, with the Squad size you picked. It replaces the lobby page for a Battle Royale.

**Local bots**:
A Battle Royale played on this machine alone: you and 59 bots on Zero Island, the same server code as the Battle Royale process running in a Web Worker on the page, so the bots never take the render thread's time (ADR 0010). Picked on the Battle Royale screen; you are always its lobby's host, and friends can't join it.
_Avoid_: offline Battle Royale, single player

**Battle Royale process**:
The OS process a server's Battle Royale plays in, beside the one that holds the public address and plays the team modes (ADR 0009). It starts when the Battle Royale screen first asks for it, takes its players' connections whole, and stops after 3 minutes empty; if it crashes, only its own match ends.

**Bot seat**:
A seat in a Squad with no person in it on the Battle Royale screen, drawn dashed: a bot takes it when the match starts, unless a friend joins first.

**Ring**:
The closing circle of a Battle Royale. Outside it health falls and doesn't regenerate. Its circles nest, close on land, and all come from the match's seed.
_Avoid_: zone (that's Outposts), storm

**Ring hazard colour**:
The purple-blue (`--ds-hazard`) that means the Ring and only the Ring: its crackling wall in the world, the warning while you stand outside it, the Ring on the island map, and the countdown while it closes.

**Island map**:
Zero Island drawn from above, opened and closed with the map key (M, the pad's Share): the Ring, the next circle, named places, a lettered 100 m grid, your Squad and you. It doesn't pause anything.

**Spectating**:
Watching another player once you're out, or from a late arrival: in Charge the living teammates until the next round; in a Battle Royale your standing Squadmates first, then Downed ones, then whoever put you out, then anyone left. Fire and Aim step to the next and previous (RT and LT on a pad), through your Squad first and then the rest of the match; Jump (A) changes between following behind them and **their view**, through their eyes with their weapon and crosshair. When the one watched is put out it moves on by itself and says who did it. Bots are watched like anyone. The server sends what is around the one watched, not where you fell. Esc opens the menu, where you can leave.

**Spectator panel**:
The bottom-left corner while Spectating, where your health was: who you watch (a Bot tag for a bot), where they are in the order, their health, weapon and Squad, the keys, and for a few seconds who put out the last one watched.

**Bottom bars**:
Health in the HUD's bottom-left corner and ammo in its bottom-right, each kept to its own half of a phone's screen. They show only while you're in play (alive or Downed), and nothing is drawn over them: a marker for something off-screen sits just above.

**Stage**:
One step of the Ring: it holds, then shrinks to the next circle, known throughout. Six to a match, each hurting more than the last. Their table is in the stats file.

**Early end**:
A Battle Royale ending at once because no person is left alive, whatever the bots are doing. A person Downed is still alive. People are placed by how many Squads remained.

**Downed**:
A seat in Duos or Trios at 0 health with someone on its feet in its Squad: on the ground, crawling, no firing, no frags, no regen, with a health pool of its own as large as full health. For its first second (the Grace) nothing damages it. It stays in the match but no longer counts as standing.

**Bleed-out**:
The 30 s a Downed seat has before it dies. The Ring neither pauses nor speeds it.

**Rally**:
The place a Squad of bots is headed or holding: inside the circle that matters next, near where it stands. Squadmates share one and take cover spots around it.

**Heat**:
How far ahead of its pace a Battle Royale is running, as bots feel it. With more Squads left than the stats file's curve wants, bots open fights further off and more of them go hunting; with fewer, they let distant enemies pass. It sets how a match is paced without touching the Ring.
_Avoid_: aggression (that's a bot's own)

**Soft cover**:
What hides a body without stopping a bullet: bushes, tall grass. Bots ask it through a world's `concealment` before they believe their eyes, and bullets never do.
_Avoid_: concealment (that's only its name in the code)

**Revive**:
Holding Use for 5 s within reach of a Downed squadmate, which puts it back on its feet at half health. Moving away or taking damage cancels it.

**Finish**:
An enemy killing a Downed seat by taking its Downed pool to 0.

**Grace**:
The 1 s after a seat goes Downed in which nothing damages it, so the burst that Downed it can't also Finish it. Its own screen reads "Protected"; a shooter's hits on it show a small grey marker, no blood and no sound.
_Avoid_: invulnerability, i-frames

**Gun game**:
The free-for-all mode played on a ladder of weapons: five different guns drawn at random from the whole arsenal, in a random order, dealt afresh at each match's start (`GUN_GAME_LADDER_LENGTH`), one level each. While the arsenal has five guns that is all of them, shuffled. Everyone starts on the first gun, in both slots and with no grenade, whatever their loadout; every 4 kills (`GUN_GAME_KILLS_PER_GUN`) move the killer up a level and put the next gun in their hands where they stand, 20 kills in all. A melee kill also knocks the victim back 4 kills. The first to finish the last gun wins; at the time limit the most kills up the ladder win. The kills a gun go down as the arsenal grows, so a match stays about as long.
_Avoid_: arms race, ladder (on its own)

**Level**:
A player's gun on the gun game ladder, from 1 to 5, shown as gun 3/5 on the match bar (with the kills still to make on it) and in the scoreboard's Gun column.
_Avoid_: rank, tier

**Outposts**:
The team mode where standing in the map's zones captures them, and each held zone scores its team a point a second. The first team to 200 points wins.
_Avoid_: domination, capture points

**Zone**:
One of a map's Outposts objectives: a vertical cylinder that a team captures by standing in it. With both teams inside it is contested, and its progress freezes. Switchyard has three, one on each lane. Survival Town has two, both on the street's axis: the west lawn between the garages and the street end past the bus.
_Avoid_: point, flag, objective (on its own)

**Charge**:
The round-based team mode. The attackers carry a charge to one of the map's two charge sites and plant it there; the defenders stop them or defuse it. Nobody respawns within a round. The first team to win 4 rounds wins, and the sides swap after round 3.
_Avoid_: bomb, search and destroy, demolition

**Charge site**:
One of the two places on a map where the attackers can plant the charge: a box volume from the map definition. Both are at the defenders' end. On Survival Town they are at the south house; on Switchyard they are the signal box's lever room and the fuel depot.
_Avoid_: bomb site, objective (on its own)

**Round**:
One plant-or-defend contest in Charge: a 5 s freeze, then 90 s of play, with a 40 s fuse once the charge is planted. Every player starts it alive at their side's spawns. A round is won by the detonation, a defuse, wiping out the other side, or (for the defenders) the clock running out.
_Avoid_: life, game

**Carrier**:
The attacker holding the charge. The charge drops where the carrier dies, and any attacker who walks over it picks it up.

**Freeze**:
The first 5 s of a Charge round, when everyone is held where they stand. Players can look around and change their loadout.
_Avoid_: buy time, warm-up

**Countdown**:
The 5 s every match opens with (`MATCH_COUNTDOWN`), online and in Bot Match: everyone is held at their spawn, free to look around and change their loadout, while the HUD counts down; the match clock starts after it. Charge has none, because its first round's freeze is the same thing.
_Avoid_: warm-up, pre-game

**Preparation**:
A Battle Royale's Countdown: 20 s (`PREPARATION`) over the live scene, with the island from above while the Ring ignites, then your Squad at its spawn beside the loadout picker, then the dive to your eyes in the last 5 s, when the loadout locks and control is yours at 0. It ends early, with the dive, once every person has pressed Ready. A page still loading at the dive holds it (the load gate) for up to 10 s, then a bot plays that seat until the page has loaded.
_Avoid_: pre-game lobby, loadout screen, warm-up

**Load gate**:
The Preparation's hold for a page that hasn't yet said it has the match on screen (`loaded`). A page that never loads doesn't hold the match: after 10 s a stand-in bot plays that seat until it loads.
_Avoid_: loading screen

**Intermission**:
The 20 s between `matchEnd` and the next `matchStart`: about 6 s of the map's ending (Survival Town's nuke, Switchyard's freight train), then about 14 s of scoreboard and vote. Input is frozen throughout. Online and in Bot Match, the ending is followed by 10 s of scoreboard and then the lobby, until the host (in Bot Match, you) starts the next match.
_Avoid_: post-game, between rounds

**Freight train**:
Switchyard's end-of-match ending: two locos and 22 wagons that thunder west along the main line past the yard, horn sounding, through the intermission. Drawn and heard only: it touches nothing, and everyone sees it in the same place. The server's phase is still called `nuke`.
_Avoid_: the nuke (on Switchyard)

**Ending shot**:
A map's ending played like a cut scene: from the match's end through the scoreboard, the camera leaves every player's eyes for one fixed move, so everyone watches it however they stood (input is frozen, so nobody could turn to it). On Survival Town it moves from behind the west end of town toward ground zero, for the siren, the flash and the cloud climbing over the rooftops; on Switchyard it looks from the long lane over the barrier up the main line and swings west with the Freight train as it roars past. The map data holds it (`nuke.shot`, `train.shot`).
_Avoid_: kill cam, video (nothing is recorded; it is drawn live)

**Mode vote**:
The intermission vote that picks the next match's mode. The plurality wins, and a tie keeps the current mode. Only a server without a lobby runs it (the headless tests); online and Bot Match go back to the lobby instead.

**Lobby**:
The page every online player sits on between matches: the players with their pings, the map, the host's picks and the Start button. The online server opens it for the first person in, and after every match's nuke and 10 s scoreboard everyone goes back to it. No match runs and no bots play while it is open.
_Avoid_: menu, waiting room

**Host**:
The person in the lobby who picks the next match's mode, bots, map and whether it is humans vs bots, and presses Start: the first person in, until they leave, when it passes to the next one who joined. Someone who joins while a match is under way plays in it straight away. The server holds every lobby map (Survival Town and Switchyard) and moves to the host's pick when the match starts; each page follows the pick while still in the lobby, so the map is loaded by then.
_Avoid_: owner, admin, leader

**Headless match**:
The real simulation run in-process with no rendering. It's the main seam for automated tests, and the networked variant adds the server, clients and a simulated network.

**Bot**:
A computer-controlled player: a seat on the game server with no connection, which plays by the same rules as people. Shown with a BOT tag.
_Avoid_: AI player, NPC

**Bot fill**:
Topping a match up with bots to the map's team size while anyone is playing. A person who joins takes a bot's seat, and the bots leave with the last person. The lobby's host only switches it on or off. Humans vs bots sizes the bots its own way instead, and a Battle Royale always fills to 60.

**Team size**:
The people and bots a side a map plays at in each mode, which bot fill tops up to: Switchyard 6v6 and Survival Town 4v4 in the team modes. The modes without teams (free-for-all, gun game) hold twice a size of their own, kept smaller so the map isn't crowded with enemies on every side: 8 players on Switchyard and 6 on Survival Town. The host can set a size of their own with the lobby's hidden + and - keys; it lasts until the map or mode changes.

**Humans vs bots**:
A setting for any team mode, not a mode of its own: every person plays on Blue, against an Orange team of bots two bigger than the group (at least four, at most six, and never more than the free seats). A person joining mid-match brings another bot to Orange. Free-for-all and gun game ignore it. The host picks it in the lobby; Bot Match offers it too.
_Avoid_: co-op, PvE

**Bot Match**:
An offline match against bots on either map (Survival Town or Switchyard), in any mode, as mixed teams at the map's team size or as humans vs bots. The game server runs in the page and plays a match as the online lobby does: you are the host and start it from the lobby page, and after the ending and the scoreboard you are back on that page with the last match's result, to pick again and press Start. What stays its own: it is offline, the match pauses with the game, a size of your own lasts across matches, there are no pings or invite, and Back (or Esc) on the page returns to the main menu.

**Nav graph**:
The walkable nodes and links (walk, drop, climb) that bots plan routes on. It's generated from a map's collision, with hints for tight spots. A small map's is generated when a server starts; a large map's is built ahead of time, shipped as data and searched in levels: Regions, then clusters, then nodes (ADR 0008).

**Cover spot**:
A nav node with something close enough to stand behind, and which of eight directions it hides a body from, standing or crouched. It comes from the same build as the nav, so a bot can ask for the nearest one sheltered from a threat without casting a ray.

**Danger spot**:
Where an enemy killed a bot's teammate (as roughly as a callout would put it) or the bot itself (exactly), kept in that bot's mind for 25 s and through its respawn. Bots route out of its sight, check it on the way past, and trade or watch it by how careful they are.

**Caution**:
How carefully a bot plays at a moment, from 0 to 1. It starts from the bot's style. It rises in Charge (a death is for the round), when the bot is the last of its side, hurt, or near a danger spot, and falls when its side outnumbers the other or the Charge planner says hurry. A careful bot goes quietly near known enemies, holds the angle where a target vanished, and breaks off to cover to heal.

**Spawn draw**:
How a normal map's mode picks where a player appears, so nobody keeps appearing in one spot. A team's first spawns of a match (or Charge round) come from its own spawn set in an order drawn afresh each time, so team modes keep their side but not one fixed spot. Every later spawn is drawn at random among the spawns that pass the same safety rules (no living enemy within 8 m, out of every living enemy's sight, not one of the player's last two) and score within 10 m of the safest. Battle Royale has its own drops.

**Spawn protection**:
The 1.5 s after a spawn when a player can't be damaged. It ends early when they fire.

**Usercmd**:
One tick of a player's input, sent from client to server.
_Avoid_: input packet

**Recoil offset**:
The recoil and flinch the simulation keeps on top of a usercmd's view angles; it never wears off. A player holds their aim by pulling the mouse against it, so the usercmd pitch can go far past straight down while the view (usercmd pitch plus offset) stays inside ±85°.
_Avoid_: punch, recoil recovery

**Slow tick**:
A server tick of 8 ms or more (`SLOW_TICK_MS`), which the server logs with what it did and a cause: the game's own work in one phase, a garbage collection, or a stall.

**Stall**:
A slow tick whose thread spent most of it off the CPU: the machine (a CPU cap, another process) held it up, whatever the game was doing.
_Avoid_: lag spike
