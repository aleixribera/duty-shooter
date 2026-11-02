# Every Funnel visitor shares one address: 12 sockets and the join lockout for everyone

Status: resolved
Release: v2.108.5, v2.108.8
Severity: S2 (playing with friends breaks: the 13th socket from anyone outside is refused)
Found by: 35

On the live server every outside visitor arrives as the Docker bridge gateway, `172.28.0.1`, so they all share one `AddressGuard` budget of 12 sockets and one failed-passphrase lockout. Play Online and Battle Royale both use `clientAddress()`, so both are affected.

## Repro
1. Check `https://aleix.tailfef0f7.ts.net:10000/healthz` shows no players.
2. From one machine, hold 12 unjoined sockets open to `wss://aleix.tailfef0f7.ts.net:10000/ws` (`node .scratch/battle-royale/bugs/funnel-share.mjs 12`).
3. From a second machine with a different address (the homelab, Tailscale 100.95.233.56), open one more socket through the same public URL.

Expected: the second machine gets 101 (its own budget). Actual: HTTP 429.

## Evidence
- With the 12 held from this PC, the homelab got **429**. Controls with nothing held gave **101** from each machine alone.
- The container's `/proc/net/tcp` listed all 12 peers as `01001CAC` = **172.28.0.1**, the bridge gateway that docker-proxy (PID 2099973, `127.0.0.1:3090->3000`) connects from.
- `clientAddress()` (`apps/server/src/server.ts` ~178-245) trusts `X-Forwarded-For` only when the peer is loopback. Inside the container the peer is 172.28.0.1, so the header Funnel sends is ignored.
- `docs/deploy.md` is stale: line 3 and lines 106-127 say HTTPS port 443 (the game is on :10000), and line 43 says "Funnel connects from loopback", which is false inside Docker.

## Suspected area
`apps/server/src/server.ts` `isLoopback`/`clientAddress`/`AddressGuard`, and the compose file. Options: trust the forwarded header from the configured proxy address (a setting naming the gateway), `network_mode: host`, or disabling the userland proxy. Fix the deploy doc with it.

## Comments

- Cause: `clientAddress()` believed `X-Forwarded-For` from loopback only, but inside the container every connection comes from docker-proxy on the network's gateway `172.28.0.1`, so the header Funnel sends was dropped and every visitor was keyed as `172.28.0.1`.
- Fix: `TRUSTED_PROXY` (comma-separated IPs) names the peers besides loopback whose header is believed; `compose.yaml` sets it to `172.28.0.1`, the gateway of `duty-shooter_default`. The server counts the header's *last* entry (the one the trusted proxy added), and falls back to the peer when that entry isn't an IP. `X-Forwarded-Host` for the origin check follows the same trust.
- Chose an explicit setting over `network_mode: host` (would put port 3000 on the host's interfaces and change the hardening) and over auto-detecting the default gateway (an implicit trust a non-Docker deployment would inherit by accident).
- Deploy, 2026-11-02: v2.108.5 first also pinned the network's subnet in `compose.yaml`. `docker compose down` then couldn't recreate the network, because the `homepage` and `portal` stacks join `duty-shooter_default` as an external network, and the game was down for about 30 s (nobody playing; `/healthz` showed 0 first). I rolled the server's compose back at once and it came up healthy. The pin is gone (v2.108.8): the existing network keeps 172.28.0.1, and if it is ever recreated on another subnet the header is ignored again rather than trusted from the wrong peer. The server's compose has `oom_score_adj: -500`, which the repo doesn't, so only the `TRUSTED_PROXY` line was added there, by hand.
- Live after (v2.108.5 image, `TRUSTED_PROXY=172.28.0.1`): with this PC holding 12 sockets through the public URL, the homelab got **101** and this PC's 13th got **429**, on `/ws` and on `/royale/ws`. 12 sockets from this PC, each forging a different `X-Forwarded-For`, still counted as one visitor (13th 429, homelab 101). Script: `.scratch/battle-royale/t36/hold.mjs`.
- Docs: `docs/deploy.md` now says port 10000, explains the gateway, and the one-time `down`/`up` the pinned subnet needs; README lists `TRUSTED_PROXY`.
- Regression test: `apps/server/test/trusted-proxy.test.ts` uses `127.0.0.2` as the proxy (a non-loopback peer to `isLoopback`), red before the fix (the second visitor got 0 of 1 sockets).
- Repro before (2026-11-02 18:15, live v2.108.3): homelab alone 101; with this PC holding 12 through the public URL, homelab 429.
