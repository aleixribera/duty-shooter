# Settings and quality tiers

Status: open

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
