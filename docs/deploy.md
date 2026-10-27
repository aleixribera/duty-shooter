# Deploying on the home server

The game runs as one container: the authoritative server, which also serves the built client and the WebSocket endpoint (`/ws`) on the same origin. CI builds the image and publishes it to GHCR. The home server pulls it by hand and runs it with Compose behind Tailscale Funnel on **HTTPS port 443**. The existing game on port 8443 is not touched.

The server runs **one public lobby** on Survival Town, in team deathmatch by default, that everyone with the link joins with just a name, the same model as the existing game. `MAP` (`survival-town` or `range`) and `MODE` (`tdm` or `ffa`) in the stack's `.env` change the map and the starting mode; after each match the players vote on the next mode. Setting `PASSPHRASE` in the stack's `.env` turns it into a private server instead, where every player types the passphrase.

Nothing secret lives in this repository. The player cap (and a passphrase, if you set one) are in the stack's `.env` on the server, and the public address lives only in the server's Funnel setup and a repository variable.

## How the image is built

`.github/workflows/container.yaml` runs on every push to `main` (and on `v*` tags or by hand). It:

1. Installs, typechecks and runs the test suite, and validates `compose.yaml`.
2. Builds the image, runs it read-only with all capabilities dropped and checks it with `apps/server/scripts/smoke.mjs`. It runs two containers: one as a public lobby and one with a passphrase. The smoke test covers the page, `/healthz`, a join to the public lobby, a join with the passphrase, a rejected wrong passphrase, a refused cross-site socket and the passphrase lockout.
3. Publishes `ghcr.io/aleixribera/duty-shooter:latest` and `:sha-<commit>` for amd64 and arm64.

The first time, make the package public (or log the server in to GHCR): GitHub → your profile → Packages → `duty-shooter` → Package settings → Change visibility.

## First install

On the server (`ssh homelab`):

```bash
mkdir -p /opt/homelab/stacks/duty-shooter
cd /opt/homelab/stacks/duty-shooter
curl -fLO https://raw.githubusercontent.com/aleixribera/duty-shooter/main/compose.yaml
curl -fL -o .env https://raw.githubusercontent.com/aleixribera/duty-shooter/main/.env.example
chmod 600 .env
nano .env        # optional: MAX_PLAYERS; leave PASSPHRASE empty for the public lobby
docker compose pull
docker compose up -d --wait
curl -fsS -w '\n' http://127.0.0.1:3090/healthz
```

The health response looks like `{"status":"ok","players":0,"maxPlayers":8,"public":true,"version":"v1.2.0"}`. The page reads `public` to decide whether the join screen asks for a passphrase. `GET /status` reports `{"map":"survival-town","mode":"tdm","players":0,"capacity":8,"phase":"playing"}` for the main menu's Play Online tile.

The image's build stage bakes each map's lighting on the CPU, so a build takes a few minutes longer than the client alone. It runs on the builder's own platform, not under emulation.

The container listens on 3000 inside and is published on **127.0.0.1:3090** only. Pick another host port with `DUTY_PORT` in `.env` if 3090 is taken. The existing game uses 3080.

The server limits each visitor's address to 12 open sockets and, with a passphrase set, 10 wrong passphrases. After the tenth wrong passphrase, that address is refused for 10 minutes. Funnel connects from loopback and names the visitor in `X-Forwarded-For`, which the server trusts from loopback only.

Hardening, the same as the existing game: localhost-only binding, read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, a 512 MB memory limit, `init`, and log rotation (3 × 10 MB). The server needs no writable paths.

## Publish on Funnel port 443

Look at the current mappings first, so nothing else is replaced:

```bash
sudo tailscale serve status
sudo tailscale funnel status
```

The existing game is on `:8443`. Add this game on 443 as a separate mapping:

```bash
sudo tailscale funnel --bg --https=443 http://127.0.0.1:3090
sudo tailscale funnel status
```

`funnel status` should now list both `:443` (this game) and `:8443` (the existing game). The public link is `https://<machine>.<tailnet>.ts.net/`, using the name Tailscale prints. Check it from a phone on mobile data with Tailscale off. WebSockets go through Funnel without extra setup.

To remove only this mapping later:

```bash
sudo tailscale funnel --https=443 off
```

## Updating

Updates are automatic. A push to `main` publishes a new image in about 3 minutes. The home server's `game-autoupdate` timer (in the `homelab-stacks` repo, `game-autoupdate/`) checks every 3 minutes. When the image changed **and the lobby is empty**, it recreates the container and waits for the health check. A new image that fails the check is rolled back. While anyone is playing, the update waits for a later check, so an update never ends a match.

```bash
journalctl --user -u game-autoupdate -n 50 --no-pager   # updates, waits and failures
systemctl --user start game-autoupdate.service          # check now
```

The Homepage "Update Containers" button (`docker-updater`) also pulls and restarts every stack immediately, whoever is playing. To update by hand:

```bash
cd /opt/homelab/stacks/duty-shooter
docker compose pull
docker compose up -d --wait
```

Players reload the page after an update. A page from an older build is refused with "The game was updated. Reload the page."

To change the player cap or set a passphrase, edit `.env` and run `docker compose up -d --wait`. No rebuild is needed.

## The GitHub Pages copy

`.github/workflows/pages.yaml` publishes the client alone to `https://aleixribera.github.io/duty-shooter/` on every push to `main`. That copy has no server, so its main menu offers Practice Range and Explore Survival Town and hides Play Online; a small link under the title opens the home server's public lobby instead.

The link comes from the `LOBBY_URL` repository variable (Settings → Secrets and variables → Actions → Variables), so the address is never committed:

```bash
gh variable set LOBBY_URL --body 'https://<machine>.<tailnet>.ts.net/'
```

Pages must be set to deploy from GitHub Actions (Settings → Pages → Source: GitHub Actions). Without `LOBBY_URL`, the copy shows offline practice only.

## Operating

```bash
docker compose logs --tail=100 -f duty
docker compose restart duty
docker compose down
```

For load numbers in the logs, add `LOG_STATS: "1"` under `environment` in `compose.yaml`. The server then prints CPU and memory every 10 s.

## Measured load

`apps/server/scripts/load-test.mjs` starts the built server and connects 8 simulated players. Each one moves, turns and fires at 60 Hz. Results on the development PC (Windows 11, Node 24):

- CPU: 5 to 9 % of one core.
- Memory: about 72 MB RSS (14 to 17 MB of heap).
- Snapshots: a steady 60 per second to every client.

Re-run it with:

```bash
npm run build -w @duty-shooter/server
cd apps/server && node scripts/load-test.mjs 8 40
```

## Running locally

```bash
npm run build -w @duty-shooter/range
npm run build -w @duty-shooter/server
PASSPHRASE=dev node apps/server/dist/main.js
```

Then open <http://localhost:3000>. For client development with hot reload, keep the server running and use `npm run dev`. Vite proxies `/ws` and `/healthz` to port 3000.
