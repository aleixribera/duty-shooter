# 16 Release Survival Town

Status: resolved
Milestone: 4 (ship)
Blocked by: 13, 15

## What to build

Make it live. See the spec section "Rollout".

- **Make Survival Town the default** lobby map, with TDM as the starting mode, and the new UI the default client.
- **Remove the flags** and any code still serving the old arena and the old UI.
- **Update the docs:** the README and `docs/deploy.md` for the map, the modes, the status endpoint and the lighting bake step.
- **Ship it:** commit to main, tag the next version, push, and confirm the home server picked up the new image.

## Acceptance criteria

- [x] The live lobby shows Survival Town, TDM and the new UI, and `/healthz` reports the new version.
- [x] The Pages copy offers Practice Range and Explore Survival Town.
- [x] The playtester agent plays one live match through the nuke, the vote and the next match, with no console errors.

## Comments

Resolved under the owner's no-questions instruction, on the home server, and released as **v1.2.0**.

**Defaults and removals.**

- The server's `MAP` now defaults to `survival-town`; `MODE` already defaulted to `tdm`.
- The client opens on Survival Town behind the new main menu.
- The `?town` flag and the old start, join and pause screens are gone; the menu was rewritten in ticket 14.
- The arena was already removed earlier.
- `?map=range` remains as a dev convenience for starting with the range behind the menu.

**The version** now reaches the client. The container's build stage passes `VERSION` into `VITE_VERSION`, and the Pages build sets it from `git describe` (with tags fetched). `/healthz` already reports it on the server.

**Docs.**

- `README.md`: the map, the modes and the intermission, the offline entries, the dev URL parameters, the lighting bake and the status endpoint.
- `docs/deploy.md`: `MAP` and `MODE`, the `/status` shape, the version in `/healthz`, the bake in the image build, and how the Pages copy behaves.

**The side-by-side gallery** (deferred from ticket 09). Artifacts can't be published from this server, so it's a local page for the owner: `~/work/duty-shooter-handoff/gallery.html` on the home server.

- It links to the public sources for the original's frames. Those frames aren't copied, because the sources sit behind bot checks and the repo is public.
- It has a slot for every reference spot, filled by running `node apps/range/scripts/spots.mjs survival-town <gallery>/spots` on the RTX PC; SwiftShader takes minutes a frame here.
- It includes all the UI screenshots.

The owner can publish it.

**Checks before shipping:** typecheck clean in every workspace, 411 tests passed (2 opt-in benchmarks skipped), and a code review. Its findings were fixed:

- the lobby poll re-rendering over typing;
- vote clicks lost to the HUD's per-frame redraw;
- joining before the map had loaded;
- a stale failure after Cancel;
- an unmeasured ping shown as 0.

**Not verified here, for the owner:**

- A live match through the nuke, the vote and the next match in a real browser. This server has software rendering only; see tickets 14 and 15.
- The GPU budgets on the RTX 5060.
- The Pages copy in a browser. Its menu logic is the same code path as the dev page with no server, which was screenshotted.

**v1.2.1.** The v1.2.0 container build failed its smoke test. `apps/server/scripts/smoke.mjs` and `load-test.mjs` still joined with protocol 2, and the ping change bumped the protocol to 3. Both now send 3, released as v1.2.1. The v1.2.0 tag stays where it is, since a pushed tag is never moved.

**Deployed.** The container workflow passed for v1.2.1, including the smoke test against the real image. The home server's `game-autoupdate` timer recreated the container on its own (the lobby was empty).

Checks on the home server afterwards:

- The container is healthy, running image `sha256:02b2e1bd…`.
- `/healthz` reports `v1.2.1`.
- `/status` reports `survival-town`, `tdm`, 0/8, playing.
- The served bundle carries the new menu.

The Pages workflow also passed. This commit (v1.2.2) only adds these notes; the timer rolls it out the same way.

**v1.2.3: review fixes.** The overnight release was reviewed on the Windows PC:

- **The live match.** Played through the nuke, the vote and the next match against a local server running this build with `TIME_LIMIT=40`; see ticket 14.
- **Scoreboard ping.** It no longer climbs while the uplink stalls: each acknowledged usercmd gives one sample.
- **The range online.** It has team spawns, so `MAP=range` no longer stacks every player on the firing line.
- **Deploy config.** `compose.yaml` now passes `MAP`, `MODE` and the new `TIME_LIMIT` to the container. The deploy notes always said `.env` set them, but compose dropped them.
- **The menu.** The fixes are listed in ticket 14.
