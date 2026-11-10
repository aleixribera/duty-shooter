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
A Region's dense, fully detailed place, a disc of 6,000 to 10,000 m². Every Core is built now, by its Region kit: Ground Zero's, the Dustlands' (the mining camp round the crashed cargo jet, ticket 18), Rogue Harbor's (the container port, its quay, cranes and moored cargo ship, ticket 19), Neon City's (the crossroads under the elevated highway, its walk-ups and arcades, the towers' shells, ticket 20), Frostbite Peaks' (the radar base on the plateau under the summit: the radome, the dish, the watchtower and the stopped cableway, ticket 21) and Mutant Jungle's (the clearing round the giant glowing tree: the temple's ruins, two gateways, a colonnade, crystal outcrops and a camp on stilts by the stream's spring, ticket 22).

**Region kit**:
A Region's own models (`models/<region>.glb`, built by `tools/map/regions/<region>.py`): its Built pieces, and unit models that dress the cover pass's pieces in the Region (walls, sheds, wrecks), all drawn instanced like Plants. Ground Zero's is the first (ticket 17); the steps every Region follows are in `zero-island-region.ts`.
_Avoid_: asset pack, prefab

**Built piece**:
One building or landmark of a Region kit (the reactor, a bunker, a ruin, the factory, the station), planned as tagged boxes its model is built inside, and colliding as Fitted solids. It stands on a Pad.
_Avoid_: prefab, structure

**Pad**:
A rectangle of ground the Terrain levels for Built pieces to stand on, eased back into the ground round it, optionally wearing scorched concrete.
_Avoid_: foundation, plot

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

**Plant**:
A rock, tree, bush, fern or clump of grass from the plant kit (`tools/map/vegetation.py`, ticket 29), drawn instanced by kind: the full model near, a cheaper one out to its far distance (farther through a scope), nothing past it. A rock or a trunk is hard cover, its solid a Fitted solid; foliage is Soft cover. Each Region's rocks are its own (ticket 78): weathered granite boulders (mossy in the Mutant Jungle, snow-capped in Frostbite Peaks), sandstone ledges in the Dustlands, and broken concrete rubble with rebar in Ground Zero's crater.
_Avoid_: foliage (only the soft part), decoration

**Fitted solid**:
The boxes a kit model or a Built piece collides as, fitted inside its Blender mesh by `tools/map/fit-solids.mjs` (ticket 63) and scaled and turned with each instance: no point of them stands more than 5 cm out of the model at the largest it is placed, so what stops a body, a bullet, a grenade or a bot's sight is what's drawn. A ledge's boxes fill nearly all of it; a granite boulder's or a rubble block's 80 to 90%, a boulder's rounded corners and top and a block's broken top left over (a 5 m boulder's skin stands a median 13 cm off its boxes); a round trunk's, most.
_Avoid_: hitbox (that's a player's), collider

