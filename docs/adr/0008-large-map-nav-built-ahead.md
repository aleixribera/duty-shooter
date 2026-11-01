# 0008 A large map's nav is built ahead of time and searched in levels

Status: accepted (2026-11-01, Battle Royale spec, ticket 06). Extends 0004's nav graph.

## Context

0004 generates the nav graph from collision when a server starts, and every search and "which node is near" walks it whole. Zero Island is a kilometre across with sixty bots on it. Its graph has sixty times the nodes of a lobby map, it sits on terrain that the small-map generator can't see, and half a million link objects would cost the collector time on the tick. Bots on the small maps have to keep choosing exactly what they choose today.

## Decision

- **Built, then shipped.** `buildLargeNav` runs inside the range app's build (`apps/range/nav/plugin.ts`) and leaves `nav/zero-island.nav` in its output. A map names its file in `navFile`; the server reads it at start and fails with a clear message if it's missing. Nothing generates it at run time. The bytes are typed arrays laid end to end, so loading is a few views over one buffer, and a Web Worker can use the same file.
- **Same `NavGraph`, one optional field.** A bot holds a `NavGraph` on any map. A large one carries an `index`, and `findPath`, `nearestNode`, `linkKind` and the bulk queries in `nav-queries.ts` go through it when it's there. Without an index every path is the code that ran before, so small-map matches are unchanged: an 8-way fingerprint of 90 s matches came out identical before and after. `links` on a large graph unpacks on demand; only tools read it.
- **Three levels.** A chunk is a 48 m square. A cluster is a set of nodes in one chunk that can all reach each other without leaving it, so a way through clusters is always a way through nodes. A Region table gives the Regions on the best way between two Regions in constant time, A* over clusters finds a way inside those, and A* over nodes runs only in those clusters and the ones beside them. The node search leans on the straight line by 1.3, trading a few percent of length for a tenth of the work. If a route starts somewhere the table's Regions don't serve, the cluster search runs again without them.
- **Grid by need.** 4 m on open ground, 2 m within 3 m of a solid or steep ground, so nav density follows what's on the map without a list of hints. A map adding cover gets the nodes for it at its next build.
- **Links obey the movement rules.** A link walks up only what ADR 0007 lets a player climb, and may go down anything. It never enters ground lower than the map's `shore`, so bots use bridges, and wading a stream costs what its slowdown costs. Only the biggest part a player can get round both ways is kept, which removes the summit and any tower top by construction. Mantles are tried onto solids only, as banks of ground have trails.

## Consequences

- Measured for Zero Island on the home server: 10 to 12 s to build, 64,152 nodes, 531,455 links, 534 clusters, 6.3 MB of data (2.1 MB gzipped). It loads in 5 ms and holds 18 MB, the node objects bots read most of it. 32 routes a second at 60 bots, 0.07 ms each on average and 0.8 ms at p99, 0.2% of a core. The load gate with 2 people and 58 bots there: tick p99 8.25 ms, worst 14.8 ms, RSS 311 MB.
- A build now depends on the map's collision, so a map's tests build the nav too (about 10 s each). The file isn't committed.
- A ladder isn't a link on a large map yet: no map needs one. Whoever adds the first one extends `buildLargeNav` from `buildNavGraph`.
- `world` queries stay per bot. What's here is routing and looking up nodes; thinking less often when far from people is ticket 02's, and Squads and the Ring are ticket 09's.
