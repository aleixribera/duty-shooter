# Duty Shooter

A browser FPS built to feel like Call of Duty: Modern Warfare (2019), on an authoritative 60 Hz server.

- **Arsenal:** seven primaries (the M4A1, the Wasp 9 SMG, the Harrow 12 shotgun, the Ridgeline .308 sniper rifle, the Bulwark 5.56 light machine gun, the Vantage 7.62 marksman rifle and the Trident 5.56 burst rifle), two secondaries (the Warden 9 pistol and the Marshal .357 revolver), a frag, a tactical (a smoke that nobody sees through, or a flash that whites out whoever looks at it) and a perk (Fast Hands, Soft Soles or Blast Vest). Players pick a loadout between lives.
- **Maps:** **Survival Town**, a 1950s test-site town of two houses facing each other across a cul-de-sac; **Switchyard**, a freight yard at dusk; and **Station Nine**, a test range's instrument station at dawn before a tower shot, built for the Slide, the Kick and the climbs. Survival Town and Station Nine end each match with a nuke; Switchyard ends it with a freight train.
- **Modes:** team deathmatch (75 kills or 10 minutes), free-for-all (30 kills or 10 minutes), Outposts (hold three zones; 200 points), Charge (plant or defuse; first to 4 rounds, no respawns within a round) and gun game (free-for-all up a ladder of seven of the nine guns dealt at random each match, 3 kills each before the next; the first to finish the last gun wins, or whoever is furthest up after 10 minutes). Any team mode can be played **humans vs bots**: every person on one team against a bot team sized to the group.
- **Online**, the first person in is the host: in the lobby they pick the map, mode, bots on or off and humans vs bots, and press Start. The Random button picks a map and mode while keeping the sides setting; humans vs bots draws from team modes. Bot Match has the same button. Bots fill each side to the map's team size: 6v6 on Switchyard and Station Nine (4v4 in Charge there), 4v4 on Survival Town (`TEAM_SIZES` in `apps/range/src/map/maps.ts`). The host can change it with the hidden **+** and **-** keys in the lobby, until the map or mode changes. Up to 12 seats, with bots filling them.
- **Offline**, **Bot Match** plays the match maps in any mode against bots, and the **Practice Range** has firing lanes, dummies and a movement course.

TypeScript, Three.js (WebGPU, with a WebGL2 fallback), Vite, Node 24.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The main menu flies over Survival Town; choose **Bot Match** or **Practice Range** to play offline. The first `npm run dev` bakes each map's lighting on the CPU (see below), which takes a little while; later starts reuse the cache.

The game has one graphics look: temporal anti-aliasing, ambient occlusion, bloom and one sun shadow map, at the screen's full density up to 1440p's worth of pixels. A match's weapons, soldiers and effects are fetched and compiled behind its loading screen, so play starts without stalls.

To play online locally:

1. Build the client and the server:

   ```bash
   npm run build
   ```

