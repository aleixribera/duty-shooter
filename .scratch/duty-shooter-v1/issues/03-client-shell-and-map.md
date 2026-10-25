# 03 Client shell, input, camera and the graybox map (offline, playable)

Status: ready-for-agent
Milestone: 1 (movement and course, offline)
Blocked by: 02

## What to build

Milestone 1 becomes playable: walk the movement course offline in the browser.

- `fps-client`: renderer setup (WebGPU with WebGL2 fallback), fixed-tick loop running `fps-core` locally with render interpolation, mouse look applied every rendered frame (story 70), Pointer Lock with `unadjustedMovement` and the Firefox one-time tip (63-64), MW2019 default bindings all rebindable (58), hold/toggle crouch (59), sensitivity on MW2019's scale (60), FOV slider default 80 (62), settings in guarded browser storage (65). First-person camera with stance heights, smooth step-up camera (14), landing dip of the camera (16), slide camera tilt.
- `apps/range`: the one original map built from tagged boxes with a grid-textured polished graybox look (86): firing range with 10/25/50 m lanes (dummies come in ticket 06), movement course with mantle ledges at each height band, slide lanes, stairs, ramps, gaps and a fall-damage drop (85), and a small symmetrical Gunfight-sized arena. The map lives in the app, not in `fps-core`/`fps-client` (story 87).
- A minimal start/pause menu with settings.

## Acceptance criteria

- [ ] Playtester agent: page loads with no console errors, pointer lock works, every movement action works on the course.
- [ ] `fps-core`/`fps-client` import nothing from `apps/range`.
- [ ] Headless tests confirm the map's mantle ledges and drop heights fall in the intended bands (reuse the harness).
