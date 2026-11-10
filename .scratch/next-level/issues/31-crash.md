# Crash becomes its own place

Status: resolved
Release: v2.156.0

Spec: `../spec.md`

Close the Crash ticket: a definition of done, the ?botmap switch gone, and an art pass that makes it this game's map (its own name, no borrowed markings).

## Comments

Decision (owner session, 2026-11-10): **Crash is retired, not re-skinned.** Its ticket (`.scratch/crash/issues/01-crash.md`) set out to recreate another game's map, and every step since followed that map's overhead, its landmarks and its routes. A new name and fresh markings would leave the same level underneath, which is not this game's own place however it is painted. It never reached the published map list (only `?explore=crash` and the dev-only `?botmap=crash`), so no player loses a map. *(Corrected at removal: it was in Bot Match's and Play Online's map lists, so players do lose it until ticket 32's map lands. The README itself called it "a recreation of the desert-town map from Call of Duty 4", which settles it.)*

What goes: `apps/range/src/map/crash.ts`, its tests (`crash*.test.ts`), its model and bake, its `MapId`, the `?botmap` switch and the `?explore=crash` entry, and its rows in the lists that name maps. The Blender scene and the code stay in git history.

What replaces it: a fourth map designed from this game's own needs (a mid-size map for 6v6 with the Slide, the Kick and the climbs in mind, and Charge sites), ticket 32, built when the arsenal and settings work have landed.

The removal waits until the arsenal and settings agents have landed, since it touches `main.ts`, `ui/model.ts` and the bench, which they are editing now.

**Removed (v2.156.0).** `crash.ts`, its seven test files, `crash.glb`, `crash.jpg`, `tools/map/crash*` (two `.blend`s, the scene, layout and kit scripts), its `MapId`, `TEAM_SIZES` row, `MAP_NAMES` entry, the `BOT_MAPS` and `LOBBY_MAPS` entries, the lighting bake, the benchmark's map list, the `?botmap` switch, the package scripts' globs and the README and codebase lines. The server's "host and friend play together" test now plays Switchyard (same coverage: a map and mode picked together, humans vs bots kept, both people in the match), less the ladder count. The Bot Match test that started a Crash match is gone; the Switchyard one covers starting a match. Two Zero Island texts that used Crash as a yardstick for a Core's size now give the figure (6,000 to 10,000 m²).

**Lost with it:** the only map with ladders. Ladder movement keeps its core tests, but no map test walks a bot up one now: ticket 32 brings ladders back.

**Verified:** typecheck of client, range and server; client and server suites and the bot-match, bench and map tests on the exported index (874 of 875; the one failure, the server's JSON log line test, passes alone here and on v2.152.0); the Bot Match screen in a browser shows Survival Town and Switchyard, no console errors.
