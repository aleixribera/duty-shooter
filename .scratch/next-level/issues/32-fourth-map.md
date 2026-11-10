# A fourth map of this game's own

Status: resolved
Release: v2.160.0

Spec: `../spec.md`

Crash is gone (ticket 31), which leaves Bot Match and Play Online with two maps. Build a third match map designed from this game's own needs, not after any other game's level.

- Mid-size, for 6v6 team modes and 4v4 Charge: three lanes with a contested middle, sized between Survival Town and Switchyard.
- Built for the movement: run-ups long enough for the Slide's kick (ticket 21), gaps the Kick clears, climbs and ledges at mantle heights, and at least two ladders (the only map with ladders went with Crash; bring back a bot ladder test).
- Charge sites A and B with two ways onto each; Outposts' three zones; team spawns that never see each other.
- Its own place, light and story: name, art direction and landmarks are the owner's call; put a recommendation in Comments and keep going.
- Real Blender models for everything (no hand-built three.js stand-ins), a lighting bake, a nav mesh, a lobby image, a `TEAM_SIZES` row, and the bot soak tests the other maps have (every mode to the end).

## Comments

### Station Nine: what was built, and why (implementation sub-agent, 2026-11-10)

**The recommendation: Station Nine.** It is an instrument station on a weapons test range, at dawn on the morning of a tower shot. Every camera and recorder faces the shot tower on the plain to the east-north-east, which stands black against the sunrise. The match is the countdown: when it ends, the device goes off, and that is the ending shot (`NUKE_SHOT`, ground zero at 430, 0, -260).
- **Departing from the default.** The default fourth map is "a generic military base" or another industrial yard. Survival Town already has the houses and Switchyard the rail yard, so a third "compound with crates" would blur into them. A test station brings its own landmark, the shot tower on the horizon. It brings its own light: a low, warm dawn straight down the long axis, so each team gets a turn facing the sun. It brings its own reason for the props: cable reels, instrument piers, camera towers, a recording bunker. And it brings an ending only this map can have.
- **Alternatives considered:**
  - "Static Fire": a rocket test stand. The stand would have to be the middle, which makes it a tall centrepiece. It is weaker for three lanes.
  - "Spillway": a dam outflow. Its water and levels fight the flat 6v6 sightlines.
  - "Shot Tower": the same place, named for the landmark. But the tower is out of bounds, and the name promised a map you can't climb.
- **What would prove it wrong.** Watch for the ending reading as gimmicky, or the dawn sun making the west-facing team's fights unreadable. Bot runs show readable frames from both ends (see below), but a human eye on long sessions is still the real check.
- **Layout.** The map is mirrored east to west, 80 × 56 m inside its walls. It sits between Survival Town and Switchyard in area, and a test holds that. There are three lanes:
  - **North:** the cable trench, 4.25 m wide and 1 m deep in three runs, with a lattice camera tower on each side, each climbed by a ladder.
  - **Middle:** the recording bunker, with doors north and south, the recorders inside, and ladders and crates up to its roof. It blocks the middle lane at eye height.
  - **South:** the loading docks, two docks facing each other over a 4.25 m gap, with the generator houses beyond and the fuel tanks behind.
