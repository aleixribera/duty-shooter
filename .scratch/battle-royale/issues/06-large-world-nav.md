# Hierarchical nav built ahead of time

Status: resolved
Release: v2.98.0
Blocked by: 05

Spec: `../spec.md`

Spec: Bots at scale. Region graph over chunked local nav, generated at build time and shipped as data. No full-node sorts. Keep existing maps working. Prefer new modules: `bots/nav.ts` has another session's uncommitted changes.

## Comments

Shipped: `bots/large-nav.ts` (build, packed arrays, `.nav` file, three-level search), `bots/nav-queries.ts` (what the bot brain asks in bulk), `largeMapNav()` in the range build, `navFile` on a map. ADR 0008 has the reasons.

Measured on the home server, Zero Island:
- Build 10 to 12 s (the rest of a cold build is the lighting bake). 64,152 nodes, 531,455 links, 534 clusters.
- Data 6.29 MB, 2.07 MB gzipped. Loads in 5 ms, 18 MB in memory.
- Route between random nodes: 0.35 to 0.39 ms mean, 141 hops.
- 60-bot soak, 150 s: 471 Region crossings, nobody wet, outside the Boundary or on the summit, longest time roaming in place 1.4 s. In play 32.4 routes/s, mean 0.071 ms, p99 0.82 ms, worst 40.7 ms, 0.23% of a core.
- Real server, load gate with 2 clients and 58 bots for 92 s: tick p99 8.25 ms, worst 14.8 ms, 0 late, 26% CPU, RSS 311 MB (Survival Town 186 MB). The first window's p99 36 ms and worst 57.7 ms are the opening's spawn scoring, known from ticket 03.

Seen for real: a built server on Zero Island with 59 bots, joined from the page through Play Online with `?online`. Bots sprint over the sand and fight, 40 s of samples show them moving, no page errors. There's no menu path yet: Bot Match needs `map.nav`, and the offline case is ticket 15.

Decisions:
- `NavGraph` stays what a bot holds, with an optional `index`. Small maps run the code they ran: an 8-way fingerprint of 90 s matches was identical before and after. There are no stored golden hashes to compare, so this was a throwaway test.
- The search leans 1.3 on the straight line: routes a few percent longer for a tenth of the work (1.78 ms down to 0.39 ms).
- Spawns round each Core are a stand-in until ticket 07, so bots and players don't all start at one point.
- No ladder links on a large map: none has a ladder. `precise` is always false there: climbs set their own tolerance.

For tickets 09 and 28:
- Rebuilding: nav regenerates whole on every `npm run build -w @duty-shooter/range`, and on first request in dev. The file isn't committed and isn't patched, so a map edit needs no step of its own; a server just needs the build that matches its map. A Docker image gets both. There's no check that a `.nav` matches the map: a server pointed at an old `STATIC_DIR` runs on the old nav.
- Cover spots (spec, "Using the ground"): put them in the same job. `buildLargeNav` already casts sixteen rays per node for sightlines, and `flags` has seven free bits per node, so a "cover here" bit fits with no format change. Cover that needs a direction or a height goes in a new array: add it to `PackedNav` and `SECTIONS` and bump `VERSION`, which makes an old file fail loudly. Decoded arrays are views, so a Web Worker can have them too.
- What grows with solids, measured on 172 solids plus 500 scattered 3 m boxes: 10.0 s to 16.3 s, 64,152 to 78,160 nodes, 531,455 to 712,047 links, 6.29 MB to 8.24 MB. That's about 13 ms, 28 nodes, 360 links and 4 KB for each lone solid, because the grid goes fine for 3 m round it. Each new node and link is walked and each node casts its rays, so links grow faster than nodes. Solids that touch share their fine cells and cost less. Memory follows nodes, about 280 bytes each. A route's cost follows the nodes in its corridor: a dense Core costs more to cross, not the whole map. Re-measure after ticket 28 with `BENCH=1` on `zero-island-nav.test.ts`.
