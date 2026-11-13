# Backlog

Work the loop cut, found or deferred, for the director to promote into the plan. Written by the loop.

- **Crease shade on Zero Island** (ticket 90, 2026-11-13). Room corners darken on every map but Zero Island, where finding the creases over 316k faces stalled the load by 1.5-2 s. Cache them with the bake (they depend only on the solids), or find them in a worker, and turn them on there.
- **Zero Island in every review capture** (ticket 96, 2026-11-13). `capture.mjs` plays the local Battle Royale only with `ISLAND=1`: under the dev server the island's nav is built on its first ask, which kept "Building Zero Island" past 3 minutes on this PC. Capturing from a production build (nav in `dist/nav/`) or warming the nav first would let every review visit it.
