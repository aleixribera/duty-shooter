# 16 Release Survival Town

Status: ready-for-agent
Milestone: 4 (ship)
Blocked by: 13, 15

## What to build

Make it live. See the spec section "Rollout".

- **Make Survival Town the default** lobby map, with TDM as the starting mode, and the new UI the default client.
- **Remove the flags** and any code still serving the old arena and the old UI.
- **Update the docs:** the README and `docs/deploy.md` for the map, the modes, the status endpoint and the lighting bake step.
- **Ship it:** commit to main, tag the next version, push, and confirm the home server picked up the new image.

## Acceptance criteria

- [ ] The live lobby shows Survival Town, TDM and the new UI, and `/healthz` reports the new version.
- [ ] The Pages copy offers Practice Range and Explore Survival Town.
- [ ] The playtester agent plays one live match through the nuke, the vote and the next match, with no console errors.

## Comments