2. Start the server (`npm run server` builds it first):

   ```bash
   node apps/server/dist/main.js
   ```

   That runs a public lobby. The host picks the map and mode in the lobby; the environment sets where it starts and its limits. When the build left Zero Island's bot nav (`nav/zero-island.nav`) and bots are on, the main menu's **Battle Royale** screen plays in a process of the server's own (ADR 0009): the server starts it, from the same file, the first time the screen asks for it, hands it the players' connections under `/royale/`, and stops it after 3 minutes empty. Play Online plays on meanwhile. All are optional:

   | Variable | Default | |
   | --- | --- | --- |
   | `PASSPHRASE` | empty | Required to join; empty is a public lobby. |
   | `MAP` | `survival-town` | `survival-town`, `switchyard`, `station-nine`, `range` or `zero-island` (with bots it reads its nav from the built app in `STATIC_DIR`). |
   | `MODE` | `tdm` | `tdm`, `ffa`, `outposts`, `charge`, `gungame` or `battle-royale` (which plays only on `zero-island`, so `MAP` defaults to it, and needs its nav from `STATIC_DIR`). |
   | `SQUADS` | `1` | Seats a Squad in `battle-royale`: `1`, `2` or `3`. |
   | `TIME_LIMIT` | the mode's own | Seconds; Charge ignores it. |
   | `MAX_PLAYERS` | `12` | Seats, bots included. At most `32`, `60` with `NET=wide`. |
   | `BOTS_PER_TEAM` | `3` | Bots a side on a map with no team size of its own; `0` starts the lobby with bots off. At most `MAX_BOTS_PER_TEAM`. |
   | `MAX_BOTS_PER_TEAM` | `6` | The most a host may pick, at most `6` (`30` with `NET=wide`). Set both bot variables to `0` for no bots. |
   | `NET` | the mode's own | `wide` puts every mode on the provisional wide-map network profile (lower rate, relevance tiers) and its seat limits, for load tests. |
   | `PORT`, `HOST` | `3000`, `0.0.0.0` | Where it listens. |
   | `STATIC_DIR` | the built client | The files it serves. |
   | `EVENT_LOG` | none | A JSON-lines file of joins, leaves and matches. |
   | `LOG_STATS` | off | `1` prints CPU and memory every 10 s, with the slow ticks by cause. |
   | `SLOW_TICK_MS` | `8` | A tick this long logs a `slow {...}` line: each phase's milliseconds, the slowest bot, what happened, the collector's pauses during it, and a cause: `work:<phase>`, `gc:<kind>` or `stall` (the thread was off the CPU). |
   | `WARM_TICKS` | `2400` with `NET=wide` or `battle-royale`, else none | Ticks of a private match, after eight openings, played before it listens, so V8 has the tick compiled. |
   | `LOAD_TEST_SOCKETS` | off | Open sockets the machine itself may hold, for a load test on a server of its own. Everyone else stays at 12. |
   | `TRUSTED_PROXY` | none | Comma-separated addresses besides loopback whose `X-Forwarded-For` names the visitor: the proxy in front, such as Docker's network gateway behind Funnel (`docs/deploy.md`). Nobody else's header is believed. |
   | `DUTY_VERSION` | `dev` | The version `/healthz` reports. |

3. Open <http://localhost:3000>.

Dev URL parameters (the ones marked *dev* work only under `npm run dev`):

- `?map=<map>` (`range`, `survival-town`, `switchyard`, `station-nine`, `zero-island`) starts with that map behind the menu.
- `?explore=<map>` (`survival-town`, `switchyard`, `station-nine`, `range`, `zero-island`) walks a map alone, offline; *dev* `?at=x,z,yaw` moves that spawn.
- `?spot=<name>` puts the camera at one of the map's reference spots, menu and HUD hidden.
- `?bench` flies the benchmark path and reports frame times, GPU time (where the browser measures it), draw calls and triangles, in the game's one picture at the window's own resolution, uncapped.
- `?benchmark` opens the benchmark page, the one Settings > Video links to: it flies every map and shows each map's average and 1% low frame time, the adapter and the backend, and one line to copy. `&maps=<map>,<map>` flies only those maps and `&run` starts it without the click. A script reads the reports from `globalThis.duty.benchmark` once `document.body.dataset.benchmark` is `done`.
- `?hz=<n>` states the display's refresh rate instead of measuring it: a scripted browser draws unpaced, so the frame-rate cap has to be told what the display runs at.
- `?soldiers=near|mid|far` draws every soldier at that level whatever its distance (full, cheap animated, or the far stand-in), to look at a level up close.
- `?lod=off` draws a large map without its distance detail (soldier levels, far ground in blocks, far surfaces), to measure what that detail saves.
- `?plants=off` draws a map without its plants (their soft cover still hides from bots; rocks and trunks show as their plain solids), to measure what the plants cost.
- `?seed=<n>` plays every Local bots match on the same spawns and circles.
- `?stats` writes each second's mean draw calls and triangles and the renderer's live geometries and textures to `document.body.dataset.render`, for measuring a production build from a script.
- *dev* `?nolock` plays without pointer lock, for scripted browsers.
- *dev* `?matchtime=<s>` makes Bot Matches last that many seconds (in the modes with a clock), to reach their end and the lobby quickly.
- *dev* `?online` looks for a local server behind Vite's proxy (`/ws`, `/healthz`, `/status`, `/royale/`); a production build always does.
- `?viewer` opens the viewmodel viewer, which loops every first-person animation; `&weapon=<id>`, `&clip=<name>` and `&t=<s>` hold one weapon, clip or moment.
- `?webgl` forces the WebGL2 fallback.
- `#join=<passphrase>` is an invite link: it opens Play Online with the passphrase filled in.

