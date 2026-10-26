# Deploying on the home server

The game runs as one container: the authoritative server, which also serves the built client and the WebSocket endpoint (`/ws`) on the same origin. CI builds the image and publishes it to GHCR. The home server pulls it by hand and runs it with Compose behind Tailscale Funnel on **HTTPS port 443**. The existing game on port 8443 is not touched.

Nothing secret lives in this repository. The passphrase and player cap are in the stack's `.env` on the server.

## How the image is built

`.github/workflows/container.yaml` runs on every push to `main` (and on `v*` tags or by hand). It:

1. Installs, typechecks and runs the test suite, and validates `compose.yaml`.
2. Builds the image, runs it read-only with all capabilities dropped and checks it with `apps/server/scripts/smoke.mjs`. The smoke test covers the page, `/healthz`, a join, a rejected wrong passphrase and a refused cross-site socket.
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
nano .env        # set PASSPHRASE (and MAX_PLAYERS if you want)
docker compose pull
docker compose up -d --wait
curl -fsS -w '\n' http://127.0.0.1:3090/healthz
```

The health response is `{"status":"ok","players":0,"maxPlayers":8}`.

The container listens on 3000 inside and is published on **127.0.0.1:3090** only. Pick another host port with `DUTY_PORT` in `.env` if 3090 is taken. The existing game uses 3080.

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

Updates are pulled by hand. Do it when nobody is playing: restarting ends the match.

```bash
cd /opt/homelab/stacks/duty-shooter
curl -fsS http://127.0.0.1:3090/healthz   # players should be 0
docker compose pull
docker compose up -d --wait
```

Players reload the page after an update. A page from an older build is refused with "The game was updated. Reload the page."

To change the passphrase or player cap, edit `.env` and run `docker compose up -d --wait`. No rebuild is needed.

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
