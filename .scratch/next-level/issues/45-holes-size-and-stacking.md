# Bullet holes are hole-sized, and shots into one hole don't stack

Status: resolved

Release: v2.185.1

Spec: `../spec.md`

Seen in a fresh review capture after ticket 44 (`../reviews/2026-11-12b/07-play-mid.jpg`, copied to `../holes2/before/indoor-capture.jpg`). Indoors, a metre from a painted wall, each hole from ticket 38 was a pale disc about a hand across. Where a burst put several into one spot, they made a black and orange blot. A hole decal was 10 to 15 cm square. Each one multiplies the wall under it (×2 modulate), so stacked ones compound: the cores to black, and the wood tint to orange.

## Comments

**v2.185.1.** In `effects.ts`:
- A hole decal is now 6.5 to 9.5 cm (loose ground 4 to 5.5 cm), about 40% smaller, so the crater is a few centimetres across.
- The hole layer keeps each decal's point, normal and size. A shot whose centre lands inside an existing hole's crater on the same face (within 0.35 of the smaller size, normals within about 25°) lays no second decal. Sustained fire into one spot leaves one hole instead of a blot.

Verified:
- `bullet-holes.test.ts` (new): three shots into one spot lay one decal, a shot 12 cm away lays a second, and the same spot on a face turned another way lays a third. It passes, and so does `muzzle-flash.test.ts`. Typecheck passes.
- `../holes2/burst.mjs`: from 1.5 m, six single shots into the shaded sheet-metal wall on Survival Town and then a held one-second burst, before and after (`before/crop.jpg`, `after/crop.jpg`). Before: big pale craters overlapping into dark clumps round the aim. After: small, separate holes, each a dark core with a pale lip, and no clumps. No page errors.