- **Movement.** A sprint jump falls short of the trench and the dock gap; the Slide's Kick clears both. The docks, crates and trench walls are at mantle heights. Four ladders climb to the two towers and both ends of the bunker roof.
- **Spawns.** Team 1 starts west, team 2 east. A staggered screen of huts, containers and crate stacks across each end means no spawn sees an enemy spawn.
- **Charge** (team 2's half):
  - Site A is the east camera tower, foot and deck. It is reached from the trench lane at its foot, or from the middle over the trench, and its deck by the ladder.
  - Site B is the east generator house, entered by its west door from the docks or its north door from the road.
- **Outposts:** A Trench, B Bunker, C Docks. **Team sizes:** TDM 6, FFA 4, Outposts 6, Charge 4, gun game 4.
- **Models.** Every prop and structure is a real Blender model from `tools/map/station-nine.py`: about 40 assets, 87k tris, one GLB. That includes the visual-only shot tower, the cable-pole line and the far bunkers beyond the barrier. Materials are the map's own finishes; no outside image generators were used. Every vertex is within 5 cm of its solids, and no solid is drawn twice (tested).

**Fixed during verification:**
- **Spawn view.** Walking `?explore=station-nine&nolock` walked straight into the orange container 4.6 m ahead and stopped at x = -33.8. 12 of 18 team spawns faced a screen piece. Each end spawn now faces the middle of the nearest gap in its own screen, or the opening by the boundary where that is 2 m or more. A new test ("team spawns look out through a gap…, open for 10 m") failed with 12 spawns listed and now passes. The same walk now covers 25 m in 6 s.
- **Fuel tank collision.** It is now stepped round the barrel, so the model stays within its solids.
- **Smaller fixes:** a toe-board z-fight on the tower parapet; two reference spots that sat inside or against a container (the spot test now wants 0.3 m of clearance).
- **Soak names.** The bot soaks are renamed `station-nine-bots-<mode>.soak.test.ts`, to match the soak tier another session is introducing.

**Verified:**
- **Tests:** station-nine, -nav and -models 70/70; ui-model, royale-island and status pass; the other maps' nav tests plus fps-core `large-nav` and `bots` 64/64, since `NavOptions.floor` defaults to the old -0.5. The Station Nine soaks pass 10/10 in `--project soak`: every mode to the end, and Charge with plants and rounds won by both attackers and defenders.
- **Typecheck** passes in fps-core, fps-client, range and server.
- **Bot Match through the real menu** (`.scratch/next-level/map32/bot-runs-nohmr.mjs`, 60 s each): 6/6 ok, with no errors and no stalls. Shots are in `.scratch/next-level/map32/botruns/` and `sheet-botruns.jpg`.

  | Mode | Kills | Min fps |
  |---|---|---|
  | TDM | 29 | 114 |
  | FFA | 30 | 125 |
  | Outposts | 34 | 108 |
  | Charge | 2 | 110 |
  | Gun game | 33 | 91 |
  | Charge, humans vs bots | 0 | 135 |

- **Explore walk and lobby tile** at 1920×1080 and 390×844, all looked at: `.scratch/next-level/map32/walk/` (`explore-spawn-*`, `explore-walked-*`, `lobby-*`, `sheet-390.jpg`).
- **Reference spots:** `.scratch/next-level/map32/spots/`.
- **Blender previews:** `.scratch/next-level/map32/previews/` and `sheet-a..d.png`.
- **Lobby picture:** `apps/range/public/maps/station-nine.jpg`, from the spot 'trench lane west'.

**Not verified / left open:**
- No human has played it with a mouse. The movement claims (Kick clears the gaps, mantles, ladders) are proved by headless-match tests and bot runs, not by hand.
- No `design-audit` was run. No UI code changed; the lobby tile is the existing component with a new picture, looked at on both widths.
- No subagent review of the diff; the owner session reviews and commits.

**Files.**
- **New:**
  - `apps/range/src/map/station-nine.ts`
  - `tools/map/station-nine.py`, `tools/map/station-nine.blend`
  - `apps/range/public/models/station-nine.glb`, `apps/range/public/maps/station-nine.jpg`
  - `apps/range/test/station-nine.test.ts`, `station-nine-nav.test.ts`, `station-nine-models.test.ts`
  - `station-nine-bots-{tdm,ffa,outposts,charge,gungame}.soak.test.ts`
- **Changed** (Station Nine hunks only; some of these files also carry other sessions' uncommitted edits):
  - `apps/range/src/map/definition.ts`, `apps/range/src/map/maps.ts`, `apps/range/src/main.ts`, `apps/range/vite.config.ts`
  - `apps/range/scripts/bot-runs.mjs`
  - `packages/fps-client/src/ui/model.ts`, `packages/fps-client/test/ui-model.test.ts`
  - `packages/fps-core/src/bots/nav.ts` (`NavOptions.floor`, for the trench floor)
  - `apps/server/test/royale-island.test.ts`, `apps/server/test/status.test.ts`
  - `README.md`, `GLOSSARY.md`, `docs/agents/codebase.md`
- **Scratch:** `.scratch/next-level/map32/`.
- 2026-11-10, owner: reviewed and shipped. A second review found the wiring complete (the server takes its maps from `LOBBY_MAPS`, map ids travel spelled out, so no protocol bump) and four small things, fixed before the commit: the lane test claimed the dock lane was open end to end when the generator houses close it (it now says what the map is: one end-to-end line beside the trench, the bunker closing the middle, the docks close quarters), `record.mjs` couldn't pick Station Nine, `.env.example` listed old maps, and Bot Match's first-spawn soak now covers Station Nine too. The name and the test-site story are the owner's to change; nobody has played it with a mouse yet.
