# 13 Switchyard: layout, collision, spawns, zones, sites and nav

Status: resolved
Release: v1.8.0
Blocked by: 12

Plain-geometry map definition (three lanes, cross-routes, height), materials/penetration, boundary, spawn sets, zones, sites, nav hints + long-sightline tags; map tests and bot-only runs at 3v3 and 6v6 in every mode.

## Comments

- Order: done before ticket 12, as the handoff asked. Only the lobby's map switching depends on this map, and nothing here depends on the lobby.
- `apps/range/src/map/switchyard.ts`, built with the same `Builder` as Survival Town. 'switchyard' is in `MapId`, `MAP_IDS` and the map builders.
  - Not done here: adding Switchyard to the client's `MAP_NAMES` and the lobby's map list. Both go with ticket 12 (the host's map pick) and ticket 16 (the menu), when a player can choose the map.
  - Waiting for ticket 14: the vite lighting bake list. The map has no art yet.
- Size: 108 × 56 m inside a hair-wider edge, 1.95× Survival Town's playable area (a test checks 1.5–2×).
- Edge:
  - A 1 m concrete barrier along the north, with the main line's two tracks and a row of telegraph poles beyond it. The train in ticket 15 can pass there.
  - A 3.2 m wall on the other three sides.
  - Player clip stands from the walls' inner faces outward, up to 99 m, overlapping at the corners.
- Lanes, north to south:
  - **Long lane:** two running tracks (z −23.5, −17.5) the full length, ending at buffer stops. Cover is low only: a lamp hut, relay cabinets, sleeper stacks and cable troughs. A test checks that eye height is open for more than 60 m along the six-foot and along the strip south of the tracks.
  - **Middle lane:** two rows of freight cars (z −7, +1), with an alley between and 3 m gaps between cars as cross-routes, about every 12–15 m. Row A breaks for the signal box.
    - Cars: flatbeds with crates or a container, tank cars (stepped steel), open boxcars (a 2 m door each side, pallet steps up to the 1.1 m floor), and closed boxcars. Three closed boxcars have a 1 m crate and a 2 m crate beside them, so players can climb to the 3.9 m roof.
    - The alley has crate stacks on alternate sides.
  - **Service road** (z 5–10.5), with a box truck, a forklift and pallets.
  - **Close lane:**
    - The workshop: timber, two rooms, six doors.
    - The engine shed: brick, 7 m tall. The shed road runs through it, with a locomotive inside and an inspection platform with steps.
    - The coaling stage between the workshop and the shed.
    - The fuel depot: a low front wall with a gate, two tanks on plinths, a pump house, and a loading dock with steps.
    - A back alley runs behind the buildings.
- Signal box: a brick relay room (doors north and south) under a timber lever room with windows all round.
  - Decision: no inside stairs. The nav graph links stairs only at about 0.4 m of run per 0.19 m step, with a landing halfway (as on Survival Town), and that doesn't fit inside a 7 × 5 m box.
  - Instead, each end has outside stairs: two flights with a landing between, from the alley up to a pier and a door into the lever room. Charge site A gets two ways in, plus shots through its timber and glass.
- Materials, as the spec asks:
  - Boxcar shells are 5 cm sheet metal; the workshop and the lever room are timber. Both can be shot through.
  - The locomotive, tank cars, underframes, rails and depot tanks are steel; the shed and relay room are brick. None of these can be shot through.
  - A test checks each of these by the first material a shot meets.
- End screens: lineside huts, container stacks, crate stacks and wall piers across each end at x ±42.5–44.8, with gaps to walk through.
  - Why: the first bot runs showed every lane running straight from one spawn end to the other, so the spawns saw each other.
  - The two ends' gaps never share a z, and a test checks that no team-1 spawn can see a team-2 spawn at eye height.
  - The long-lane tracks stop short of the screens (buffer stops at ±41–42). The end flatbeds carry containers, so the rows block the view too.
- Roof climbs: a 1.1 m crate, then a 2.2 m crate, then the roof (1.7 m up).
  - Why: with a 2 m crate, the nav graph found a climb straight from the ground (within the 2.03 m high climb) that a bot couldn't make from its real approach, and it jumped there for 10 s. At 2.2 m that climb is plainly out of reach, and every step is a sure mantle.
- Spawns:
  - Team spawns: 9 a side, across all three lanes at each end, mirrored (x → −x), facing in.
  - FFA: 16, the ends plus spots in every lane.
- Outposts zones: A on the long lane, B in the alley between the cars, C in the shed's north aisle, all at mid-yard.
- Charge sites: A is the lever room and B is the fuel depot, both at team 2's (east) end.
- Nav: Survival Town's settings (2 m grid, ceiling 8 m), with hints at both sides of every door, through each open boxcar, up each crate climb, and on each stair landing and platform. Long-lane nodes get long sightlines (more than 30 nodes at 35 m or more, and more than 10 at 60 m or more).
- Cameras and sound:
  - 15 reference spots, a benchmark path down the long-lane strip, back along the alley and through the workshop, the shed and the depot, and an elliptical menu fly-through.
  - Indoor zones for the workshop, the shed, both floors of the signal box, the pump house and the lamp hut.
  - Ambience: wind, birds on the poles, and a radio in the lever room. The yard's own sound bank is ticket 15.
- Decorations: sleepers on every in-yard ballast bed and a red beam on each buffer stop, each within 5 cm of its solid. The rest of the art is ticket 14.
- Not seen in the browser yet: nothing in the menu opens Switchyard until ticket 16 (Explore Switchyard, Bot Match on any map), and it has no art until ticket 14.
- Tests:
  - `switchyard.test.ts` (39):
    - size, the long lane's sightlines, and no spawn seeing an enemy spawn;
    - spawns: clear, on the ground, spaced, mirrored, facing in with an open view;
    - routes through each open boxcar, up each roof climb, through the relay room, up one stair, across the lever room and down the other, onto the shed platform, the coaling stage and the dock, and through the workshop and the shed;
    - containment (sprint-jumps, slides and mantles at the edge), the edge cutting through nothing, the boundary clip outside and closed, and a drawn wall at every edge;
    - no clip stops a bullet; shots out over the walls; materials and penetration; no z-fighting;
    - reference spots, the benchmark path, the fly-through, indoor zones, decorations within 5 cm, and known finishes.
  - `switchyard-nav.test.ts` (8):
    - coverage of the ground, car roofs, the lever room and the platforms;
    - every node reachable from every other, and standable;
    - a node near every spawn, and long sightlines on the long lane;
    - nodes in every zone and site, with paths to each from both teams' spawns.
  - `switchyard-bots.test.ts` (9): three minutes of bots only at 3v3 and at 6v6 in TDM, FFA, Outposts and Charge.
    - Nobody leaves the boundary, and nobody roams in place for 8 s of live play. Time between matches and a round's freeze doesn't count: everyone is held then, and the first failure was a bot frozen in the post-match intermission.
    - Each mode makes progress: both teams score in TDM, kills are spread in FFA, both teams capture in Outposts, and Charge rounds finish.
    - Plus a 3v3 Charge match to the end, with a plant and rounds won by both attackers and defenders.
    - Checked runs: 3v3 went 4–3 with 4 plants and 2 defuses; 6v6 went 4–1 with 3 plants and 1 defuse. Most plants were at the signal box.
  - The whole `apps/range` suite passes on the home server.
