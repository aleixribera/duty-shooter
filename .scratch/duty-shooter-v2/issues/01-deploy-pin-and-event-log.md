# 01 Ticket zero: the deploy, the image pin, the event log and the play report

Status: resolved
Release: v1.4.0
Spec: ../spec.md (The deploy and the event log)

## What
- Find why live ran v1.3.0 while main was at v1.3.9, fix at the source.
- CI publishes :vX.Y.Z for version tags; only main publishes :latest.
- Pin the server's DUTY_IMAGE to the v1.3.9 image for the arc; document the v2.0.0 unpin step.
- Event log: one JSON line per join/leave/matchStart/matchEnd on a named volume (+stdout); script players marked.
- Play report script.

## Comments

**Cause of the stale lobby (2026-10-27).** The protocol went to 5 but `apps/server/scripts/smoke.mjs` and `load-test.mjs` still joined with a hard-coded 4. CI's smoke step joins the built container before publishing, so every release from v1.3.1 to v1.3.8 failed there and no image was published; the auto-updater correctly kept v1.3.0. v1.3.9 fixed the number by hand. Fixed at the source: `/healthz` now reports `protocol`, and both scripts join with whatever it says, so a protocol bump can't strand them again (the scripts test checks no number is hard-coded).

**Two smaller faults found on the way.**
- Both the `main` push and the tag push of a release published `:latest`, two different builds of the same commit, so the lobby restarted twice per release. Now only `main` moves `:latest`; a `vX.Y.Z` tag publishes `:vX.Y.Z` (both push `:sha-<commit>`).
- The home server's `game-autoupdate.sh` (homelab-stacks) found a new image but `docker compose up` sometimes kept the old container (the containerd image store): the log said "updating to 4a6c… (was 5b74…)" every 3 minutes. It now passes `--force-recreate`. Committed in homelab-stacks as f88446f.

**Pin.** v1.3.9 has no version-tagged image, so the stack's `.env` on the server pins it by digest: `DUTY_IMAGE=ghcr.io/aleixribera/duty-shooter@sha256:6e38d814…dbf215` (checked: it reports v1.3.9). The old `.env` is kept as `.env.bak-20261027`. docs/deploy.md has the one-step unpin for v2.0.0. The server's own `compose.yaml` copy still lacks the `duty-data` volume; the release ticket (18) refreshes it from main when it unpins.

**Event log.** `GameServer` gained an `onLog` hook (`LobbyEvent`: join, leave, matchStart, matchEnd with duration and result); the app adds the time, writes to `EVENT_LOG` (`/data/events.jsonl` in the image, on the `duty-data` named volume) and stdout, and adds a `serverStart` line so the report can close sessions a restart cut off. A held seat (reconnection) logs a leave on the drop and a join on the return. The join message gained `script`, set by the smoke and load-test scripts. `hvb` is always false until ticket 12.

**Play report.** `node server/report.mjs` in the container (bundled as `dist/report.js`): sessions per day (a person's join to leave) and distinct people, peak people at once, matches finished, person time and bot time.
