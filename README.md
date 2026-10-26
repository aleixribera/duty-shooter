# Duty Shooter

A browser FPS built to feel like Call of Duty: Modern Warfare (2019). One weapon, the M4A1 with iron sights, on one original map. The map has a firing range, a movement course and a small arena. You can practise alone offline, or join the one public free-for-all lobby on an authoritative 60 Hz server.

TypeScript, Three.js (WebGPU, with a WebGL2 fallback), Vite, Node 24.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173> and choose **Play** for offline practice.

To play online locally:

1. Build the client and the server:

   ```bash
   npm run build
   ```

2. Start the server:

   ```bash
   node apps/server/dist/main.js
   ```

   That runs a public lobby. Set `PASSPHRASE=...` to require a passphrase instead.

3. Open <http://localhost:3000>.

`?viewer` opens the viewmodel viewer, which loops every first-person animation. `?webgl` forces the WebGL2 fallback, which caps the graphics preset at Normal.

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

## Layout

- `packages/fps-core`: the headless, deterministic simulation shared by the client and the server. It covers movement (pmove), the weapon, hit zones, lag compensation, netcode, game modes and the sourced stats file. It has no DOM, rendering or audio code.
- `packages/fps-client`: presentation and input. It covers rendering and presets, the viewmodel, effects, synthesized audio, the HUD, menus and the client side of networking.
- `apps/range`: the map and the page that runs the game.
- `apps/server`: the authoritative server. It speaks WebSocket and also serves the built client.

`npm test` runs the headless match tests: the real server and clients from `fps-core` over an in-memory network with latency, jitter and loss. `npm run typecheck` typechecks every package.

## Deploy

See [docs/deploy.md](docs/deploy.md). CI publishes a container image to GHCR, and the home server runs it with Compose behind Tailscale Funnel as the single public lobby. GitHub Pages hosts a copy for offline practice that links to that lobby.
