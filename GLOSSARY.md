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
The rules of a match: team deathmatch (TDM), free-for-all (FFA), Outposts or Charge.
_Avoid_: playlist, game type

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

**Intermission**:
The 20 s between `matchEnd` and the next `matchStart`: about 6 s of the map's ending (Survival Town's nuke, Switchyard's freight train), then about 14 s of scoreboard and vote. Input is frozen throughout. Online, the ending is followed by 10 s of scoreboard and then the lobby, until the host starts the next match.
_Avoid_: post-game, between rounds

**Freight train**:
Switchyard's end-of-match ending: two locos and 22 wagons that thunder west along the main line past the yard, horn sounding, through the intermission. Drawn and heard only: it touches nothing, and everyone sees it in the same place. The server's phase is still called `nuke`.
_Avoid_: the nuke (on Switchyard)

**Ending shot**:
Survival Town's ending played like a cut scene: from the match's end through the scoreboard, the camera leaves every player's eyes for one fixed move from behind the west end of town toward ground zero, so everyone watches the siren, the flash and the cloud climbing over the rooftops. The map data holds it (`nuke.shot`).
_Avoid_: kill cam, video (nothing is recorded; it is drawn live)

**Mode vote**:
The intermission vote that picks the next match's mode. The plurality wins, and a tie keeps the current mode. Only Bot Match runs it; the online server has a lobby instead.

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
Topping a match up with bots to the map's team size while anyone is playing. A person who joins takes a bot's seat, and the bots leave with the last person. The lobby's host only switches it on or off. Humans vs bots sizes the bots its own way instead.

**Team size**:
The people and bots a side a map plays at in each mode, which bot fill tops up to: Switchyard 6v6 and Survival Town 4v4 in every mode (free-for-all holds twice it). The host can set a size of their own with the lobby's hidden + and - keys; it lasts until the map or mode changes.

**Humans vs bots**:
A setting for any team mode, not a mode of its own: every person plays on Blue, against an Orange team of bots two bigger than the group (at least four, at most six, and never more than the free seats). A person joining mid-match brings another bot to Orange. Free-for-all ignores it. The host picks it in the lobby; Bot Match offers it too.
_Avoid_: co-op, PvE

**Bot Match**:
An offline match against bots on either map (Survival Town or Switchyard), in any mode, as mixed teams at the map's team size or as humans vs bots. The game server runs in the page.

**Nav graph**:
The walkable nodes and links (walk, drop, climb) that bots plan routes on. It's generated from a map's collision, with hints for tight spots.

**Spawn protection**:
The 1.5 s after a spawn when a player can't be damaged. It ends early when they fire.

**Usercmd**:
One tick of a player's input, sent from client to server.
_Avoid_: input packet

**Preset**:
A graphics quality level (Low, Normal, High) with its own performance budget.
