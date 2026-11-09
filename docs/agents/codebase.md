# Working in the codebase

What the code doesn't say on its own. The README covers running, the server's environment, URL parameters and controls; `GLOSSARY.md` the domain words.

## Packages and import direction

| Package | Holds | May import |
| --- | --- | --- |
| `packages/fps-core` | simulation, movement, weapons, netcode, modes, bots, stats | nothing else in the repo; no three.js, DOM or audio |
| `packages/fps-client` | rendering, viewmodel, HUD, menus, audio, the client session | fps-core |
| `apps/range` | the maps (as data), the lighting bake, the page (`src/main.ts`) | both packages |
| `apps/server` | the authoritative server | fps-core, and the maps through `@duty-shooter/range/maps` |

Two tests hold the lines: `packages/fps-core/test/purity.test.ts` keeps the core headless, and `apps/server/test/headless.test.ts` follows the server's runtime imports through the maps into `fps-client/surfaces` and fails on anything that loads three.js, the DOM or audio. So a map file may import from `@duty-shooter/fps-client/surfaces`, but not from `map-sound` or anything else that reaches the audio or the renderer; take types with `import type`, which the build erases.

Each package's entry points are its `package.json` `exports`; import through those, not deep paths. The page's first load is `@duty-shooter/fps-client/ui` and `apps/range/src/main.ts`, which reach no three.js so the menu appears before the engine: anything drawn with three.js goes through `apps/range/src/engine.ts`, and a menu action that needs it runs inside `whenUp`.

Work behind the menus has to stay out of a click's way. `Game.prepare` waits for the map's models (`WorldView.modelsIn`), since compiling takes its list of objects at once, then builds their shaders one object at a time (`GamePipeline.compile`) and gives way after each press (`breath` in `main.ts`). What can't be split, the first full frame and the Practice Range game kept ready off screen (`keepRangeReady`, skipped under 4 GB), waits for `restMoment`. Anything that plays calls `ready()` or `useMap`, which end those waits. A menu step in `perf.mjs` over about 60 ms means something new landed outside them.

## Adding things

- **A map:** `MapId` in `apps/range/src/map/definition.ts`; `MAP_IDS`, `LOBBY_MAPS` (online) and `BUILDERS` in `maps.ts`; the lighting bake list in `apps/range/vite.config.ts`; `MAP_IMAGES` in `main.ts` and its lobby picture (`node apps/range/scripts/map-picture.mjs <map> <spot>`); `BOT_MAPS` in `packages/fps-client/src/ui/model.ts` (Bot Match, which is the lobby page offline); `MAP_NAMES` in `ui/model.ts`. Give it a nav graph for bots, and copy one of the `*-bots-*.test.ts` soaks. A map too big to generate at a server's start names a file in `navFile` instead and has its job in `apps/range/nav/plugin.ts` (ADR 0008): the build leaves it in `dist/nav/`, so such a map needs a built app in `STATIC_DIR` to run with bots, the load test included (`STATIC_DIR=$PWD/apps/range/dist MAP=zero-island`). Ground that rises and falls is `terrain` on its `MapDefinition`, not solids (ADR 0007).
- **A mode:** `ModeId` and `MODE_IDS` and a class in `packages/fps-core/src/modes/`, then its time limit in `optionsFromEnv` (`apps/server/src/server.ts`), its names in `ui/model.ts`, and its bot fill in `TEAM_SIZES` (`apps/range/src/map/maps.ts`). A mode without teams (`teamMode` false) fills to twice that size, and plays emptier than the team modes: copy free-for-all's sizes (6 players on Survival Town, 8 on Switchyard), not TDM's.
- **A weapon:** its sourced stats and traits in `packages/fps-core/src/stats/weapons.ts` (`WeaponId`, `WEAPON_IDS`); its model in `tools/weapon/` (see its README) and its viewmodel in `packages/fps-client/src/viewmodel/`. `docs/balance.md` is generated: `BALANCE_REPORT=docs/balance.md npx vitest run packages/fps-core/test/balance.test.ts`.
- **A 3D model:** built in Blender from a generator script, never hand-made in three.js: `tools/map/switchyard.py` for the map's props, `tools/weapon/*.py` for the arsenal, `tools/soldier/soldier.py` for the third-person soldier, `tools/map/scatter.py` for the rocks, stones, masonry and shrubs strewn over a map (a map turns them on with `scatter`; `packages/fps-client/src/surfaces/scatter.ts` places them from its faces and solids, and they stay under crouch height so they can't pass for cover).
- **A surface's relief:** `tools/textures/tiles.mjs` paints the tiling tiles in `apps/range/public/textures/` from code (`node tools/textures/tiles.mjs`, or `node tools/textures/tiles.mjs clouds` for one picture); `packages/fps-client/src/surface-tiles.ts` says which family wears which tile. A new read of a tile in a branch or loop needs its inputs pinned with `.toVar()` first, and a depth texture can't be read with `.r` on WebGL2: both pass under WebGPU and break later, so check `?webgl` too.
- **A window you can't see through:** give its finish the `room` family and the pane shows a lit room (`packages/fps-client/src/surface-room.ts`), on faces and models alike. It is opaque, so never put it on real glass with a real interior behind it: that would block a sightline. Weathering marks need nothing: a map with `scatter` gets them, placed from its faces (`surfaces/grime.ts`).
- **A weapon in third person:** its row in `HOLDS` (`packages/fps-client/src/soldier.ts`): the grip and support palms (shared with the first-person rig in `viewmodel/kit.ts`), the butt plate that goes in the shoulder, the magazine the support hand takes on a reload, and how far that hand may slide back along the handguard. The soldier places the gun along the aim with its stock in the shoulder pocket and reaches both hands to it with IK; `packages/fps-client/test/soldier.test.ts` checks the points against the models and both hands on every gun in every pose. Look at it with `soldiers.html` (below).

