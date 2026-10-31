# Deploying on the home server

The game runs as one container: the authoritative server, which also serves the built client and the WebSocket endpoint (`/ws`) on the same origin. CI builds the image and publishes it to GHCR. The home server pulls it by hand and runs it with Compose behind Tailscale Funnel on **HTTPS port 443**. The existing game on port 8443 is not touched.

The server runs **one public lobby** of up to 12 players (`MAX_PLAYERS`), in team deathmatch on Survival Town by default, that everyone with the link joins with just a name. The first person in is the host: in the lobby they pick the mode, the map (Survival Town or Switchyard, both held by the server), bots on or off (filling each side to the map's team size: 6v6 on Switchyard, 4v4 on Survival Town, capped by `MAX_BOTS_PER_TEAM`, default 6) or humans vs bots, and press Start; after every match everyone goes back to the lobby. `MAP` (`survival-town`, `switchyard` or `range`) and `MODE` (`tdm`, `ffa`, `outposts` or `charge`) in the stack's `.env` set the first map and mode, `TIME_LIMIT` (seconds) shortens every match, and `BOTS_PER_TEAM` (default 3) is the fill on a map without a team size of its own (0 starts the lobby with bots off): a person joining takes a bot's seat, and the bots leave with the last person, so an empty lobby stays empty. For no bots at all, set both `BOTS_PER_TEAM` and `MAX_BOTS_PER_TEAM` to 0 (the server refuses to start with a fill above the cap). Setting `PASSPHRASE` in the stack's `.env` turns it into a private server instead, where every player types the passphrase.

Nothing secret lives in this repository. The player cap (and a passphrase, if you set one) are in the stack's `.env` on the server, and the public address lives only in the server's Funnel setup and a repository variable.

## How the image is built

`.github/workflows/container.yaml` runs on every push to `main` (and on `v*` tags or by hand). It:

1. Installs, typechecks and runs the test suite, and validates `compose.yaml`.
2. Builds the image, runs it read-only with all capabilities dropped and checks it with `apps/server/scripts/smoke.mjs`. It runs two containers: one as a public lobby and one with a passphrase. The smoke test covers the page, `/healthz`, a join to the public lobby, a join with the passphrase, a rejected wrong passphrase, a refused cross-site socket and the passphrase lockout.
3. Publishes the image for amd64 and arm64: a push to `main` as `:latest`, a version tag `vX.Y.Z` as `:vX.Y.Z`, and both as `:sha-<commit>`. Only `main` moves `:latest`, so a release that pushes a commit and its tag together restarts the lobby once.

The smoke test joins with the protocol `/healthz` reports. From v1.3.1 to v1.3.8 it sent a hard-coded protocol number that the protocol bump had left behind, every release failed the smoke step, and the live lobby stayed on v1.3.0 while main moved on.

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

The health response looks like `{"status":"ok","players":0,"maxPlayers":12,"public":true,"version":"v2.0.0","protocol":7}`. The page reads `public` to decide whether the join screen asks for a passphrase. `GET /status` reports `{"map":"survival-town","mode":"tdm","players":0,"away":0,"capacity":12,"phase":"lobby","bots":0,"botsPerTeam":3,"maxBotsPerTeam":6,"lobby":true,"hvb":false}` for the main menu's Play Online tile.

The image's build stage bakes each map's lighting on the CPU, so a build takes a few minutes longer than the client alone. It runs on the builder's own platform, not under emulation.

The container listens on 3000 inside and is published on **127.0.0.1:3090** only. Pick another host port with `DUTY_PORT` in `.env` if 3090 is taken. The existing game uses 3080.

The server limits each visitor's address to 12 open sockets and, with a passphrase set, 10 wrong passphrases. After the tenth wrong passphrase, that address is refused for 10 minutes. Funnel connects from loopback and names the visitor in `X-Forwarded-For`, which the server trusts from loopback only.

Hardening, the same as the existing game: localhost-only binding, read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, a 512 MB memory limit, `init`, and log rotation (3 × 10 MB). The only writable path is `/data`, the `duty-data` named volume that holds the event log.

The game also comes first on the box: none of its memory goes to swap (`memswap_limit` equal to the limit) and it has eight times the default CPU shares, so the other services, a transcription or a test run can't hold up its 60 Hz loop. A `compose.yaml` change reaches the server only by copying the file there (the auto-updater pulls images, not the stack), then `docker compose up -d --wait`.

## Bandwidth and ping

The server sends every player a snapshot 60 times a second, fewer on a link that can't take them (down to 10 a second, judged by how old the client's newest snapshot is). Scores, names, pings and the match state go only when they change. Snapshots are WebSocket-compressed (permessage-deflate, which browsers handle on their own): a full lobby's snapshot is about 7 KB of JSON and about 0.5 KB on the wire, so 12 players take about 3.2 Mbit/s of the home upload instead of 40. The page, the code and the models go brotli- or gzip-compressed too, compressed once on first request and kept in memory.

`npm run load-test` measures a server under scripted players: snapshots, bytes on the wire and the round trip from a usercmd to its acknowledgement, overall and for each player. Load the live lobby while it is empty, and run the players from the home server itself, where nothing else competes with them:

