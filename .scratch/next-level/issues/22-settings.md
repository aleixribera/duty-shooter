# Settings and quality tiers

Status: resolved
Release: v2.155.0

Spec: `../spec.md`

No graphics control exists. Quality tiers with dynamic resolution, audio sliders per bus, crosshair options, mouse invert, camera-motion and FOV-effect sliders, colour-blind team colours, HUD scale.

## Comments

### 2026-11-10, implementation agent

Built:

- `packages/fps-client/src/quality.ts` (no three.js, no DOM) holds everything quality-related:
  - **The tier table** (`QUALITY`): render scale, a pixel cap, shadow map size, distance and redraw rate, GTAO samples, TAA or FXAA, sun shafts, bloom, heat shimmer, viewmodel MSAA, particle share, grass/scatter density and draw distance, texture anisotropy, and indoor dust. High is the picture the game had before tiers.
  - **Dynamic resolution** (`DynamicResolution`), the **frame-rate cap** (`FrameCap`) and the display's **refresh estimate** (`RefreshEstimator`).
  - **Auto's tier search** (`TierSearch`) and the **governor** that runs all of them from the page's animation ticks (`QualityGovernor`).
  - `pipeline.ts`, the views and the textures read the table: anisotropy through `filterByQuality`, so a change of tier reaches textures already loaded; particles and scatter through `keeps`/`shareOf`.
