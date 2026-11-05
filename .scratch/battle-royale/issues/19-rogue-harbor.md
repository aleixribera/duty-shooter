# Region: Rogue Harbor

Status: resolved
Release: v2.136.0
Blocked by: 18

Spec: `../spec.md`

Spec: Zero Island table. As ticket 17.

## Comments

- Built as ticket 17's steps: plan `zero-island-harbor-plan.ts`, Blender kit `tools/map/regions/harbor.py` (`models/harbor.glb`, 4.1 MB raw, about 0.8 MB gzipped), solids fitted by `fit-solids.mjs` (ONLY=harbor), placed by the HARBOR kit. The old grey blocks, the slab ship and the two slab piers are gone.
- Pieces: a 76 m concrete quay with bollards and fenders, a level yard at 2.4 m out to it; two rail-mounted portal cranes with booms out over the ship; a 52 m cargo ship moored in the shallows (keel on the seabed, inside the Boundary), its deck walkable, reached up two stairs from the quay, three bays of containers on deck as cover; two barrel-roofed warehouses (doors at the ends and sides, racks inside) and an arched hangar by the airstrip.
- Kit for the cover pass and the yard's extras: containers one high or stacked two, each in two liveries by where they stand (`dressKind`), site offices, concrete walls, crate stacks, cars, and lorries for wrecks as tall as one. The yard is container blocks in rows with lanes between; the test holds hard cover within 10 m of anywhere in it.
- Dropped the container wagon model: no railway runs through the Harbor, so nothing wore it.
- Checked in game (1920x1080 and 390x844, `.scratch/battle-royale/harbor/shots*`), walked into and shot each kit prop (`harbor/edges`): stops and hits sit on the models. Frame time over the Harbor 4.0 ms mean, 7.7 p99 (prod build, this PC); 60-seat Local bots match 5.4 ms mean, worker tick p99 1.8 ms; download 28 MB gzipped; server tick p99 4.5 ms (2 clients, 58 bots); longest-stuck bot in the soak 5.5 s, in Ground Zero.
- Left: rocks from the plant pass stand in the shallows by the ship's seaward side; they read as breakwater boulders, so they stay.
