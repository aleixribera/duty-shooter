# Recoil accumulates until the aim can't go below a line

Status: resolved
Release: v2.108.3
Blocked by: 13

Owner bug report after playing one Battle Royale match: recoil accumulates, and eventually the crosshair can't be brought lower than a horizontal line, more or less.

Reproduce it first, headless and in a real browser: fire long and short bursts with every weapon over many minutes, with and without pulling down, across deaths, Downed, Revive, spectating and weapon swaps. Record view pitch, recoil offset and the pitch clamp every tick, on the client and on the server. Likely suspects to check by measurement, not by reading: recoil not decaying or not reset, the recoil offset added into the base pitch, prediction and server disagreeing so reconciliation keeps reapplying it, the pitch clamp applied to the sum instead of the base, and the Downed camera's tilt. Fix it, and add a regression test that fires a whole match's worth of bursts and checks the aim can still reach the bottom of its range. Check every mode, not only Battle Royale.

## Comments

**Cause, measured.** Recoil (and flinch) is a recoil offset the simulation keeps on top of the usercmd pitch, and by design it never wears off. A player holding their aim level pulls the mouse down by every kick, so the usercmd pitch keeps falling while the offset keeps growing. The mouse pitch was bounded at ±180° twice: `CMD_PITCH_LIMIT = Math.PI` in `lookPitch` on the client, and `clamp(pitch, -π, π)` in the server's `validCmd`. Past that bound the lowest view is `-180° + offset`: horizontal at an offset of 180°, and above it later. Recorded headless, with an M4A1 in bursts held level (usercmds through the real wire decoder): offset 64° at 30 s, 127° at 60 s, 191° at 90 s with the mouse pitch stuck at -180.0°. From 150 s on the view was pinned at +85°, and pulling down did nothing. A real player who fires about a minute and a half in one life (a Battle Royale match) gets the owner's horizontal line.

**Hypotheses checked by measurement:**
1. Mouse pitch bound reached because the offset grows without limit: **confirmed** (numbers above). Raising the bound made every case green.
2. Offset not reset across deaths: it is reset on respawn (sim zeroes both, and the client takes the spawn facing), so not the cause. Battle Royale has no respawn, which is why it shows there first.
3. Prediction and server disagreeing: the networked test asserts the server's view and the client's prediction both reach -85° after 4 minutes per primary (offset 334° to 394°). They agree.
4. Clamp on the sum instead of the base: the sim clamps the view (sum) and drops only the excess, which is right. The client's limit counts the offset. Not the cause.
5. Downed camera tilt: roll only (12°), and the Downed and Revived view reaches -85° with a 400° offset in the test. Not the cause.

**A second bug on a return path, fixed too.** A page that takes its seat back (reload, then resume) set its mouse to the server's *view* (`cmdPitch + viewPitch`), while the server keeps the offset on top. The next usercmd counted the recoil twice and threw the view up (to +85° in the test). It now takes the usercmd angles (`cmdYaw`, `cmdPitch`). On a respawn the two are equal (the offset is zero), so spawns are unchanged. Spectating doesn't touch the input: the camera follows the watched player's pitch, and the next spawn resets the mouse. A same-page reconnect never re-takes a facing, and the test shows its view unchanged.

**Fix.** `CMD_PITCH_LIMIT` (fps-core `usercmd.ts`) is now 1e6 rad, shared by `lookPitch` and `validCmd`. It works like yaw, which was never bounded. The limit only keeps absurd numbers off the wire: at 2° of compensated kick per second of trigger, that is about 300 days of continuous fire in one life. Float precision at 1e6 is around 1e-10 rad. A hostile client gains nothing, because it could already cancel recoil with its usercmd, and the view stays clamped. I chose this over two alternatives. Recoil recovery (decay) changes weapon feel, which the ticket rules out. Wrapping or rebasing the mouse pitch needs the client and server to agree on each shift, and the camera's eased offset would swing a full turn.

**Weapon feel unchanged.** The simulation is untouched. A fresh `BALANCE_REPORT` run of `balance.test.ts` (all 13 tests, the 5,760 duels) is byte-identical to `docs/balance.md`. There are no golden hash tests in the repo (searched); `packages/fps-core` all passes.

**Regression tests** (`packages/fps-client/test/look-pitch.test.ts`), red before the fix:
- For each primary (m4a1, smg, shotgun, sniper), 4 minutes online through the real server and prediction: long and short bursts, pistol swaps, reloads, aim held level. Then a pull down must reach -85° on the server and in prediction. Before the fix all four ended pinned at view 85°, mouse -180°.
- `lookPitch` far past the old bound.
- A reloaded page resuming its seat faces the usercmd angles. Before the fix: 0° against -86.6°.
- Downed and Revived with a 400° offset: the view reaches -85° and +85°.
- A same-page reconnect keeps the view within 0.001 rad (this one was green before; it checks the path).

**In a real browser** (`.scratch/battle-royale/recoil/browser-recoil.mjs`, CDP mouse moves through the game's mouse handler at sensitivity 50, so 1080 px covers about 356°):
- Offline, `?explore=range`, 200 s of bursts (M4A1, pistol swaps, reloads) held level: offset 235°, mouse pitch -239°. Under the old bound the floor would have been at +55°. Pulled down: view -85°. Pushed up: +85°.
- Online, `online.mjs` (this checkout's server built aside on 3101, free-for-all, with a second dev server proxying to it): offset 226°, mouse -226°, past the old server clamp. Pulled down: -85°. Pushed up: +85°. No page errors. `looking-down-online.jpg` shows the floor straight down, and the online log is in `browser-run-online.json` (the offline numbers are only here).

