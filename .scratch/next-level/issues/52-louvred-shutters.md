# Louvred, framed shutters

Status: resolved

Release: v2.186.4

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, defect 3): in `../reviews/2026-11-12d/08-play-late.jpg` "the window shutter is one flat dark-maroon rectangle with no grain or shading", next to siding that has both. Every window on both Survival Town houses has a pair of them.

## Comments

**v2.186.4.** The shutters are now louvred and framed, in both houses' colours (green on the north house, maroon on the south).

- **A new surface family, `louvre`** (`surface-materials.ts`). Slats 5 cm apart, tipped down: each is lit along its top edge and in shadow at its foot, with a dark gap between. Far off, where a slat is under a couple of pixels, it fades to the slats' mean tone, so they don't shimmer. Bullet impacts on it are wood.
- **A frame.** `WallTrim.shutterFrame` in `builder.ts` adds stiles 5 cm wide up both sides and rails 7 cm deep across the top and foot, standing 7 mm proud of the slats. They are painted in the shutter's colour. Without them the slats read as a roller blind.
- **The front door** of the street house past the checkpoint used the north shutter's finish. It now has its own plain paint (`north.door`), so it doesn't turn louvred.

Collision, nav and bullets are unchanged: shutters are decoration.

Verified:
- `survival-town.test.ts` and `map.test.ts` pass (119/119), including decorations staying within 5 cm of their solid. `surface-hit` passes (5/5). Typecheck passes for both packages.
- Survival Town rebaked in the dev server (18 s). `../shutters/look.mjs` looks at the south house's front window from close, at an angle, and from across the street.
  - Before (`../shutters/before/`): two flat maroon slabs.
  - After (`../shutters/after/`): framed louvred shutters. From across the street the slats settle to an even tone with no moiré.
  - No page errors.

Left from the same review:
- A strip of sky at the stairwell's edge (05).
- Teammate arrows with no names (08).