- Settings (`settings.ts`): `quality` (Auto by default), `autoTier` and `autoAdapter` (what Auto found, and on which adapter), `dynamicResolution` (on), `fpsCap` (0, the display's rate), `invertY`, `cameraMotion`, `fovEffects`, `colourVision`, `hudScale`, `captions` and `crosshair`. `parseSettings` fills every missing or malformed field with its default, so old saves keep working; a test loads a save from before these fields.
- **The Settings screen** (`ui/menu.ts` plus `ui/settings-screen.ts`):
  - Seven tabbed sections: Controls, Mouse and pad, Touch, Video, Audio, HUD and crosshair, Accessibility. `SECTION_SETTINGS` maps each setting to its section, and a test checks every setting sits in exactly one.
  - "Restore defaults" per section, which reads "all at defaults" and is disabled when there is nothing to restore.
  - Live previews: the tier in effect and everything it turns on (Video), the crosshair as drawn over a bright, a mid and a dark backdrop (HUD), and the team colours with their marks (Accessibility).
  - Keyboard, pad and touch navigation, the instrument-panel look and DESIGN.md tokens.
  - The touch agent's Touch section (four fields) and the "First-match hints: Show them again" row sit in their tabs.
- `hud/crosshair.ts`: four shapes (cross, tee, circle, dot), size, gap, thickness, six fixed colours, a centre dot, and whether it opens with movement and fire. The HUD and the preview share one renderer.
- `team-colours.ts`: one source for the two team colours, the team uniforms and the enemy marker. It has a palette per colour vision (off, deuteranopia, protanopia, tritanopia). The HUD reads CSS tokens it sets; the world (players-view, zone rings, ally tags, markers) reads the palette. `test/team-colours.test.ts` checks each set stays apart under its deficiency (simulated).
- `hud/scale.ts` (HUD scale 80–130 %) and `hud/captions.ts` (the announcer's lines as text, labelled "Range Control", on by default).

Decisions:

- **The table is measured, not guessed** (frame times below). On this PC (RTX Blackwell) the GPU is never the limit: GPU p50 runs 0.1–2 ms. The big step is Low to Medium, which turns on TAA, bloom, 4x viewmodel MSAA, 60 Hz shadows and denser scatter. On a fast GPU that step costs CPU and submission time, not pixels. The pixel cap (`megapixels`) exists because a 4K or HiDPI window is what really kills an integrated GPU: Low renders at most 2.1 MP, Medium 2.6, High 3.7 and Ultra 8.3, before the render scale.
- **Low uses FXAA instead of TAA**, run after tone mapping on the finished frame: no history and no velocity buffer.
- **Dynamic resolution:**
  - It moves the scale between 50 % and 100 % in 5 % steps. It judges 0.4 s windows by their average with the slowest tenth left out, so a lone hitch moves nothing. A frame over 250 ms is a stall, unless three come in a row. Over budget means the window runs more than 8 % over the target; under budget means within 3 % of it; between the two nothing moves.
  - It drops at once, by as much as the overrun says (cost follows the square of the scale), a few steps at most.
  - It climbs one step at a time, after holding the target for 2 s at first. A step up that has to be taken back doubles the wait for the next (up to a minute), so at the edge of what the machine can do it sits a step under and tries the edge rarely instead of pumping.
  - The target is the cap's frame time if there is a cap, else the measured display refresh.
  - The HUD is DOM, so it is always native. The finished frame is sharpened (0.5 at full scale, up to 1.2 at the floor).
- **Auto:**
  - It starts from the adapter's hints: software stays Low; a phone starts Low (ceiling High); WebGL2 or an integrated GPU starts Medium; a discrete card starts High (ceiling Ultra).
  - It judges each tier for about two seconds, leaving out the frames after a switch while shaders rebuild, climbs while tiers hold the target and drops while they miss.
  - It remembers the tier with the adapter's name and measures again on a different adapter. While it searches, the scale is held still.
- **Frame-rate cap:** Display rate, 30, 60, 90, 120, 144 or 240. It keeps time by its own beat, so 60 on a 144 Hz display averages 60. The Settings screen says plainly that V-sync is the browser's to decide and can't be turned off from the page.
- **The FPS counter** shows the render scale ("158 FPS · 55% res") when dynamic resolution is active.
- **Invert Y** is the mouse's; the pad keeps its own `padInvertY`. Both live in Mouse and pad.
- **Camera motion and FOV effects** are both in Accessibility, 0 to 100 %. At 0 % camera motion the view moves only as the body and the mouse move it (ticket 10 has the detail). FOV effects scales the sprint/slide FOV kick and the shot, hit and blast shake.
- **Colour-blind sets** change only the colours and keep each team's mark (◆ ▲ ▼), so meaning never rests on colour alone. The HUD changes at once. Soldiers already in the world change at the next map, and the Settings screen says so.
- **HUD scale** is disabled on a screen narrower than 1000 px. The phone HUD has its own layout and the touch controls own the edges, and the row says so.
- **Captions are on by default**: a caption costs nothing to a hearing player and is essential for one who can't hear.

**Measured frame time per tier and map.** These come from the benchmark page's fly-through, run headless at 1920x1080 with dynamic resolution off, two rounds a map, with every tier flown in turn within a round. The machine is this PC: an RTX Blackwell on WebGPU. Scripts: `.scratch/next-level/settings/tiers.mjs`; raw numbers in `.scratch/next-level/settings/tiers/<map>.json`.

While it ran, the PC was also carrying other sessions: about 55 % CPU load and 16 node processes, plus my own scripted browsers part of the time. Treat the averages as noisy. The median frame time (p50) is the steadiest figure. The 1 % lows are not given here: on a shared PC they measure the other sessions, not the tier (they ranged 8–120 ms at random).

Each cell is the p50 frame time (both rounds' p50s averaged), then each round's average, then the GPU p50. Low renders 1344x756 (70 %), Medium 1632x918 (85 %), High and Ultra 1920x1080.

| Map | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Practice Range | 3.0 ms (avg 3.7, 3.0; GPU 0.22) | 4.1 ms (avg 4.6, 5.7; GPU 0.59) | 4.3 ms (avg 4.3, 5.0; GPU 1.09) | 4.6 ms (avg 4.4, 5.7; GPU 1.20) |
| Survival Town | 2.8 ms (avg 3.0, 3.7; GPU 0.32) | 3.8 ms (avg 3.6, 5.7; GPU 0.77) | 5.0 ms (avg 6.0, 6.2; GPU 1.31) | 5.6 ms (avg 8.2, 6.4; GPU 1.52) |
| Switchyard | 3.1 ms (avg 3.3, 3.7; GPU 0.35) | 4.5 ms (avg 5.6, 6.3; GPU 0.79) | 4.3 ms (avg 5.5, 4.4; GPU 1.40) | 5.3 ms (avg 5.6, 12.9; GPU 1.59) |
| Crash | 3.0 ms (avg 4.0, 3.6; GPU 0.11) | 4.8 ms (avg 5.7, 6.8; GPU 0.30) | 6.0 ms (avg 6.1, 8.9; GPU 1.02) | 6.6 ms (avg 6.5, 8.8; GPU 1.51) |
| Zero Island | 4.5 ms (avg 3.7, 6.3; GPU 0.59) | 7.5 ms (avg 7.0, 8.7; GPU 1.09) | 9.4 ms (avg 9.2, 10.3; GPU 1.72) | 10.8 ms (avg 10.2, 11.8; GPU 1.98) |

What it shows:

- **GPU time** roughly doubles at each step from Low to High, then rises another 10–15 % for Ultra. Ultra's 4096 shadow map and 16-sample AO cost little here because the frame is capped at 1080p; on a 4K window Ultra's 8.3 MP cap is what costs.
- **Frame time** on this card is mostly CPU and submission: GPU time is a fifth of it.
- **Zero Island** is the heaviest map at every tier.
- **The tiers' pixel caps and scales** are what will matter on the integrated GPUs the tiers exist for. This PC can't show that; the benchmark page is how an owner's laptop gets measured (ticket 27).

Screens of every tier on a map, side by side at 1920x1080: `.scratch/next-level/settings/tiers-survival-town.png` (the full frames) and `tiers-survival-town-detail.png` (crops: Low's FXAA aliasing on the tower rails and its softer shadow edge, Medium to Ultra's filtering).

Earlier tier measurements: `.scratch/next-level/settings/tiers-first-pass/` holds a first pass from before the benchmark applied each tier's render scale, so every tier there drew at 1920x1080. It is kept for the record, not used above.

Verified in the browser, with scripts under `.scratch/next-level/settings/` and shots alongside:

- **Dynamic resolution under a forced load** (`dynres.mjs`): Ultra at 3x DPR with the pixel cap lifted (3840x2160 drawn) and a stated 144 Hz target. The scale fell from 100 % to 50 % within a second, then tried 55 % and 60 % after waits of about 2.6 s, 6.6 s and then about 15 s (the backoff), and sat at 50–55 % holding 140–170 fps against the 144 target. It never pumped. The FPS counter read "158 FPS · 55% res" (`dynres/fps-crop.png`).
- **Invert Y** (`effects.mjs invert`): the same mouse move down gave pitch -0.184 rad off and +0.184 rad on.
- **FOV effects**: sprinting widened the FOV from 58.72° to 61.06° at 100 %, and kept it at 58.72° at 0 %.
- **Frame-rate cap**, counted as frames drawn a second with a stated 144 Hz display: no cap gave about 165; 30 gave 30.3/29.9/30.3; 60 gave 59.9; 90 gave 89.2–89.8. 120 gave 101–107 on a loaded PC: a frame over two intervals (16.7 ms) restarts the beat instead of bursting to catch up, by design.
- **HUD scale** 80 % vs 130 % (`effects/hud-pair.png`); crosshair circle/green with a dot, and tee/magenta without one, fixed (`effects/xhair-pair.png`).
- **Colour vision** tritanopia in a Bot Match (`match/tritanopia-play.png`): the score bar, kill feed and "Enemy spotted" lines took the set's violet-blue and amber; the blue team's soldier wore the set's uniform; enemy markers took its red. Ally tags stay `--ds-signal` teal, which marks your side and is not a team colour.
- **Captions** (`match/tritanopia-caption-1.png`): "Range Control: Team deathmatch. The range is hot." at the match start.
- **The Settings screen** at 1920x1080 and 390x844, every section (`screen/desktop-*.png`, `screen/phone-*.png`). The Touch section and the first-match hints row are in place.
- **Design audit** results are in `audit/2026-11-10.md` (see "Design audit" below).

Observed, not this ticket's: two enemy markers at the same bearing overlap their labels ("EI ENEMY", `match/tritanopia-play.png`).

- **Tests:** `npm run typecheck` is clean, and `npm run test:client` passes all 780 tests in 62 files (2026-11-10).

#### Design audit (`.scratch/next-level/settings/audit/2026-11-10.md`)

The audit covered the Settings screen (all seven sections) and the benchmark page (setup, flying, done) at 1920x1080 and 390x844. It found 45 findings: 5 high, 27 medium, 13 low.

Fixed, each PASS in the after shots (`audit/2026-11-10/compare.html`):
- The phone opens on the benchmark results first, with readable headers (F04, F05).
- A verdict and a "Use <Tier> in the game" button (F03).
- "Auto: measuring" and "Not measured yet" instead of a premature tier (F12, F15).
- The benchmark intro copy (F17).
- 32 px sliders (F11, F35).
- 44 px segments on a phone (F28).
- A 16 px bold readout while flying (F29, F30, F45).
- The share caption (F32).

Left, with reasons:
- F01, F06–F09 and F33 are the main menu home screen, not this ticket.
- F14, F26 and F40: 13 px is DESIGN.md's `--ds-type-small` token.
- F21 and F16 (the Ping counter and ADS FOV labels) predate this work.
- F22: the slider already reads as disabled.
- F20: the preview does follow the options.
- F02: the flying plate is already compact.
- F19 and F23 (richer previews), and F13, F18, F24, F25, F27, F31, F34, F36–F39 and F41–F44 are polish, left for a later pass.

One contrast fail remains on benchmark-done@phone. It is a text run scrolled under the opaque footer, so it is not visible.

The audit's capture step needed the vite-hmr stub, so the skill's `capture.mjs` gained an `initScript` config key. That is outside the repo.
