# Sniper smoke trail is barely visible

Status: resolved
Release: v2.125.2
Blocked by: none
Labels: bug

Seen by the lead in `../shots/t65/zero-island-sniper-smoke-side-0.7s.jpg`: from the side, the sniper's smoke trail is a faint hairline that's easy to miss against grass and sky. The owner asked for sniper bullets to "have a smoke trail", so it should read clearly as smoke: wider (a few cm growing as it spreads), soft and puffy, lit by the dusk sun, lingering ~1.5-2 s and drifting, visible against sky, grass and snow, and from the shooter's own view down the scope too. The tracer for normal rounds may also be a touch brighter/thicker at range; keep it subtle. Measure frame time with several snipers firing. Shots from the side and from behind the shooter on Zero Island and another map.

## Comments

**What changed (v2.125.2).** `packages/fps-client/src/tracers.ts` only; same pool (640 pieces), same one draw call, still no texture.
- Each smoke piece is now a soft rounded capsule in the screen's plane (`writePuff`), at least as long as it is wide and running half a width past each end, so neighbours overlap into one plume and a trail seen end on (your own shot down the scope, or from behind the shooter) is a row of round puffs instead of nothing. A `tCap` attribute tells the shader how much of each piece is its rounded end.
- Width 4 cm as laid, spreading to about 55 cm over 1.6 s (fast first, then slowly); never under about 3 px at any distance. Opacity thins as it spreads and fades over a 1.7 to 2.1 s life (was 1.2 to 1.6 s), and fades out within 3 m of the camera so your own trail never fogs your scope.
- Lumpy: two octaves of world-fixed noise (`mx_noise_float`) erode the capsule, so it reads as puffy smoke, not a rope.
- Lit by the map: sky zenith and horizon colours plus the sun, strongest when you look toward the sun (forward scattering), read from `surface-materials` uniforms, so a dusk trail glows warm and Switchyard's or Survival Town's light carries over with no per-map numbers.
- Normal rounds' tracers are unchanged: the ticket says "may", and in the side-by-sides they already read at range; I kept them as they are rather than add brightness nobody has asked for yet.

**Seen** (`.scratch/battle-royale/shots/t76/`): `before-after-side-0.7s.jpg` is the shot that showed the problem next to the same angle now (hairline against a warm soft plume). `final/side-sheet.jpg` follows the same trail at 0.3, 0.7, 1.2 and about 2 s. `final/` and `zi/` hold the views from behind the shooter and down your own scope (a soft puff just off the crosshair; the sniper's recoil lifts the view, so the first frames show sky). `y2.2/` looks toward the sun (the trail glows), `sy/` is Switchyard (its overview camera: the trail reads to the horizon). I couldn't get a sniper line over open snow in Frostbite: from `?at=-75,-330` the round hit walls a few metres out in every direction I tried, so snow is not checked separately; the colour comes from the same light as everywhere.

**Measured** (`.scratch/battle-royale/t76/bench.mjs`: explore Zero Island, 8 fake snipers 30 to 90 m out each firing across the view every 1.2 s, 10 s windows, twice; before = HEAD's tracers.ts swapped in): WebGPU before 5.82 / 5.72 ms mean (p99 8.2 / 8.4, about 150 pieces), after 6.25 / 5.92 ms (p99 10.5 / 8.6, about 200 pieces), quiet windows 5.8 to 6.3 ms on both. WebGL2 before 9.83 / 9.77 ms (p99 17.4 / 17.2), after 9.86 / 10.04 ms (p99 17.3 / 18.0), quiet 8.8 to 10.3. The difference is within the run-to-run noise on this busy PC.

Tests: `packages/fps-client/test/tracers.test.ts` (11, three new: lingers 1.5 to 2 s, starts a few cm wide and spreads past 25 cm while still dense, seen down the line each piece covers its own width on screen). Scripts: `.scratch/battle-royale/t76/shots.mjs` (`VIEW=side|behind|scope`, `AUTO=0`, `OUT`), `bench.mjs`.
