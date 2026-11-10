# Crash becomes its own place

Status: open

Spec: `../spec.md`

Close the Crash ticket: a definition of done, the ?botmap switch gone, and an art pass that makes it this game's map (its own name, no borrowed markings).

## Comments

Decision (owner session, 2026-11-10): **Crash is retired, not re-skinned.** Its ticket (`.scratch/crash/issues/01-crash.md`) set out to recreate another game's map, and every step since followed that map's overhead, its landmarks and its routes. A new name and fresh markings would leave the same level underneath, which is not this game's own place however it is painted. It never reached the published map list (only `?explore=crash` and the dev-only `?botmap=crash`), so no player loses a map.

What goes: `apps/range/src/map/crash.ts`, its tests (`crash*.test.ts`), its model and bake, its `MapId`, the `?botmap` switch and the `?explore=crash` entry, and its rows in the lists that name maps. The Blender scene and the code stay in git history.

What replaces it: a fourth map designed from this game's own needs (a mid-size map for 6v6 with the Slide, the Kick and the climbs in mind, and Charge sites), ticket 32, built when the arsenal and settings work have landed.

The removal waits until the arsenal and settings agents have landed, since it touches `main.ts`, `ui/model.ts` and the bench, which they are editing now.
