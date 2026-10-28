# Crash map

Status: claimed

Recreate the Call of Duty 4 map Crash in Blender and add it as a playable game map. Include the downed helicopter, multistorey buildings, routes, match spawns, objectives and bot navigation.

## Comments

Using the original's central wreck, three-storey building, blue building and market as landmarks. Geometry and navigation will be authored for this game's movement and modes.

The first layout is a developer-only blockout. A rendered view shows it lacks the original map’s architectural detail and a convincing wreck; it must not be exposed as a match map until it has been refined and checked in play. `?explore=crash` is available for iteration. The home server was reachable, but the configured `remote-test` command was absent; an isolated Node 24 container there ran the initial map checks instead.

Reference review: the original CoD4 overhead (https://u4ealounge.com/cod4-map-overview/) places blue building west of the wreck, the main building immediately east, the tower northwest, arcade south and shop/back street southeast. The initial blockout has the blue building on the wrong side and lacks the arcade, main building, slope and back street; rework its footprint against this reference before release. The generated Blender scene is a collision-layout reference, not yet the finished art.

Validation of the blockout: production build and Crash lighting bake succeeded on the home server; the full suite passed 860 tests with one headless check failing on a helper name. Renamed the helper and reran that check and the Crash tests successfully. Upper-floor graph coverage and a 4v4 TDM bot soak pass, but visual fidelity, other modes and actual player routes remain to be verified.

The blockout now follows the overhead’s landmark order: blue building west, main building east, tower northwest, arcade south, shop southeast, with the wreck turned along the north–south axis. A real player movement test exposed a blocked upper stair landing; moving the landing aside made the complete tower climb pass. The rebuilt Blender scene matches the game placement. The overview is still a coarse blockout: replace generic box architecture, correct finer original routes and build a convincing damaged Sea Knight before making it a lobby map.

The wreck now has a separated hollow tail, rear rotor pylon, bent blades, cockpit glazing and weathered panel details. Blender export reports a maximum 1.5 cm mesh-to-collision deviation; a game-level GLB test independently checks the placed mesh and materials. The asset is still a simplified, clean model: damage, weathering, rubble and environmental detail remain before the map can be released.

Added Blender masonry piles and an abandoned car around the crash site, with matching game collision. The Blender layout generator now instantiates repeated assets instead of moving a single shared object; the saved scene was checked for all six piles and the car. The in-game view still shows generic flat façades and incomplete street dressing, so the map remains developer-only.

Added framed openings, shutters and parapets, plus walkable tower, blue-building and shop roofs. A player route reaches the tower roof and the generated navigation graph reaches all three roofs; an initial landing overlap was corrected. The full Blender scene now includes 357 trim pieces. The in-game view still shows simplified walls and straight exterior stair flights; distinctive original interiors, arches, signs, street dressing and finer route geometry remain.

The arcade has a covered columned walkway with four broad entries; a player traversal test crosses it. The main building now has upper and lower windows toward the wreck, and a ray check confirms the upper sightline. The rendered arcade is structurally readable but still needs period detail and furnishings.

Replaced the tower’s placeholder exterior ramps with a three-storey interior switchback stairwell and a cut-out roof access. A player now walks from the exterior entrance to the roof in a movement test; precise entrance/stair hints connect the tower floors to the bot graph. The Blender scene was rebuilt. The interior remains sparsely dressed, and the rest of the map still needs its original routes, detailed art and full mode verification.
