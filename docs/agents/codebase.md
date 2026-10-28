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

Each package's entry points are its `package.json` `exports`; import through those, not deep paths.

## Adding things

- **A map:** `MapId` in `apps/range/src/map/definition.ts`; `MAP_IDS`, `LOBBY_MAPS` (online) and `BUILDERS` in `maps.ts`; the lighting bake list in `apps/range/vite.config.ts`; `MAP_IMAGES` in `main.ts` and its lobby picture (`node apps/range/scripts/map-picture.mjs <map> <spot>`); `BOT_MAPS` in `packages/fps-client/src/ui/model.ts` (Bot Match, which is the lobby page offline); `MAP_NAMES` in `ui/model.ts`. Give it a nav graph for bots, and copy one of the `*-bots-*.test.ts` soaks.
- **A mode:** `ModeId` and `MODE_IDS` and a class in `packages/fps-core/src/modes/`, then its time limit in `optionsFromEnv` (`apps/server/src/server.ts`) and its names in `ui/model.ts`.
- **A weapon:** its sourced stats and traits in `packages/fps-core/src/stats/weapons.ts` (`WeaponId`, `WEAPON_IDS`); its model in `tools/weapon/` (see its README) and its viewmodel in `packages/fps-client/src/viewmodel/`. `docs/balance.md` is generated: `BALANCE_REPORT=docs/balance.md npx vitest run packages/fps-core/test/balance.test.ts`.
- **A 3D model:** built in Blender from a generator script, never hand-made in three.js: `tools/map/switchyard.py` for the map's props, `tools/weapon/*.py` for the arsenal, `tools/soldier/soldier.py` for the third-person soldier.
- **A weapon in third person:** its row in `HOLDS` (`packages/fps-client/src/soldier.ts`): the grip and support palms (shared with the first-person rig in `viewmodel/kit.ts`), the butt plate that goes in the shoulder, the magazine the support hand takes on a reload, and how far that hand may slide back along the handguard. The soldier places the gun along the aim with its stock in the shoulder pocket and reaches both hands to it with IK; `packages/fps-client/test/soldier.test.ts` checks the points against the models and both hands on every gun in every pose. Look at it with `soldiers.html` (below).

## Tests

Everything under `vitest` is Node-only; there are no browser tests in the suite. Run Node suites on the home server with `remote-test` (see the global instructions), and anything that drives Chrome locally with `remote-test --local`.

- The full suite takes about 110 s on the home server. Its long pole is `packages/fps-core/test/balance.test.ts` (5,760 seeded bot duels, about 90 s there); next come the bot soaks (`apps/range/test/*-bots-*.test.ts`, one file per map and mode so they run in parallel, 8 to 20 s each). While iterating, run one file or one package (`npm run test:core`, `test:client`, `test:range`, `test:server`), and the whole suite once at the end.
- Shared test helpers live in each package's `test/support/` (bot soaks and nav reachability in `apps/range/test/support/bots.ts`).
- `apps/range/test/server-cpu.test.ts` and the benchmarks skip unless `BENCH=1`.
- `npm run typecheck` also typechecks every package's tests, which vitest itself never does.

## Driving the game in a browser

Use the scripts in `apps/range/scripts/` (`npm run bot-runs`, `record`, `bench`, `spots`, and `node apps/range/scripts/soldier-sheet.mjs`, which screenshots `soldiers.html`: every look holding each weapon through the poses and actions the game uses): they launch Chrome through `chrome.mjs`, headless and muted (`HEADED=1` shows it, `SOUND=1` unmutes it, `CHROME` names another browser). They expect the dev server (`npm run dev`, port 5173) and use the dev hooks: `?nolock`, and `globalThis.duty` (`game`, `driver`, `menu`, ...; `duty.game.player` is the local player).

- Open one page per Chrome; a second navigation in the same browser can hang at "Starting renderer".
- Editing the game's source while a scripted run is going makes Vite reload the page and fails that run. Change tests, docs and scripts meanwhile, and source after.
- A player who stands still is left alone by bots in humans vs bots, and in Charge the attackers escort a carrier who doesn't move: script movement (`MOVE=1` in `bot-runs`) before reading "no kills" as a bug.

## The desktop app

`desktop/` is the Windows app: an Electron window that opens the live game (see "Desktop app" in `README.md`). It has its own `package.json` and lockfile and sits outside the npm workspaces on purpose, so Electron's download stays out of the root install, the Docker build, CI's test job and `remote-test` installs. It imports nothing from the game; the game needs no change for it.

- `config.mjs` holds its decisions (which address, which links stay in the window) and `test/` checks them: `npm test` in `desktop/`, a second.
- `npm run smoke` in `desktop/` drives the app against a local server, hidden, muted and with pointer lock stubbed: run `npm run build` in the root first, then `remote-test --local npm run smoke --prefix desktop`. Screenshots land in `.scratch/desktop/`.
- The icon is rendered by `tools/icon/icon.py` in Blender into `desktop/build/icon.png`.
- `config.json` (the lobby address, from `DUTY_URL` or `gh variable get LOBBY_URL`) is generated and git-ignored.

## Releases

Every commit gets the next version tag above the highest one (`git tag --sort=-v:refname | head -1`): a patch for fixes and tidying, a minor for features. CI publishes `:vX.Y.Z` for a tag and moves `:latest` from `main`; the live lobby follows `:latest` unless the stack's `.env` pins `DUTY_IMAGE` (`docs/deploy.md`).
