# 16 The offline additions

Status: resolved
Blocked by: 13
Release: v1.12.0

Bot Match on either map in every mode with HvB; Explore Switchyard; GitHub Pages copy.

## Comments
- 2026-10-27, implementation:
  - **Bot Match** asks for the map (Survival Town or Switchyard), then the mode, then in team modes the sides: "Mixed teams" with a match size from 1v1 to 6v6 (the cap rose to 6 in ticket 12), or "Humans vs bots", which hides the size and says you play on Blue against four bots. The menu calls `botMatch(map, mode, botsPerTeam, hvb)`; the page builds a `BotMatchDriver` on that map with `hvb`, and the bots walk the map's own nav graph. Free-for-all ignores humans vs bots, so the menu sends `hvb` only for team modes.
  - **Explore Switchyard** is its own tile beside Explore Survival Town (a rail-track icon); `exploreTown()` became `explore(map)`.
  - **The GitHub Pages copy** builds the same client, so it gets all of this with no change: the bake plugin already bakes Switchyard's lighting into `bake/switchyard.bin`, and the Pages menu shows every offline tile.
  - Test: `apps/range/test/bot-match.test.ts` plays a humans-vs-bots Outposts Bot Match on Switchyard through `BotMatchDriver` (exported for Node as `@duty-shooter/fps-client/session`) and checks you on Blue against four bots on Orange.