**Leaf card**:
A flat quad (or octagon, or tapering strip) of a Plant's foliage that shows one cell of the foliage atlas (`textures/foliage.webp`, cut from CC0 photo scans by `tools/textures/foliage.py`) and is cut to the leaves' outline by an alpha test. Crowns, bushes, ferns and grass are built from many of them (ticket 62), lit as the mass they make rather than as flat cards, so either side of a card shades the same. Bark and rock sit on the atlas's white cell and are not leaf cards.
_Avoid_: billboard (that turns to face the camera; a leaf card doesn't), sprite, impostor

**Ground layer**:
One of the thirteen photo surfaces a terrain wears (meadow, beach, dust, rock, snow, ice, jungle floor, ash, asphalt, dock, ballast, river bed, cliff), picked per terrain cell and tinted to its Region's palette; steep ground shows cliff rock whatever its layer.
_Avoid_: ground texture, splat

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
The offline range map: firing lanes, dummies, the sniping lane, the loadout station and the movement course with its timed Course.
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
One gun with its row in the stats file: the M4A1, the Wasp 9 SMG, the Harrow 12 shotgun, the Ridgeline .308 sniper rifle, the Bulwark 5.56 light machine gun, the Vantage 7.62 marksman rifle, the Trident 5.56 burst rifle, the Warden 9 pistol or the Marshal .357 revolver.
_Avoid_: gun (fine in player-facing text), item

**Loadout**:
What a player carries into a life: a primary, a secondary and a grenade (or none). A change applies at the next spawn; offline, at once.
_Avoid_: class, kit

**Primary**:
The loadout's main weapon, in slot 1: the M4A1, the SMG, the shotgun, the sniper rifle, the light machine gun, the marksman rifle or the burst rifle.

**Secondary**:
The loadout's sidearm, in slot 2: the pistol or the revolver.

**Burst**:
The Trident's three rounds on one press of the trigger. A burst once started finishes though the trigger is let go; the next can't start until the delay after its last round has passed, and a held trigger starts it then. A reload, a sprint, a ladder or a switch of weapon ends a burst short.
_Avoid_: volley, salvo

**Frag**:
The fragmentation grenade: cooked by holding the grenade button, thrown on release, one a life.
_Avoid_: nade (fine in player-facing text)

**Tracer**:
The short bright streak drawn along a bullet's flight, for every shot by anyone: it leaves the muzzle as drawn, joins the path the simulation flies from the eye within 20 m, and ends where that bullet struck. Client-side only; the server sends nothing extra for it.
_Avoid_: bullet trail, projectile (the simulation's bullet is not a rendered object)

**Smoke trail**:
The thin grey trail a sniper round leaves behind its Tracer, which drifts with the wind and fades in about a second and a half.
_Avoid_: contrail, vapour trail

**Supply Drop**:
A crate that parachutes into a Battle Royale at the start of Stages 2, 3 and 4, landing inside the next Ring circle. It is announced 20 s ahead (grid cell on the HUD, a square on the Island map and the compass) and burns a red flare column from then until a few seconds after it is opened with a 2 s hold. It holds the only Ridgeline .308 in the match, with 3 spare magazines: the one weapon with a limited reserve.
_Avoid_: airdrop, care package, loot crate

**Loose weapon**:
A primary lying on the ground in a Battle Royale: the one you dropped when a Supply Drop's sniper replaced it, or a sniper left where its holder fell. Walking onto it and pressing F swaps it for your primary.
_Avoid_: pickup, loot

**Reboot Card**:
What a seat leaves where it goes out in a Duos or Trios Battle Royale while a squadmate still stands. It lies for 90 s; a standing squadmate takes it by walking over it, and carries it until they reach a Reboot Beacon or go out themselves (then it drops where they fell, for another 90 s). It is void once no squadmate stands, and none drop or count once the last two Stages begin. A Squad holding or leaving a Card is still in the match.
_Avoid_: banner, dog tag, respawn token

**Reboot Beacon**:
One of the 15 Blender beacons spread over Zero Island. Holding F at one for 10 s with Cards brings their seats back around it with their loadout, 50 HP and 1 frag; anyone may see the column of light and break it off by downing the carrier. A Beacon then rests for 120 s (its light turns red). Dark once the last two Stages begin.
_Avoid_: respawn tower, revive station

**Grenade indicator**:
The HUD's mark for a live grenade within 10 m of you (`warningRadius`): a plate on a ring round the crosshair, on the side the grenade lies. It fills in where the blast would take all the health you have and blinks through the fuse's last second. Teammates' grenades are not marked where sides are played; your own is, except while it flies away from you.
_Avoid_: grenade warning arrow, danger marker

## Movement

**Sprint**:
The one fast run, only forward, standing and not aiming. By default it is a toggle: a press of Shift or L3 starts it and it keeps going until a second press, letting go of forward, a shot or the sights going up. Settings can make it a hold instead: the run lasts while the button is down. It has no stamina and no faster tier. Crouching during it is a slide, and the sprint carries on through the slide.
_Avoid_: tactical sprint, super sprint (gone), run (the walk speed)

**Slide**:
Crouching out of a Sprint: the body goes down and along the ground the way it was running, slowing all the way, for 0.9 s. After its first 0.15 s, letting go of crouch or jumping ends it. A landing taken crouched at a run is a slide too.
_Avoid_: dive, dolphin dive (there is none)

**Kick**:
What a Slide out of a Sprint of 0.6 s or more starts with: 15 % more speed than the Sprint. It is the only speed above a Sprint in the game, and it is kept until the feet give it back: a jump out of the Slide carries it through the air. A Slide begun any other way (a Sprint just started, a landing) has none.
_Avoid_: slide boost, slide cancel speed

**Course**:
The Practice Range's timed run: from the start pad at the foot of the stairs, up to the deck, over both gaps, and up the climbs to the top of the 10 m tower. The clock starts as you leave the pad up the stairs (a run from behind the pad is a flying start), stops on the tower's top, and is off if you step back on the pad or die. A run earns Gold, Silver or Bronze against fixed times, and the best time is kept in the Profile. It runs only while no match is on.
_Avoid_: obstacle course, parkour run, time trial

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
The mark over each teammate, or Squadmate in a Battle Royale: their name with a chevron up to 40 m in sight, the chevron alone further off or behind walls, held to the screen's edge under their name when they're off it. A Downed ally's tag is a red cross with how far, or Revive once in reach. Enemies never get one.
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
The closing circle of a Battle Royale. Outside it health falls and doesn't regenerate. Its circles nest and close on land, and they all come from the match's seed. The last one is the exception: it moves off as it closes, so the final fight can't hold one spot. While you're inside the Ring but outside the next circle, the HUD shows which way the next circle is and how far.
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

**Squad wiped**:
The feed's line when nobody of a Squad is left standing in Duos or Trios: who they were, who put out the last of them, and how many Squads are left. In Solos the kill feed already says it.

**Kill Leader**:
The seat with the most eliminations in a Battle Royale, once they have at least 3. Everyone sees them under the Ring's line, and the feed calls it each time someone passes them. A tie keeps the one who got there first.

**Champion Squad**:
The Squad a Battle Royale's dive introduces: the one holding any of the last match's winners, or else the last match's Kill Leader. With neither back, there is none.

**Death recap**:
What a Battle Royale shows you once you are Downed or out: who did it, with what and from how far, the damage each of you dealt the other this match, and their health then. The island map marks where they stood. Out of the fight it leads the spectator's panel for 20 s.

**Match card**:
Your own Battle Royale on one card at its end, after the victory beat and before the Battle Royale screen: place, eliminations, Downs, Revives, Reboots, damage, time alive, and your route across the island with your fights and where you fell. Built in the page from the match's events and gone at the next match.

**Victory beat**:
The 3 seconds between a Battle Royale's result and its nuke: the winners see "Victory, 1st", everyone else sees who won, each from where they stood. The nuke's phase is that much longer.

**Early end**:
A Battle Royale ending at once because no person is left alive, whatever the bots are doing. A person Downed is still alive. People are placed by how many Squads remained.

**Downed**:
A seat in Duos or Trios at 0 health with someone on its feet in its Squad: on the ground, crawling, no firing, no frags, no regen, with a health pool of its own as large as full health. For its first second (the Grace) nothing damages it. It stays in the match but no longer counts as standing.

**Bleed-out**:
The 30 s a Downed seat has before it dies. The Ring neither pauses nor speeds it.

**Rally**:
The place a bot in a Battle Royale is headed or holding: inside the circle that matters next. Each bot picks its own; it takes up the newest Heading a squadmate gave when that one is still good, so a Squad keeps together because that is the sensible thing, not because anyone leads.

**Heading**:
Where a bot has told its Squad it is going, the bots' "going here" ping. Squadmates read the newest and mostly follow it; none of them has to.

**Ping**:
A mark a player puts down for their side with one key (middle mouse, the pad's d-pad up): a tap marks what the crosshair is on (an enemy, a Supply Drop, their side's Reboot Card, a Reboot Beacon, else the ground as "Going here"); a hold opens the **ping wheel** (Enemy, Going here, Defend here, Need help). Only that side sees it, as a marker on the view, on the compass and on the Island map, with a sound and a feed line. An enemy ping stays 6 s where they stood and never follows them; a place stands 20 s, one per player. Three at once, then one per 1.5 s. Bot squadmates hear it into their Squad intel and each decides whether to answer, and a bot with a person in its Squad pings the enemies it sees.
_Avoid_: marker, spot, callout (a callout is what a bot tells its Squad intel)

**Squad intel**:
What one Squad of bots knows together: every enemy a squadmate saw or heard (a **callout**, with where and when), when the Squad last had a brush with an enemy, who has said it will Revive whom, and each squadmate's Heading. Only what a squadmate could have seen, heard or felt goes in, never a true position.
_Avoid_: shared memory, wallhack

**Noise grid**:
The island's gunfire and deaths by 25 m cell, fading over about half a minute: the fights going on, as a listener could place them. A bot reads only the cells within earshot (400 m) of where it stands, and a bold, healthy one may go hunting the loudest.
_Avoid_: heat map, threat map

**Spotting**:
A bot noticing someone over a moment rather than on the frame they come into view: faster up close, for someone moving or firing, and slower far off, for someone crouched or still. At range it looks only within a box of the island ahead, as a person would, not its whole field of view.

**Soft cover**:
What hides a body without stopping a bullet: bushes, tall grass, a tree's canopy. Bots ask it through a world's `concealment` before they believe their eyes, and bullets never do. A look is hidden once it has passed through 0.8 m of foliage, added up along it, so one thin edge of a bush doesn't hide and its middle does; a bot inside a bush still sees out.
_Avoid_: concealment (that's only its name in the code)

**Revive**:
Holding Use for 5 s within reach of a Downed squadmate, which puts it back on its feet at half health. Moving away or taking damage cancels it.

**Finish**:
An enemy killing a Downed seat by taking its Downed pool to 0.

**Grace**:
The 1 s after a seat goes Downed in which nothing damages it, so the burst that Downed it can't also Finish it. Its own screen reads "Protected"; a shooter's hits on it show a small grey marker, no blood and no sound.
_Avoid_: invulnerability, i-frames

**Gun game**:
The free-for-all mode played on a ladder of weapons: seven different guns drawn at random from the nine of the arsenal, in a random order, dealt afresh at each match's start (`GUN_GAME_LADDER_LENGTH`), one level each. Everyone starts on the first gun, in both slots and with no grenade, whatever their loadout; every 3 kills (`GUN_GAME_KILLS_PER_GUN`) move the killer up a level and put the next gun in their hands where they stand, 21 kills in all. A melee kill also knocks the victim back 3 kills. The first to finish the last gun wins; at the time limit the most kills up the ladder win. The kills a gun go down as the arsenal grows, so a match stays about as long.
_Avoid_: arms race, ladder (on its own)

**Level**:
A player's gun on the gun game ladder, from 1 to 7, shown as gun 3/7 on the match bar (with the kills still to make on it) and in the scoreboard's Gun column.
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

**Last minute**:
A timed match's final 60 s, played as an act of its own: the match clock reads T-minus over a burning fuse, the siren and the counter start, Range Control calls sixty, thirty and ten and counts the last five seconds out, and the picture moves to a warning lamp's light. It runs out on the map's ending. A Charge round's clock is not one, and Battle Royale has none.
_Avoid_: overtime, sudden death (nothing about the rules changes), countdown (that is the match's opening)

**Range Control**:
The announcer: the voice on the site's loudspeakers. It opens a match by its mode ("The range is hot"), calls the lead as it changes hands, gives each side its job in a Charge round and says when the charge is planted or defused, counts the last minute down, closes a match stopped early ("Cease fire"), and in a Battle Royale calls the Ring, a Supply Drop and how many are left. Its lines are recorded (one voice, through a loudspeaker), written in one table (`voice-lines.ts`) and shown as captions; it speaks one line at a time with one waiting, and only the last five seconds cut in.
_Avoid_: commentator, narrator, operator

**Preparation**:
A Battle Royale's Countdown: 20 s (`PREPARATION`) over the live scene, with the island from above while the Ring ignites, then your Squad at its spawn beside the loadout picker, then the dive to your eyes in the last 5 s, when the loadout locks and control is yours at 0. It ends early, with the dive, once every person has pressed Ready. A page still loading at the dive holds it (the load gate) for up to 10 s, then a bot plays that seat until the page has loaded. A person who leaves on purpose before the dive has their seat held (a bot plays it) until the dive begins, and takes it back if they rejoin before then; nobody left in it doesn't end it early.
_Avoid_: pre-game lobby, loadout screen, warm-up

**Load gate**:
The Preparation's hold for a page that hasn't yet said it has the match on screen (`loaded`). A page that never loads doesn't hold the match: after 10 s a stand-in bot plays that seat until it loads.
_Avoid_: loading screen

**Intermission**:
The 20 s between `matchEnd` and the next `matchStart`: about 6 s of the map's ending (the nuke on Survival Town and on Zero Island, Switchyard's freight train), then about 14 s of scoreboard and vote. Input is frozen throughout. Online and in Bot Match, the ending is followed by 10 s of scoreboard and then the lobby, until the host (in Bot Match, you) starts the next match.
_Avoid_: post-game, between rounds

**Freight train**:
Switchyard's end-of-match ending: two locos and 22 wagons that thunder west along the main line past the yard, horn sounding, through the intermission. Drawn and heard only: it touches nothing, and everyone sees it in the same place. The server's phase is still called `nuke`.
_Avoid_: the nuke (on Switchyard)

**Ending shot**:
A map's ending played like a cut scene: from the match's end through the scoreboard, the camera leaves every player's eyes for one fixed move, so everyone watches it however they stood (input is frozen, so nobody could turn to it). On Survival Town it moves from behind the west end of town toward ground zero, for the siren, the flash and the cloud climbing over the rooftops; on Zero Island it looks across the Dustlands at the crater, where every Battle Royale ends in the nuke at Ground Zero, then pulls back clear of the surge as the cloud climbs; on Switchyard it looks from the long lane over the barrier up the main line and swings west with the Freight train as it roars past. The map data holds it (`nuke.shot`, `train.shot`).
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

**Region hub**:
The cluster of a large map's Nav graph that stands for a Region when routes between Regions are worked out ahead of time: the one nearest the Region's Core that the rest of the map both reaches and is reached from, so never a crate top nobody climbs (ticket 20).

**Way out**:
A nav node a route can start from but never go to: in the shallows near the land, or on ground a body can fall onto but not walk back from. Its links lead back to the land. A bot stranded below a sea cliff starts its route from one (ticket 75, ADR 0008).

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
The recoil and flinch the simulation keeps on top of a usercmd's view angles. Part of it comes back by itself (the **recoil return**); what a player pulls the mouse against never does, so the usercmd pitch can go far past straight down while the view (usercmd pitch plus offset) stays inside ±85°.
_Avoid_: punch

**Recoil return**:
The share of each kick, and all of a flinch, that eases back out of the view once the weapon in hand has been quiet for its delay. A player's own pull against the kick pays it off first, so what a hand has already brought down doesn't come down twice. Tuned per weapon in the stats file (`recoilReturn`, `recoilReturnDelay`, `recoilReturnTime`).
_Avoid_: recoil recovery, recentring, punch

**Slow tick**:
A server tick of 8 ms or more (`SLOW_TICK_MS`), which the server logs with what it did and a cause: the game's own work in one phase, a garbage collection, or a stall.

**Stall**:
A slow tick whose thread spent most of it off the CPU: the machine (a CPU cap, another process) held it up, whatever the game was doing.
_Avoid_: lag spike

## Score and Profile

**Score**:
What a seat has earned in a match, in points, kept by the server for people and bots alike from one points table (`STATS.score`): a kill is 100, and a headshot, an Assist, a Medal or the objective add to it. The scoreboard sorts by it and the MVP is its highest, but it never decides a match: each Mode still wins on its own counters.
_Avoid_: points (the unit, not the total), XP (what a Profile keeps)

**Assist**:
Score for having dealt 30 damage or more, in the 8 s before, to an enemy another seat then killed or Downed. Counted on the scoreboard beside kills and deaths.

**Medal**:
A line of Score with a name worth calling out: long shot, revenge, first blood, double kill, triple kill, multi kill, and the streaks at 3, 5, 7 and 10 kills without dying. The crosshair stack names it larger than the other lines, and a scoreboard row keeps the best one its seat earned in the match.
_Avoid_: badge, award, accolade

**Profile**:
What one browser remembers of its player, in local storage: XP and Rank, lifetime numbers, each weapon's kills and Mastery, and today's Challenges. Only a match played to its end is banked in it (online, a Bot Match, a Battle Royale once your Squad has its place); the Practice Range and walking a map alone bank nothing. It belongs to the browser, not to a name or an account.
_Avoid_: account, save, career

**XP**:
What a Profile gains from a match: the match's Score, a quarter more for a win, and what a completed Challenge pays.
_Avoid_: experience points, score (a match's own)

**Rank**:
Where a Profile's XP stands, 1 to 50, each band of five Ranks under one title (Observer to Test Director). Shown under the name on the main menu.
_Avoid_: level (a gun game step, or a Mastery step)

**Mastery**:
A weapon's standing in a Profile, 0 to 5, by the kills made with it: 25, 75, 150, 300 and 500.
_Avoid_: weapon level, weapon rank

**Challenge**:
One of three tasks a Profile is given each day, the same three for everyone on that date, each paying XP once when done. They change at the browser's midnight.
_Avoid_: mission, quest, contract

**MVP**:
The seat with the highest Score when a match ends, person or bot, named on the match's end with their Score, kills and best Medal. A match where nobody scored has none.
_Avoid_: best player, top fragger
