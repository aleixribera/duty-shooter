# 14 Switchyard art

Status: resolved
Release: v1.9.0
Blocked by: 13

Blender models (buildings, freight cars, locomotive, props), decoration rule, materials, dusk lighting bake, sodium lamps, scenery beyond the boundary.

## Comments

- Dusk lighting, per map:
  - `Lighting` (sun direction, colour and strength, sky, ground light) is now a map value: `MapDefinition.lighting`. Survival Town and the range keep the afternoon (`LIGHTING`); Switchyard has `DUSK`, a sun 12 degrees up in the south-west, orange, with a deep blue sky going orange at the horizon.
  - The bake takes the map's lighting (`BakeInput.lighting`). The renderer reads the sun and sky from uniforms that `WorldView` sets from its content (`useLighting`), so every material, the sky, the haze, the mountains, the nuke cloud and the viewmodel's sun check follow the map.
  - Why uniforms, not a lighting object passed everywhere: the materials are built once per finish and the menu switches maps by building a new `WorldView`; one set of uniforms keeps every existing material call as it was.
- Sodium lamps, baked:
  - `MapDefinition.lamps`: point lights the bake adds to the lightmap's light (direct, with a shadow ray, fading with distance squared to nothing at their range) and to the probes, so they bounce and light the soldiers too.
  - 15 on Switchyard: posts along the main line's barrier, the alley between the rows and the service road; wall lamps on the signal box and the back wall; hanging lamps in the shed and the workshop.
  - Their glass is a new finish family, `lamp`: it glows (HDR, so the bloom catches it) whatever light falls on it.
  - Not done: the lamps "coming on" as an animation. Their light is baked, so it can't change during a match; they are simply on at dusk.
- Blender models (`tools/map/switchyard.py`, source `tools/map/switchyard.blend`, export `apps/range/public/models/switchyard.glb`, 15k triangles, 685 kB):
  - `frame-12` and `frame-9`: freight car underframes with sills, couplers, brake gear and two bogies with wheels on the rails.
  - `tank-car`: the tank car's round barrel with bands, saddles and placards.
  - `depot-tank`: the fuel depot's tanks.
  - `loco`: the shunter in the shed (frame and bogies, the hood with grilles and fans, the cab with windows).
  - `lamp-head`: the sodium lamps' cobra heads.
- How a model is tied to collision (a map model, now in the glossary):
  - `Builder.model(asset, position, yaw, fn)` places an asset and ties it to the solids added in `fn`. Those solids still collide and still cast shadows in the bake, but get no faces (`SurfaceSpec.modelled`), so the model draws them.
  - The decoration rule holds for models: every vertex of every placed model lies within 5 cm of its solids. The Blender script reports strays as it builds, and `switchyard-models.test.ts` checks every placement from the GLB itself.
  - The client loads the file (`loadMapModels`), one instanced mesh per asset part, so 11 underframes cost a couple of draw calls. Each part's material is named after a map finish, and the parts are lit like the moving things: probes plus the realtime sun shadow.
  - Collision changed only where a model needed it: each car's underframe is now a frame solid (0.3 to 1.0 m) under a drawn deck plate (1.0 to 1.1 m), and the loco's frame likewise. Same outer boxes, so movement, nav and bullets are as before.
- Buildings stay code-built: walls with openings, as Survival Town's are. They are the collision, and their brick, timber and plaster finishes take the bake like Survival Town's. The spec's "buildings in Blender" is read as "everything that isn't a plain wall": cars, tanks, the loco and the lamps.
- Scenery: the main line's two tracks and telegraph poles run out past both ends, the mountains ring the plain, and a town stands out on the plain north of the main line (`horizon.town`, `distantTown`): dark blocks, a water tower and works chimneys, about a quarter of the windows lit.
- Lobby picture: `apps/range/public/maps/switchyard.jpg` (between the cars), made by the new `apps/range/scripts/map-picture.mjs`, and listed in `MAP_IMAGES`.
- The bake list (`vite.config.ts`) includes Switchyard: 1.55 M texels, about 20 s on this PC, 1.3 MB.
- `?map=<id>` (any map) starts the page on that map, for spot screenshots: `node apps/range/scripts/spots.mjs switchyard`.
- A bot fix found by the bot runs after this change: facing a climb, a bot now looks at the ledge it is climbing (`Bot.#lookAhead`). It used to look further down the route, and at the roof climb whose high crate stands west of the low one, that aimed its mantle off the low crate. It then hopped at the crate for 12 s in 3v3 free-for-all. The new lamp posts had changed the bots' routes enough to send one that way.
- A second bot fix, found by the next full run: a bot escorting in 3v3 Charge looped in a boxcar doorway for 9 s. Its goal moved, so it replanned every second from the nearest node, which was the one it had just left inside the car, and it turned back to it each time. Now a bot out of a fight that is replanned partway along its route's first leg carries on along that leg (`onLeg` in `Bot.#plan`). A fighting bot keeps the old rule, since it strafes off its route. Applied to fights too, the change cost the sniper a point of its duels (39 %, under the 40 % floor), because chasers closed faster. Sway, ADS time, move speed, back-off and juke each left it at 39 %. `docs/balance.md` is rerun: sniper 40 %, shotgun 43 %, SMG 58 %, M4A1 59 %.
