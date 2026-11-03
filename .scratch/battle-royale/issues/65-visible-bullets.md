# Visible bullets, and smoke trails for snipers

Status: resolved
Release: v2.125.0
Blocked by: none
Labels: enhancement

Owner: "add small but visible bullets being shot, so the player kind of sees where they are shooting, and make the sniper bullets also have a smoke trail."

Every shot (yours, allies', enemies', bots') draws a small, bright, short tracer streak travelling from the muzzle along the real shot path to the hit point; it must match where the hit lands. Sniper rifles also leave a thin smoke trail that lingers about a second and drifts. In every mode, not only Battle Royale. Cheap: pooled/instanced, no per-shot allocations, no extra network data if the shot is already known to the client (check what the snapshot carries for remote shots). Verify in game at dusk on Zero Island and on the other maps; frame time with 60 seats firing.

## Comments

**How it works (v2.125.0).** `packages/fps-client/src/tracers.ts`, wired into `game.ts`. No protocol change: the client already gets a `shot` event for every shot by anyone (origin, direction, pellets, weapon), plus `impact` and `hit` events. For each shot (each pellet for the shotgun) the client flies the same ballistic path the simulation does (muzzle velocity and gravity from the stats file, the world tested in 25 m chords, bodies with `hitBody` as drawn, teammates skipped except in FFA and Gun Game, the local player counted for others' rounds) to find where it ends. When the server's `hit` (bullet) or entry `impact` arrives, that shooter's nearest tracer is moved onto the reported point if it is within 1.5 m of its line, so the streak ends exactly where the hit landed. The client's own path stops at the first wall; for a round that pierces it, the server's later entry impact moves the end on, so the streak carries through to the last point the server reports.

The streak starts at the muzzle as drawn (view-model muzzle in first person, the remote flash point otherwise) and converges onto the eye path within 20 m (half the flight if shorter), with a correction that lands it exactly on the end point. It is a camera-facing quad 10 ms of flight long, warm white, additive, fading in over its first 3 m; every tracer is drawn at least one frame even on a long frame. The sniper adds about 72 smoke pieces along its path that drift with the wind and rise slightly, fading out over 1.2 to 1.6 s.

Two `InstancedMesh` pools (192 tracers, 640 smoke pieces), rings that reuse the oldest slot; nothing is allocated per shot. Both materials are procedural TSL (streak falloff, smoke noise from `mx_noise_float`): no texture, so no texture memory and nothing to tile. The game-textures skill's table puts a runtime shader here; variation comes from the noise and per-piece lifetimes.

**Measured.** A busy PC (other sessions held the CPU at about 70 %), so frame times are noisy; draw counts depend on where the camera looks.
- 60-seat Local bots Battle Royale, WebGPU: before 8.67 ms mean, p99 56.3, 136 draws (max 154); after 6.17 ms, p99 11.8, 126 draws (max 167).
- Same, WebGL2: after 10.12 ms mean, p99 30.2, 148 draws (max 167). The before build never got past the lobby on WebGL2 ("timed out: lobby" / join timeout, 4 tries), so there is no before number; the after build opened it first time.
- Switchyard TDM Bot Match, WebGPU: before 5.78 and 5.72 ms mean (p99 11.7, 32.1; 180 and 104 draws); after 7.07 and 12.87 ms (p99 31.7, 32.0; 130 and 158 draws). WebGL2: before 4.82 ms (p99 13.6, 164 draws), after 7.94 ms (p99 31.7, 134 draws). The p99s near 32 ms on both builds are the throttled headless window, not the tracers.
- What the tracers themselves cost, measured directly with both pools saturated (20 automatic rounds and a third of a sniper round every frame): 0.07 ms per frame to fire, 0.13 ms per frame to update. At most 2 extra draw calls, none when nothing is in flight.

Raw results: `.scratch/battle-royale/t65/results/`, `.scratch/battle-royale/shots/local-bots/t65-*-report.json`.

**Seen.** `.scratch/battle-royale/shots/t65/`: own automatic fire on Zero Island at dusk (`zero-island-own-auto-*`), Survival Town and Switchyard; a sniper shot on Zero Island with its smoke trail from beside the line at 0.3, 0.7 and 1.1 s; a bot firing at you at dusk on Switchyard (`switchyard-incoming-*`, zoomed crops show the streak at its muzzle). A round coming straight at you is end-on, so it reads as a short bright flash at the shooter rather than a line; that is how real incoming tracers look and I left it. The side views of the smoke trail exist only on Zero Island: `duty.game.overview` shows the map's own overview on the other maps and in a Bot Match.

**Noticed, not fixed.** In a dev Bot Match the idle local player sometimes fires on its own (ammo falls with no input); cause unknown, it predates this change.

Scripts: `.scratch/battle-royale/t65/` (`shots.mjs`, `botmatch.mjs`). Tests: `packages/fps-client/test/tracers.test.ts` (9).
