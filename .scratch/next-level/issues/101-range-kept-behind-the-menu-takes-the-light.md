# The Practice Range kept behind the menu takes the map's light

Status: resolved

Release: v2.191.1

Spec: `../spec.md`

Broken, found by loop pass 9's review subagent. The Practice Range game built off screen while the menu shows (`keepRangeReady` in `apps/range/src/main.ts`) put up its own light and sky field in the uniforms every world material reads, and disposed the shown map's sky field. Whichever view was built last kept `currentLighting()`, which aims the realtime shadow camera, the viewmodel's light, glare and smoke.

Acceptance: with the range built behind the menu, the map on show keeps its own sun; the range taken over after another map was built draws with its own sun.

## Comments

**2026-11-13, loop pass 10.** Reproduced with `spare-light/look.mjs` and `range.mjs` (the numbers in `spare-light/results.txt`): Zero Island behind the menu kept the range's sun for its shadows once the range was built (`current -0.553,0.623,0.553` against the island's `-0.619,0.2,0.759`), and the range, entered after Switchyard was picked in Bot Match, aimed its shadows by Switchyard's sun.

Fix: each WorldView owns its sky field texture (`skyFieldMap`), and `show()` puts its light and field back into the shared uniforms when another view took them (`showWorld`, an owner token, so it costs one comparison a frame). `Game.frame` calls it first thing, `setLastMinute` again. Nothing disposes a field another view shows. After: both scripts read each map's own sun in `current` and `shown`. `test/shared-light.test.ts` holds the hand-back.

Second opinion: the first draft only took the light back in `setLastMinute`, after `follow()` had already aimed the shadow camera that frame: moved to the top of `Game.frame`. Latent, not fixed: `ProbeLightingModel.indirect` bakes `currentLighting().modelFill` into the shader when it compiles, so the range compiled behind another map would keep that map's `modelFill`; no map sets one today.
