# One picture, at the screen's own resolution, fast on weak machines

Status: open

Spec: `../spec.md`

The owner's call (2026-11-10): "Keep only 1 setting, full 100% render, looks ugly as fuck to have lower, and optimize the game's performance so it can look absolutely stunning while running on potato PC's."

Ticket 22's quality tiers, Auto, dynamic resolution and High's 3.7 MP pixel cap are gone. Every machine draws the one picture: the old High (2048 px shadows over 45 m at 60 Hz, GTAO at half resolution with 8 samples, temporal AA with a light sharpen, sun shafts, bloom, heat shimmer, 8x texture filtering, full grass, scatter and particles), always at the window's own pixels (the device pixel ratio, held at 2 at most: a 3x phone draws 2x).

Phase 1 (v2.166.0): the picture fixed. Phase 2 and on: make that picture cheap enough for weak PCs, measured with `?bench` and `?benchmark` (frame time, GPU time, draw calls), each gain shipped as its own release.

## Comments

**Phase 1 (v2.166.0).** Removed: `QUALITY`, the tiers, Auto (`TierSearch`, `tierFromHints`, the remembered `autoTier`/`autoAdapter`), `DynamicResolution`, the pixel cap and `?megapixels`, `?tier`, `&dynres`, `duty.setTier`, the FXAA path for lower tiers, the HUD's "% res", the Quality section and the Dynamic resolution toggle in Settings > Video, and the tier and dynamic-resolution choices on the benchmark page. An old save carrying `quality`, `autoTier`, `autoAdapter` or `dynamicResolution` loads and forgets them. Settings > Video keeps the frame-rate cap, the FPS counter, the field of view and the benchmark link, and its preview now lists what the one picture draws.

The frame-rate cap now runs in `FramePacer` (`quality.ts`). The reviewer found that its 60-second re-read of the display's rate would take a slow machine on a 144 Hz screen (ticked every other refresh) for a 72 Hz display; it is now read again only when the window moves or the screen under it changes (`displayMoved`), with a test of a slow machine held for five minutes.

Verified: typecheck; the fast suite (177 files, 2318 tests); the canvas is 1920x1080 at DPR 1, 2880x1800 at DPR 2, 780x1688 for a 390x844 phone at DPR 3; Settings > Video at desktop and phone width (`one-picture/video-*.png`), with an old Low + dynamic-resolution save loaded, no console errors.
