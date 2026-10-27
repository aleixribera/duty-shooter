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

## Maps

**Map**:
Data the app supplies to the core. It holds the solids, spawn sets, indoor zones, decoration, props, scenery, reference spots and camera paths. The core imports nothing from any map.
_Avoid_: level

**Survival Town**:
The recreation of the original 2010 Nuketown, and the public lobby's map. Never call it "Nuketown" in the product.

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
One of the three Outposts objectives on a map: a vertical cylinder that a team captures by standing in it. With both teams inside it is contested, and its progress freezes.
_Avoid_: point, flag, objective (on its own)

**Charge**:
The round-based team mode. The attackers carry a charge to one of the map's two charge sites and plant it there; the defenders stop them or defuse it. Nobody respawns within a round. The first team to win 4 rounds wins, and the sides swap after round 3.
_Avoid_: bomb, search and destroy, demolition

**Charge site**:
One of the two places on a map where the attackers can plant the charge: a box volume from the map definition. On Survival Town both are at the south house, the defenders' end.
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
The 20 s between `matchEnd` and the next `matchStart`: about 6 s of nuke, then about 14 s of scoreboard and vote. Input is frozen throughout.
_Avoid_: post-game, between rounds

**Mode vote**:
The intermission vote that picks the next match's mode. The plurality wins, and a tie keeps the current mode.

**Headless match**:
The real simulation run in-process with no rendering. It's the main seam for automated tests, and the networked variant adds the server, clients and a simulated network.

**Bot**:
A computer-controlled player: a seat on the game server with no connection, which plays by the same rules as people. Shown with a BOT tag.
_Avoid_: AI player, NPC

**Bot fill**:
Topping a match up with bots to a number a side while anyone is playing. A person who joins takes a bot's seat, and the bots leave with the last person.

**Bot Match**:
An offline match against bots on Survival Town. The game server runs in the page.

**Nav graph**:
The walkable nodes and links (walk, drop, climb) that bots plan routes on. It's generated from a map's collision, with hints for tight spots.

**Spawn protection**:
The 1.5 s after a spawn when a player can't be damaged. It ends early when they fire.

**Usercmd**:
One tick of a player's input, sent from client to server.
_Avoid_: input packet

**Preset**:
A graphics quality level (Low, Normal, High) with its own performance budget.
