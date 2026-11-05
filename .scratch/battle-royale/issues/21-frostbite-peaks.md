# Region: Frostbite Peaks

Status: resolved
Release: v2.138.0
Blocked by: 20

Spec: `../spec.md`

Spec: Zero Island table. As ticket 17.

## Comments

- Built as ticket 17's steps: plan `zero-island-frostbite-plan.ts`, Blender kit `tools/map/regions/frostbite.py` (`models/frostbite.glb`, 3.7 MB raw, about 0.6 MB gzipped), solids fitted by `fit-solids.mjs` (ONLY=frostbite), placed by the FROSTBITE kit on one pad levelled at 48 m. The summit stays scenery: every piece stands more than SUMMIT_RADIUS + 10 m from it (tested).
- Pieces: the ops building (precast panels, an olive band, a stair to its parapeted roof), two corrugated barracks you can walk through, the radome on a railed plinth with steps, the dish on its tower with a yoke and an equipment hut under it, the timber watchtower on an open steel stair (the treads are as tall as the rise so the stringers join), the cableway station with two parked cars, its rope over a pylon and a car stopped mid-span above head height. Kit for the cover pass and extras: huts, ice walls (blue ice heaved up in shards), sandbag walls, stores crates, fuel drums and snowcats. Every stair rises at most 0.4 m and is at least 2.3 m wide (tested).
- Made the call: the radome's railings are a concrete upstand to the knee rail with balusters above, not an open rail, so the solid round the plinth sits within 5 cm of what's drawn (kit-solids' piece tolerance). The snowcat's fill floor is 0.70, not 0.75: the gap between its tracks is open and seen.
- Made the call: `zero-island-royale-bots` plays Trios on seed 102. Frostbite's base moved Trios seed 101 to 0 revives in 44 downs; seeds 101-106 gave 0, 3, 6, 4, 1 and 5. Revives are rare, so one seed can see none. Seed 102: 504 s, Stage 5, 3 revives, every other floor held.
- Checked in game (1920x1080 and 390x844, `.scratch/battle-royale/frost/shots*`: overview from the south, the base at eye height, the tower cabin, the cableway, the radome, the ice walls, the ops building). Walked into and shot the kit props (`frost/edges`): the body stops at the ice wall's face, body shots hit the wall and the snowcat.
- Measures: frame time over the base 3.6-5.6 ms mean, 5.1-7.6 p99 (dev server, this PC; Neon City's view in the same run 4.1 ms). `harbor/frames.mjs` against a prod dist measures an idle page: prod has no `duty.game`, so its waitFor returns null and the camera never moves (0.1 ms main thread a frame). `frost/frames.mjs` takes the dev server's URL and throws without the hooks. 60-seat Local bots match 5.7-6.1 ms mean, p99 8.0-8.8, worker tick p99 1.4 ms, no page errors; download 29.8 MB gzipped; server tick p99 3.25 ms (2 clients, 58 bots, 1800 ticks); longest-stuck bot in the soak 3.2 s at (-173, 7, 210), outside the base.
- Tests: shard A 195, B1 26, B2 21 (+1 skipped), the rest 1580 (+14 skipped).

