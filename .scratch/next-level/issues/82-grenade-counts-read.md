# Grenade counts you can read

Status: resolved

Release: v2.187.31

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), Onboarding and accessibility (04-08): "The grenade and tactical counts (04-08, bottom right) are still small glyphs beside a '1'."

## Comments

- **What it is.** In the ammo plate the tactical and the grenade were 18 px glyphs, each beside a 16 px count. The magazine's figure next to them is up to 60 px. On a bright lawn they read as specks, and the smoke canister's outline hardly read at all.
- **What changed** (`hud.ts`): the counts scale with the magazine's figure, at 45% of it, held between 19 and 24 px.
  - The glyph is a quarter taller than its count, from 24 to 30 px, drawn a touch finer.
  - The figures are tabular, so a cooking fuse's "2.4" doesn't shift the line.
  - At 1920×1080: 30 px glyphs with 24 px counts. At 1366×768 and on a phone held sideways: 24 px glyphs with 19 px counts.
- **Left alone** (`touch-layout.ts`): the touch plate is a fixed 60 px tall. It keeps its 18 px glyphs and 16 px counts, now set there explicitly.
- **Seen in the page** (`../nade-count/look.mjs`, `sheet.jpg`): Survival Town walked alone at 1920×1080, 1366×768 and 844×390, the plate cropped at 2×, before and after.
  - The two counts now read as part of the plate, level with the magazine's figure.
  - The touch layout's sizes, read with its class on, are unchanged.
  - No page errors.

No second-opinion review: CSS sizes, with no logic.

Verified:
- The `fps-client` typecheck passes. No test covers the plate's CSS.
- Plate frames before and after at three sizes, with the glyph and count sizes read from the page.