```bash
remote-test "TARGET=http://127.0.0.1:3090 node apps/server/scripts/load-test.mjs 12 40"
```

Its seats are then held for five minutes, as for anyone who drops. On 2026-10-31 a local server on the same machine gave, for 12 players on Survival Town: 60 snapshots a second to each, 16.6 ms apart (p99 22 ms, max 33 ms), a usercmd round trip of p50 14 ms and p99 47 ms, 3.2 Mbit/s out of the server, 45% of a core and 158 MB. The same test run from a PC busy with other work (headless browsers from agent sessions) reported seconds of delay, all of it the scripted players falling behind, not the server; a person playing on such a PC sees a high ping for the same reason, since the game counts ping in its own frames. Through Funnel each round trip also crosses Tailscale's relay (Madrid, 50 to 150 ms for a fresh connection).

Two more scripts start their own server, so never point them at the live lobby. Build the server first.

- `apps/server/scripts/bad-link.mjs [clients] [seconds] [scenario,...]` plays one client through a proxy with real latency, jitter, a narrow pipe or stalls, and reports snapshot age and input round trip.
- `apps/server/scripts/hostile.mjs` sends what a broken or hostile client might and reports whether the server survives each.

Run them with `remote-test`, and keep `STATIC_DIR` away from the repo root: precompressing all of it takes over the server for a minute and spoils the numbers. `LOG_STATS=1` adds tick cost and late ticks to the CPU and memory lines.

## The event log and the play report

The server appends one JSON line to `/data/events.jsonl` for every person or bot joining (`join`) and leaving (`leave`), every match starting (`matchStart`) and ending (`matchEnd`, with its length and result), and each server start (`serverStart`). Every line has the time, and joins and leaves say whether it was a bot (`bot`) or the smoke or load-test script (`script`). The same lines go to `docker compose logs`. The volume outlives the container, so redeploys keep the history.

The play report reads the log and prints sessions per day, the peak of people at once, matches finished, and the time played by people and by bots. Script players are left out.

```bash
cd /opt/homelab/stacks/duty-shooter
docker compose exec duty node server/report.mjs
```

## Pinning the live version

The stack's `.env` can pin the image with `DUTY_IMAGE`. With a pin, `docker compose pull` and the auto-updater keep the container on that image whatever CI publishes.

During the v2 arc (from 2026-10-27), the live lobby is pinned to the v1.3.9 image by digest, because v1.3.9 predates version-tagged images:

```bash
DUTY_IMAGE=ghcr.io/aleixribera/duty-shooter@sha256:6e38d814af6b4eb63d6266ac3135619cb9e8f480992bf3cfd1a458f086dbf215
```

Every ticket of the arc is still tagged and published (`:vX.Y.Z`), but none of them reaches the lobby.

**Releasing v2.0.0** is one step: set the line back to `DUTY_IMAGE=ghcr.io/aleixribera/duty-shooter:latest` (or delete it) and run `docker compose up -d --wait`. To pin any later release instead, use its tag, for example `DUTY_IMAGE=ghcr.io/aleixribera/duty-shooter:v2.0.0`.

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

Updates are automatic unless the image is pinned (see above). A push to `main` publishes a new image in about 3 minutes. The home server's `game-autoupdate` timer (in the `homelab-stacks` repo, `game-autoupdate/`) checks every 3 minutes. When the image changed **and the lobby is empty**, it recreates the container (forced, so the new image always takes) and waits for the health check. A new image that fails the check is rolled back. While anyone is playing, the update waits for a later check, so an update never ends a match. A player whose client goes silent for 60 s (a background tab or a minimised window, where the browser stops the game's frame loop) is let go, so a forgotten tab doesn't hold an update back.

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

`.github/workflows/pages.yaml` publishes the client alone to `https://aleixribera.github.io/duty-shooter/` on every push to `main`. That copy has no server, so its main menu offers Bot Match and Practice Range and hides Play Online; a small link under the title opens the home server's public lobby instead.

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

`apps/server/scripts/load-test.mjs` starts the built server and connects simulated players. Each one moves, turns and fires at 60 Hz. Results on the home server (2026-10-31, Node 24, 12 players):

- CPU: 41 to 47 % of one core, compression included.
- Memory: about 158 MB RSS (22 to 36 MB of heap).
- Tick: about 3 ms of the 16.7 ms budget, 7.6 ms at worst, none late.
- Snapshots: a steady 60 per second to every client.

Re-run it with:

```bash
npm run build -w @duty-shooter/server
remote-test "node apps/server/scripts/load-test.mjs 12 40"
```

## Running locally

```bash
npm run build -w @duty-shooter/range
npm run build -w @duty-shooter/server
PASSPHRASE=dev node apps/server/dist/main.js
```

Then open <http://localhost:3000>. For client development with hot reload, keep the server running, use `npm run dev` and open <http://localhost:5173/?online>: Vite proxies `/ws`, `/healthz` and `/status` to port 3000, and a dev page looks for the server only with `?online`.
