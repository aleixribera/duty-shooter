# HUD plates without edges

Status: resolved

Release: v2.187.6

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, UI and UX): "The HUD plates (04-08, bottom corners) are dark boxes with hard vertical edges at about a fifth of the width in from each side, not a scrim." The health and ammo plates' scrim faded up from the bottom edge but stopped dead at the box's inner side, a straight vertical line in every frame of play.

## Comments

**v2.187.6.** The scrim behind the health and the ammo now also fades sideways, toward the middle of the screen, so it has no inner edge.

- The gradient moved from the plates' background to a `::before` layer behind them (`hud/hud.ts`). The layer's mask fades it out from 45% of the plate's width to its inner side. A mask on the plate itself would have faded the numbers and bars with it.
- The plates isolate their stacking, so the layer sits behind their contents and not behind the HUD.
- The bottom-up gradient and its colours are as before, so the numbers still stand on the dark part. DESIGN.md's rule holds: one gradient, the scrim behind text over the world, from the bottom edge.

Verified:
- Typecheck passes for `fps-client`. No test covers the plates' styling.
- `../plates/look.mjs` shot Survival Town in play at desktop (1920 x 1080) and phone-landscape (844 x 390) sizes, before and after the change. `../plates/compare-desktop.jpg` and `compare-phone.jpg` set the bottom strips one above the other: the vertical edges are gone at both sizes, and the health, ammo and their bars still read. No page errors.
- A code-level check against the web guidelines: the layer takes no pointer events, there is no motion, and the masks carry the `-webkit-` prefix.
