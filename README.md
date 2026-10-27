# Duty Shooter

A browser FPS built to feel like Call of Duty: Modern Warfare (2019). One weapon, the M4A1 with iron sights. The public lobby plays **Survival Town**, a small 1950s test-site town of two houses facing each other across a cul-de-sac, in team deathmatch (75 kills or 10 minutes) or free-for-all (30 kills or 10 minutes) on an authoritative 60 Hz server. Each match ends with the nuke, then a scoreboard and a vote on the next mode. Offline, you can walk Survival Town alone or warm up on the **Practice Range**, with its firing lanes, dummies and movement course.

TypeScript, Three.js (WebGPU, with a WebGL2 fallback), Vite, Node 24.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The main menu flies over Survival Town; choose **Practice Range** or **Explore Survival Town** to play offline. The first `npm run dev` bakes each map's lighting on the CPU (see below), which takes a little while; later starts reuse the cache.

To play online locally:

1. Build the client and the server:

   ```bash
   npm run build
   ```

2. Start the server:

   ```bash
   node apps/server/dist/main.js
   ```

   That runs a public lobby on Survival Town in team deathmatch. Set `PASSPHRASE=...` to require a passphrase, `MAP=range` for the range and `MODE=ffa` for free-for-all. The first player into an empty server picks the mode on the Play Online screen.

3. Open <http://localhost:3000>.

Dev URL parameters: `?map=<map>` (`range`, `switchyard`) starts with that map behind the menu, `?spot=<name>` puts the camera at one of the map's reference spots, `?bench` flies the benchmark path on every preset and reports frame times, draw calls and triangles, `?explore=<map>` (`survival-town`, `switchyard`, `range`) walks a map alone offline, `?at=x,z,yaw` moves that offline spawn, `?nolock` (dev only) plays without pointer lock for scripted browsers, and `?online` looks for a local server behind Vite's proxy. `?viewer` opens the viewmodel viewer, which loops every first-person animation. `?webgl` forces the WebGL2 fallback, which caps the graphics preset at Normal.

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
| Scoreboard | Touchpad |
| Menu | Options |

The Tactical preset puts crouch on R3 and melee on Circle. Settings → Controls has the layout, stick sensitivity, ADS multiplier, deadzone and invert Y. Browsers don't count controller buttons as user activation, so on a controller-only start the sound begins at the first click or key press.

### Changes from MW2019

- The reserve is unlimited (shown as ∞). You still reload the 30-round magazine.
- Sprinting doesn't cancel a reload.
- The defaults are mouse sensitivity 10, stick sensitivity 12 and FOV 90°. That's twice MW2019's sensitivity, and wider than its 80°. Saves made under the old defaults move to the new ones; values you changed yourself are kept.
- The view widens slightly while sprinting and sliding. Kills show an "Eliminated" or "Headshot" callout under the crosshair.

## Layout

- `packages/fps-core`: the headless, deterministic simulation shared by the client and the server. It covers movement (pmove), the weapon, hit zones, lag compensation, netcode, game modes and the sourced stats file. It has no DOM, rendering or audio code.
- `packages/fps-client`: presentation and input. It covers rendering and presets, the viewmodel, effects, synthesized audio, the HUD, menus and the client side of networking.
- `apps/range`: the maps (Survival Town and the Practice Range, as data the core never imports), the lighting bake and the page that runs the game.
- `apps/server`: the authoritative server. It speaks WebSocket and also serves the built client.

`npm test` runs the headless match tests: the real server and clients from `fps-core` over an in-memory network with latency, jitter and loss. `npm run typecheck` typechecks every package.

### Lighting bake

Each map's lighting (lightmaps and light probes) is baked on the CPU by a Vite plugin (`apps/range/bake/`) at build time and served as `bake/<map>.bin`. `npm run build` always bakes; the dev server bakes once and caches the result until the map changes. A missing bake draws the map without baked light, with a warning in the console.

### Status endpoint

The server answers `GET /status` with the lobby's map, mode, players, capacity and match phase, which the Play Online tile shows, and `GET /healthz` with its health and version.

## Deploy

See [docs/deploy.md](docs/deploy.md). CI publishes a container image to GHCR, and the home server runs it with Compose behind Tailscale Funnel as the single public lobby. GitHub Pages hosts a copy for offline practice that links to that lobby.