## Tests

Everything under `vitest` is Node-only; there are no browser tests in the suite. Run Node suites on the home server with `remote-test` (see the global instructions), and anything that drives Chrome locally with `remote-test --local`.

- The full suite takes about 8 minutes on the home server once Zero Island's nav is cached (see `apps/range/test/support/island-nav.ts`), so run it in the background from `remote-test`; a change to the map or the nav generator builds a new nav, about 100 s for each test file that needs one at that moment. Its long pole is `packages/fps-core/test/balance.test.ts` (5,760 seeded bot duels, about 90 s there); next come the bot soaks (`apps/range/test/*-bots-*.test.ts`, one file per map and mode so they run in parallel, 8 to 20 s each). While iterating, run one file or one package (`npm run test:core`, `test:client`, `test:range`, `test:server`), and the whole suite once at the end.
- Run the suite as shards, one `remote-test npm run <shard>` at a time; each should stay under 10 minutes. `test:core`, `test:client` and `test:server` are shards of their own (the client takes about 1 minute). Range is split in five, and between them they cover every `apps/range/test` file exactly once (`npx vitest list --filesOnly <args>` shows a shard's files):
  - `test:range:island-nav`: `zero-island-nav.test.ts` alone, about 150 s warm. It builds the island's nav at import, and it is the one file that can't be split. On 2026-11-06 it didn't finish in 25 minutes, both in a fresh server workspace and on HEAD. Look at the nav generator's cost before blaming the shard.
  - `test:range:royale`: `zero-island-royale.test.ts` alone, about 300 s. Its whole matches in Squads of 3 take about 190 s on their own.
  - `test:range:island`: every other `zero-island*` file except the bot soaks: the island, Regions, cover, plants, sightlines and the pace probe. About 2 minutes with the island's nav cached; without the cache, sightlines and cover build it first.
  - `test:range:bots`: the island bot soaks plus every `crash*` and `survival-town*` file, 396 s with another job on the server.
  - `test:range:rest`: everything else in range (`switchyard*`, `kit-solids`, `local-royale`, `bot-match`, the small ones), about 290 s. `kit-solids` is its long pole at about 170 s.
  - These times come from the home server under `remote-test`'s CPU cap, which every job on the server shares. A second job running at the same time can double them.
- Shared test helpers live in each package's `test/support/` (bot soaks and nav reachability in `apps/range/test/support/bots.ts`).
- `apps/range/test/server-cpu.test.ts` and the benchmarks skip unless `BENCH=1`.
- `apps/range/test/zero-island-royale-pace.test.ts` skips unless `ROYALE_PACE=size:seed,...` and prints whole Battle Royale matches (about 20 s each on the home server): length, Stage, deaths to the Ring, what bots were doing, and per Squad size the Revive measures (share, revives started under an enemy's sight, interrupted, Down to start), when Squads went out, the 60-seat tick (mean, p99, late ticks) and the longest a bot stood stuck. `ROYALE_GOOD=1` puts the good-player proxy in a seat and prints how it did; retune `royale.botReaction` and `royale.botAim` in the stats file against that, over 30 seeds at least, since one match in four needs that many to tell from noise.
- `npm run typecheck` also typechecks every package's tests, which vitest itself never does.
- Tick costs measured under `remote-test` include its CPU cap: at 60 clients the cap held the thread for 20 to 65 ms at a time (ticket 30), so a soak's or a load test's worst tick there says nothing about the game. `CANARY=1` on `load-test.mjs` proves it (`capThrottledMs`, and slow ticks the canary was stalled in too), and the server names such a tick `stall`. To measure the game itself, run the load test as a plain process on the home server, on its own port, as `.scratch/battle-royale/ticks/uncapped.sh` does.
- A rehearsal (`apps/server/src/warm-up.ts`) has to look to V8 like the real game in every way: a shape the warm-up never showed, such as a person's usercmd or a probe, throws compiled code away at the worst moment. `spendFirstUpgrade` exists because a process's first HTTP upgrade does the same to every typed-array function; `apps/server/test/first-upgrade.test.ts` shows it.

## Driving the game in a browser

Use the scripts in `apps/range/scripts/` (`npm run bot-runs`, `record`, `bench`, `spots`, and `node apps/range/scripts/soldier-sheet.mjs`, which screenshots `soldiers.html`: every look holding each weapon through the poses and actions the game uses): they launch Chrome through `chrome.mjs`, headless and muted (`HEADED=1` shows it, `SOUND=1` unmutes it, `CHROME` names another browser). They expect the dev server (`npm run dev`, port 5173) and use the dev hooks: `?nolock`, and `globalThis.duty` (`game`, `driver`, `menu`, ...; `duty.game.player` is the local player).

- This PC has a real controller connected (a DualShock 4), often in use, and Chrome hands it to a page once a script's click focuses it: it walked and fired the "idle" player of scripted runs (ticket 77). `launchChrome()` hides every controller unless `PAD=1`; a script testing the controller puts its own fake `navigator.getGamepads` in place. The game itself reads no controller while its page is hidden or another window has the focus.
- Open one page per Chrome; a second navigation in the same browser can hang at "Starting renderer".
- `chrome.navigate` returns before the page commits, sometimes by seconds: a press timed from it can land on `about:blank`. Wait for `location.protocol` and `performance.now()` in the page.
- Editing the game's source while a scripted run is going makes Vite reload the page and fails that run. Change tests, docs and scripts meanwhile, and source after.
Two more measure the production build rather than the dev server, so build first: `perf.mjs` (first and return visit, every menu click, the way into a match, a played match's frame times; `CPU_PROFILE` and `LOAD_PROFILE` save profiles) and `chaos.mjs` (plays online through a proxy that cuts and stalls the connection, and reports the seats kept). Both start the real server themselves; run them with `remote-test --local`.

A scripted client that keeps time with `setInterval(…, 1000 / 60)` runs at 62.5 Hz: Node rounds it down to 16 ms, and the surplus sits in the server's queue as input delay that real players don't have. Use a deadline, as `load-test.mjs` does. Snapshots are binary frames and everything else is JSON text: `apps/server/scripts/load-test.mjs` shows how a script reads both, importing `packages/fps-core/src/net/codec.ts` directly (Node strips its types). Snapshots leave out scores, names, pings, popped and match when unchanged, so read those with `?.` and keep the last one seen. Under a relevance profile (`NET=wide`) a seat can be named in `held` instead of sent: it keeps its last state.

- A player who stands still is left alone by bots in humans vs bots, and in Charge the attackers escort a carrier who doesn't move: script movement (`MOVE=1` in `bot-runs`) before reading "no kills" as a bug.

## The desktop app

`desktop/` is the Windows app: an Electron window that opens the live game (see "Desktop app" in `README.md`). It has its own `package.json` and lockfile and sits outside the npm workspaces on purpose, so Electron's download stays out of the root install, the Docker build, CI's test job and `remote-test` installs. It imports nothing from the game; the game needs no change for it.

- `config.mjs` holds its decisions (which address, which links stay in the window) and `test/` checks them: `npm test` in `desktop/`, a second.
- `npm run smoke` in `desktop/` drives the app against a local server, hidden, muted and with pointer lock stubbed: run `npm run build` in the root first, then `remote-test --local npm run smoke --prefix desktop`. Screenshots land in `.scratch/desktop/`.
- The icon is rendered by `tools/icon/icon.py` in Blender into `desktop/build/icon.png`.
- `config.json` (the lobby address, from `DUTY_URL` or `gh variable get LOBBY_URL`) is generated and git-ignored.

## Releases

Every commit gets the next version tag above the highest one (`git tag --sort=-v:refname | head -1`): a patch for fixes and tidying, a minor for features. CI publishes `:vX.Y.Z` for a tag and moves `:latest` from `main`; the live lobby follows `:latest` unless the stack's `.env` pins `DUTY_IMAGE` (`docs/deploy.md`).
