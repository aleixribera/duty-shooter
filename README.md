# Duty Shooter

A browser FPS built to feel like Call of Duty: Modern Warfare (2019), on an authoritative 60 Hz server.

- **Arsenal:** four primaries (the M4A1, the Wasp 9 SMG, the Harrow 12 shotgun and the Ridgeline .308 sniper rifle), the Warden 9 pistol as a secondary, and a frag. Players pick a loadout between lives.
- **Maps:** **Survival Town**, a 1950s test-site town of two houses facing each other across a cul-de-sac, and **Switchyard**, a freight yard at dusk. Survival Town ends each match with a nuke; Switchyard ends it with a freight train.
- **Modes:** team deathmatch (75 kills or 10 minutes), free-for-all (30 kills or 10 minutes), Outposts (hold three zones; 200 points), Charge (plant or defuse; first to 4 rounds, no respawns within a round) and gun game (free-for-all up a ladder of ten weapon levels, every kill the next gun; the first kill on the last pistol wins, or the highest level after 10 minutes). Any team mode can be played **humans vs bots**: every person on one team against a bot team sized to the group.
- **Online**, the first person in is the host: in the lobby they pick the map, mode, bots on or off and humans vs bots, and press Start. Bots fill each side to the map's team size: 6v6 on Switchyard, 4v4 on Survival Town (`TEAM_SIZES` in `apps/range/src/map/maps.ts`). The host can change it with the hidden **+** and **-** keys in the lobby, until the map or mode changes. Up to 12 seats, with bots filling them.
- **Offline**, **Bot Match** plays either map in any mode against bots, and the **Practice Range** has firing lanes, dummies and a movement course.

TypeScript, Three.js (WebGPU, with a WebGL2 fallback), Vite, Node 24.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The main menu flies over Survival Town; choose **Bot Match** or **Practice Range** to play offline. The first `npm run dev` bakes each map's lighting on the CPU (see below), which takes a little while; later starts reuse the cache.

In Settings, **Medium** is the default graphics preset and the standard look: temporal anti-aliasing, ambient occlusion, bloom and one sun shadow map, at the screen's full density up to 1440p's worth of pixels. **Low** is for integrated graphics: FXAA instead of temporal AA, no ambient occlusion or bloom, a smaller shadow map redrawn 30 times a second, at most 1080p's worth of pixels, and it lowers the resolution further to hold the frame rate. **High** is for fast GPUs: full-resolution ambient occlusion, three shadow cascades, denser smoke, and it supersamples (half again the screen's density, up to 4K's worth of pixels). Medium and High never lower the resolution on their own. A match's weapons, soldiers and effects are fetched and compiled behind its loading screen, so play starts without stalls.

To play online locally:

1. Build the client and the server:

   ```bash
   npm run build
   ```

2. Start the server (`npm run server` builds it first):

   ```bash
   node apps/server/dist/main.js
   ```

   That runs a public lobby. The host picks the map and mode in the lobby; the environment sets where it starts and its limits. All are optional:

   | Variable | Default | |
   | --- | --- | --- |
   | `PASSPHRASE` | empty | Required to join; empty is a public lobby. |
   | `MAP` | `survival-town` | `survival-town`, `switchyard` or `range`. |
   | `MODE` | `tdm` | `tdm`, `ffa`, `outposts`, `charge` or `gungame`. |
   | `TIME_LIMIT` | the mode's own | Seconds; Charge ignores it. |
   | `MAX_PLAYERS` | `12` | Seats, bots included. |
   | `BOTS_PER_TEAM` | `3` | Bots a side on a map with no team size of its own; `0` starts the lobby with bots off. At most `MAX_BOTS_PER_TEAM`. |
   | `MAX_BOTS_PER_TEAM` | `6` | The most a host may pick. Set both bot variables to `0` for no bots. |
   | `PORT`, `HOST` | `3000`, `0.0.0.0` | Where it listens. |
   | `STATIC_DIR` | the built client | The files it serves. |
   | `EVENT_LOG` | none | A JSON-lines file of joins, leaves and matches. |
   | `LOG_STATS` | off | `1` prints CPU and memory every 10 s. |
   | `DUTY_VERSION` | `dev` | The version `/healthz` reports. |

3. Open <http://localhost:3000>.

Dev URL parameters (the ones marked *dev* work only under `npm run dev`):

- `?map=<map>` (`range`, `switchyard`) starts with that map behind the menu.
- `?explore=<map>` (`survival-town`, `switchyard`, `range`) walks a map alone, offline; *dev* `?at=x,z,yaw` moves that spawn.
- `?spot=<name>` puts the camera at one of the map's reference spots, menu and HUD hidden.
- `?bench` flies the benchmark path on every preset and reports frame times, draw calls and triangles.
- *dev* `?nolock` plays without pointer lock, for scripted browsers.
- *dev* `?online` looks for a local server behind Vite's proxy (`/ws`, `/healthz`, `/status`); a production build always does.
- `?viewer` opens the viewmodel viewer, which loops every first-person animation; `&weapon=<id>`, `&clip=<name>` and `&t=<s>` hold one weapon, clip or moment.
- `?webgl` forces the WebGL2 fallback, which caps the graphics preset at Medium.
- `#join=<passphrase>` is an invite link: it opens Play Online with the passphrase filled in.

