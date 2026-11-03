# Region: Ground Zero

Status: resolved
Release: v2.122.0
Blocked by: 16,29,62

Spec: `../spec.md`

Spec: Zero Island table. Core and surroundings built in Blender, every texture through the `game-textures` skill, seen in renders and in game from near, far and grazing, dusk lighting set.

## Comments

Implementer (ticket 17):

- Built: the reactor in its levelled crater (blue core glowing through its slots, octagonal plinth and cap), a ring of eight T-wall runs round it, two bunkers with interiors, two ruins with broken tops and rubble, the cooling pipes, the factory hall (interior, machines, chimney) and the rail station with its platform and canopy, each a Built piece on a Pad. The cover pass's walls, sheds, slabs, footings, masts, wrecks and wagons in the Region wear the Region kit's unit models, so no grey is left (test). Models: `tools/map/regions/ground_zero.py` on `tools/map/regionkit.py` -> `models/ground-zero.glb` (2.1 MB, LODs by decimation, baked AO), previews checked.
- Textures through game-textures, Claude-only sources: CC0 Poly Haven concrete scans (concrete_wall_006/008, concrete_floor_damaged_01) became the `slab`, `wall` and `steel` ground layers (`tools/textures/ground.py`); built pieces read them triplanar with a per-vertex layer and glow, darker AO indoors.
- Region pattern (for tickets 18-22), in `apps/range/src/map/zero-island-region.ts`: plan the Region's Pads and Built pieces as tagged boxes -> build each piece's look inside its boxes in Blender from the plan's JSON -> fit the solids to the GLB (`tools/map/fit-solids.mjs`) -> stand and dress them on the map with `zero-island-kit.ts` and a `RegionKit` entry in `KITS`.
- Fitted solids (ticket 63's rule): a plan box its model fills to 5 cm stays; the 66 that don't (ruin tops, rubble, pipe, chimney, reactor vessel, posts, benches) were refitted inside the model, and every unit model got fitted boxes. Built pieces collide as 258 boxes instead of 126; `kit-solids.test.ts` holds every box inside its model. A T-wall's foot is now a ledge you can climb onto, and a wagon's body stands on its bogies.
- Density, Ground Zero (before -> after): hard cover within 15 m 99.9% -> 99.9% (median 3.0 -> 3.0 m, one point 20 m out); median sightline 20 -> 30 m (rule <= 50 m), p90 210 -> 240 m, past 150 m 15.7% -> 19.4%, mostly from the honest rock and kit solids (63). Crouched with soft cover: median 20, p90 210.
- Budgets (ticket 62's measures, before -> after): frame seed 7 2.40 -> 2.27 ms, seed 11 3.15 -> 3.39 ms; draws in play 96 -> 99 / 129 -> 133; Preparation frame 2.05 -> 2.09 / 2.91 -> 2.72 ms; download 23.7 -> 24.5 MB gzip; 60-seat tick mean 1.26 -> 1.31 ms, p99 3.00 -> 3.00, worst 12.1 -> 8.7 ms; soak crossings 231 -> 246, longest stuck 4.8 -> 4.6 s.
- Bots: the nav rebuilds from the solids automatically; the 60-bot soak, Battle Royale and Squads soaks pass with nobody stuck past their bounds.
- Seen in game: near, far and grazing shots and interiors in `.scratch/battle-royale/shots/t17/`; walked into and shot a T-wall, a wreck, a wagon, a shed and a mast (`edges/`): each stopped at what's drawn and shots past their old boxes' corners flew on.
- Not done: no WebGL2 (`?webgl`) look at the built material.