In dev the page also exposes `globalThis.duty` (`game`, `map`, `renderer`, `sound`, `menu`, `driver`, `pacer`) for the console and for scripts.

## Desktop app

`desktop/` wraps the game in a Windows app, so it opens in its own window with a Start menu entry and a taskbar icon instead of a browser tab. The app is a window onto the live game: same page, same server, same updates, nothing copied. It opens the lobby's address (the `LOBBY_URL` repository variable, built in; when that is the arcade portal, the game's own address from the portal's `/api/live`). If the home server doesn't answer it opens the GitHub Pages copy (Bot Match and Practice Range), and if that fails too, a page that retries.

Install it from the latest release that has one: [Duty-Shooter-Setup.exe](https://github.com/aleixribera/duty-shooter/releases/latest/download/Duty-Shooter-Setup.exe). It installs for your user only, without an admin prompt. The installer isn't signed, so the first time Windows shows "Windows protected your PC": **More info**, then **Run anyway**. Uninstall it from Settings → Apps.

In the app, **F11** toggles fullscreen and **F5** reloads (for "The game was updated. Reload the page."). Everything else is the game's own controls. The app remembers its window size and keeps its own settings, so set your name and sensitivity once there.

```bash
cd desktop
npm install
npm start                                  # the app, on the live lobby
npm start -- --url=http://localhost:3000   # on a local server
npm run dist                               # dist/Duty-Shooter-Setup.exe
```

## Controls

These are MW2019's defaults, and every one can be rebound in Settings.

| Action | Key |
| --- | --- |
| Move | W A S D |
| Sprint | Shift, while moving forward: a press starts it and it keeps going; press again, let go of forward, fire or aim to stop |
| Crouch, or slide while sprinting | C |
| Prone | Ctrl |
| Jump or mantle | Space |
| Fire | Left mouse |
| Aim down sights | Right mouse |
| Reload | R |
| Inspect | Hold R with a full magazine |
| Melee | V |
| Switch weapon | Q, 1 / 2 or the mouse wheel |
| Frag | G |
| Tactical (smoke or flash) | E |
| Use (loadout station, plant, defuse) | F |
| Scoreboard | Tab |
| Island map (Battle Royale) | M |
| Menu | Esc |

To use a ladder, walk toward it from either end. Keep moving forward to climb, move backward to reverse, or jump to let go. You cannot fire while climbing.

### Controller

A PS4 controller (or any pad the browser reports with the standard mapping) works for menus and play. The stick turns slower over an enemy you can see (aim slowdown, never a pull toward one), and the pad rumbles to your shots, hits, hurts, blasts and hard landings. The layout follows MW2019's Default preset:

| Action | Button |
| --- | --- |
| Move and look | Left stick and right stick |
| Sprint | L3, while pushing forward: it keeps going until you click again, ease off the stick, fire or aim |
| Crouch, or slide while sprinting | Circle (hold to go prone) |
| Jump or mantle | Cross |
| Fire | R2 |
| Aim down sights | L2 |
| Reload | Square |
| Inspect | Hold Square with a full magazine |
| Melee | R3 |
| Switch weapon | Triangle |
| Frag | R1 |
| Tactical (smoke or flash) | D-pad down |
| Use (loadout station, plant, defuse) | L1 |
| Scoreboard | Touchpad |
| Island map (Battle Royale) | Share |
| Menu | Options |

The Tactical preset puts crouch on R3 and melee on Circle. Settings → Mouse and pad has the layout, stick sensitivity, ADS multiplier, deadzone, invert Y, aim slowdown and vibration strength. Browsers don't count controller buttons as user activation, so on a controller-only start the sound begins at the first click or key press.

### Changes from MW2019

- The reserve is unlimited (shown as ∞). You still reload the magazine.
- Sprinting doesn't cancel a reload.
- The defaults are mouse sensitivity 10, stick sensitivity 12 and FOV 90°. That's twice MW2019's sensitivity, and wider than its 80°. Saves made under the old defaults move to the new ones; values you changed yourself are kept.
- The view widens slightly while sprinting and sliding. Kills show an "Eliminated" or "Headshot" callout under the crosshair.

## Layout

- `packages/fps-core`: the headless, deterministic simulation shared by the client and the server. It covers movement (pmove), weapons and grenades, hit zones, lag compensation, netcode, the game modes, bots and the sourced stats file. It has no DOM, rendering or audio code.
- `packages/fps-client`: presentation and input. It covers rendering, the viewmodel, effects, synthesized audio, the HUD, menus and the client side of networking.
- `apps/range`: the maps (Survival Town, Switchyard, Station Nine and the Practice Range, as data the core never imports), the lighting bake and the page that runs the game. Switchyard's models are `public/models/switchyard.glb`, built by `tools/map/switchyard.py` in Blender; Station Nine's are `public/models/station-nine.glb`, built by `tools/map/station-nine.py`.
- `apps/server`: the authoritative server. It speaks WebSocket and also serves the built client.

`npm test` runs the fast tier in a few minutes: headless match tests (the real server and clients from `fps-core` over an in-memory network with latency, jitter and loss) and unit tests. `npm run test:soak` runs the soak tier, bots playing whole matches on each map and mode (the `*.soak.test.ts` files), and `npm run test:all` runs both, as CI does. `npm run typecheck` typechecks every package and its tests, and `npm run check` does that and the fast tier. `npm run test:core`, `test:client`, `test:range` and `test:server` run one package's fast tests.

Tools that drive the dev server in headless Chrome, muted (`npm run dev` first): `npm run bench` (frame times), `npm run spots` (reference screenshots), `npm run bot-runs -- <out dir>` (a Bot Match of every mode on both maps) and `npm run record -- <out dir>` (a gameplay clip). Each script's header says its arguments. On the server side, `npm run smoke -- <url>` checks a running server and `npm run load-test` measures one under 8 simulated players: bytes on the wire and the round trip (`docs/deploy.md` has more).

### Lighting bake

Each map's lighting (lightmaps and light probes) is baked on the CPU by a Vite plugin (`apps/range/bake/`) at build time and served as `bake/<map>.bin`. Both `npm run build` and the dev server reuse a cached bake (`node_modules/.cache/duty-bake`, keyed by the map's contents) and bake again only when the map changes; the dev server bakes a map on its first request. A missing bake draws the map without baked light, with a warning in the console.

### Status endpoint

The server answers `GET /status` with the lobby's map, mode, players, capacity, bots, humans vs bots and match phase, which the Play Online tile shows, and `GET /healthz` with its health, version, protocol and the people playing (`players`, Battle Royale's included, and `royalePlayers`). `GET /royale/status` is the Battle Royale process's lobby in the same shape, for the Battle Royale screen: `starting: true` while that process warms up, `royale: false` on a server without the island, and a 503 for 5 s after it crashed. Asking for it starts the process.

## Deploy

See [docs/deploy.md](docs/deploy.md). CI publishes a container image to GHCR, and the home server runs it with Compose behind Tailscale Funnel as the single public lobby. GitHub Pages hosts a copy for offline practice that links to that lobby. A version tag that changes `desktop/` also builds the Windows installer and attaches it to that tag's release (`.github/workflows/desktop.yaml`).