In dev the page also exposes `globalThis.duty` (`game`, `map`, `renderer`, `sound`, `menu`, `driver`) for the console and for scripts.

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
| Sprint | Shift (double-tap for tactical sprint) |
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
| Use (loadout station, plant, defuse) | F |
| Scoreboard | Tab |
| Menu | Esc |

### Controller

A PS4 controller (or any pad the browser reports with the standard mapping) works for menus and play, with no aim assist. The layout follows MW2019's Default preset:

| Action | Button |
| --- | --- |
| Move and look | Left stick and right stick |
| Sprint | L3, while pushing forward (click twice for tactical sprint) |
| Crouch, or slide while sprinting | Circle (hold to go prone) |
| Jump or mantle | Cross |
| Fire | R2 |
| Aim down sights | L2 |
| Reload | Square |
| Inspect | Hold Square with a full magazine |
| Melee | R3 |
| Switch weapon | Triangle |
| Frag | R1 |
| Use (loadout station, plant, defuse) | L1 |
| Scoreboard | Touchpad |
| Menu | Options |

The Tactical preset puts crouch on R3 and melee on Circle. Settings → Controls has the layout, stick sensitivity, ADS multiplier, deadzone and invert Y. Browsers don't count controller buttons as user activation, so on a controller-only start the sound begins at the first click or key press.

### Changes from MW2019

- The reserve is unlimited (shown as ∞). You still reload the magazine.
- Sprinting doesn't cancel a reload.
- The defaults are mouse sensitivity 10, stick sensitivity 12 and FOV 90°. That's twice MW2019's sensitivity, and wider than its 80°. Saves made under the old defaults move to the new ones; values you changed yourself are kept.
- The view widens slightly while sprinting and sliding. Kills show an "Eliminated" or "Headshot" callout under the crosshair.

## Layout

- `packages/fps-core`: the headless, deterministic simulation shared by the client and the server. It covers movement (pmove), weapons and grenades, hit zones, lag compensation, netcode, the game modes, bots and the sourced stats file. It has no DOM, rendering or audio code.
- `packages/fps-client`: presentation and input. It covers rendering and presets, the viewmodel, effects, synthesized audio, the HUD, menus and the client side of networking.
- `apps/range`: the maps (Survival Town, Switchyard and the Practice Range, as data the core never imports), the lighting bake and the page that runs the game. Switchyard's models are `public/models/switchyard.glb`, built by `tools/map/switchyard.py` in Blender.
- `apps/server`: the authoritative server. It speaks WebSocket and also serves the built client.

`npm test` runs every test: headless match tests (the real server and clients from `fps-core` over an in-memory network with latency, jitter and loss), bots playing whole matches on each map, and unit tests. `npm run typecheck` typechecks every package and its tests, and `npm run check` does both. `npm run test:core`, `test:client`, `test:range` and `test:server` run one package's tests.

Tools that drive the dev server in headless Chrome, muted (`npm run dev` first): `npm run bench` (frame times), `npm run spots` (reference screenshots), `npm run bot-runs -- <out dir>` (a Bot Match of every mode on both maps) and `npm run record -- <out dir>` (a gameplay clip). Each script's header says its arguments. On the server side, `npm run smoke -- <url>` checks a running server and `npm run load-test` measures one under 8 simulated players: bytes on the wire and the round trip (`docs/deploy.md` has more).

### Lighting bake

Each map's lighting (lightmaps and light probes) is baked on the CPU by a Vite plugin (`apps/range/bake/`) at build time and served as `bake/<map>.bin`. Both `npm run build` and the dev server reuse a cached bake (`node_modules/.cache/duty-bake`, keyed by the map's contents) and bake again only when the map changes; the dev server bakes a map on its first request. A missing bake draws the map without baked light, with a warning in the console.

### Status endpoint

The server answers `GET /status` with the lobby's map, mode, players, capacity, bots, humans vs bots and match phase, which the Play Online tile shows, and `GET /healthz` with its health, version and protocol.

## Deploy

See [docs/deploy.md](docs/deploy.md). CI publishes a container image to GHCR, and the home server runs it with Compose behind Tailscale Funnel as the single public lobby. GitHub Pages hosts a copy for offline practice that links to that lobby. A version tag that changes `desktop/` also builds the Windows installer and attaches it to that tag's release (`.github/workflows/desktop.yaml`).
