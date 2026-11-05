# Region: Neon City

Status: resolved
Release: v2.137.0
Blocked by: 19

Spec: `../spec.md`

Spec: Zero Island table. As ticket 17, with about 4 enterable buildings.

## Comments

- Built as ticket 17's steps: plan `zero-island-neon-plan.ts`, Blender kit `tools/map/regions/neon.py` (`models/neon.glb`, 7.6 MB raw, about 1.1 MB gzipped), solids fitted by `fit-solids.mjs` (ONLY=neon), placed by the NEON_CITY kit. The city's grey blocks are gone; the ground there is a brick and asphalt layer.
- Pieces: four enterable buildings (two brick walk-ups with stairs to two floors and the roof, two arcades with a fire stair to the roof), the elevated highway (9 m deck on piers, a stair up each side through gaps in its parapets, stopped cars and a bus on it as cover, cut to 104 m so its ends stand clear of the spawns), four tower shells (podium and lit shaft; their tops are scenery), neon signs, billboards and blade signs in magenta, cyan, violet and amber, lettered both faces.
- Kit for the cover pass and the street: shop blocks, jersey barriers, cars in two liveries by where they stand (`dressKind`'s `wreck-b`), stacks of boxes (one fitted box under a carton skin).
- The cover pass sets the city's approaches 23 m apart instead of 25: the cars' fitted solids sit lower than the old 1.6 m box, which left the south approach (384,-96) open past the 60 m area median. Now 60.
- Nav fix: the Neon hub landed on top of a 2.2 m crate (nearest the Core, but nothing reaches it), so every route into the city was found from nowhere. A Region hub is now chosen among the clusters the map both reaches and is reached from (`mainClusters`, large-nav.ts; test in large-nav.test.ts).
- The mantle test (ticket 67) now takes turned single boxes as well, since the Region kits turn their cover; its timeout is 60 s (16 s here, 31 s on the loaded server).
- Checked in game (1920x1080 and 390x844, `.scratch/battle-royale/neon/shots*`: overview, avenue, deck, arcade and walk-up insides, walk-up roof, cross street, towers, south approach), walked into and shot each kit prop (`neon/edges`): stops and hits sit on the models. Frame time over the city 4.4-4.5 ms mean, 6.4-6.9 p99 (prod build, this PC); 60-seat Local bots match 5.7 ms mean, p99 8.7, worker tick p99 2.2 ms, no page errors; download 29.2 MB gzipped; server tick p99 4.75 ms (2 clients, 58 bots, 1800 ticks); longest-stuck bot in the soak 5.6 s at (-134, 5, 228), outside the city.
