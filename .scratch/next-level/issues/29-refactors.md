# Refactors

Status: claimed

Spec: `../spec.md`

Split startGame (apps/range/src/main.ts) by flow, move Game's event presentation and HUD-state builders out, one map registry, remove the procedural M4A1 if the Blender one is what plays, dead exports.

## Comments

- One map registry (v2.170.4): `apps/range/src/map/catalogue.ts` holds every map's name, team sizes by mode, whether matches play it, whether its lighting is baked and whether it has a lobby picture. `MapId`, `MAP_IDS`, `TEAM_SIZES`, the bake list in `vite.config.ts`, the lobby pictures in `main.ts` and the map names all derive from it; each builder's `name` reads it. `LOBBY_MAPS` (apps/range) and `BOT_MAPS` (fps-client) were the same three maps under two names and are now `MATCH_MAPS`. The client can't import apps/range, so its copy of the names (`MAP_NAMES`, `lobbyMapName`) is gone and the app injects `mapName` into `Menu`, which passes it to `lobbyTile`. A new map is now its catalogue entry plus its builder; `docs/agents/codebase.md`'s "A map" line says so. `catalogue.test.ts` checks the pictures on disk match the flags and that every match map plays every match mode. Still to do here: split `startGame`, move `Game`'s event presentation and HUD builders out, dead exports, and the procedural M4A1 (held back while ticket 19 changes the M4A1's attachment mounts).
