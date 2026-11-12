# Pale sawdust

Status: resolved

Release: v2.187.27

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its note on the previous first defect (05): "a dozen soft brown blots without a core spatter the mint siding round the muzzle smoke (x 1080-1340, y 420-600), where the chips are flying."

## Comments

- **What it is.** The blots are not holes. Each shot into wood throws up four puffs of dust at 55% opacity, and wood's dust was a dark brown (0x8a6038). Mid-burst, on painted siding, the puffs hung as soft brown discs round the hits, with dark orange splinters over them. Once the dust clears the holes are there as small dark dots, as they should be.
- **What changed** (`effects.ts`, `DUST.wood`): sawdust and fresh splinters are pale, whatever the paint. The colour is now a greyed beige (0xd4cab8). A first try with a warmer tan (0xcdb48c) still turned orange in the afternoon sun.
- Dark stained wood (the deck, its stairs) gets the same pale dust. That is also what a round throws out of it.
- **Seen in the page** (`../wood-dust/look.mjs`, `sheet.jpg`): bursts into the main house's mint front from 3 and 6 m, mid-burst and 2.5 s after.
  - Mid-burst, before: a soft dark-brown blot round the hits. After: a light dust puff that reads as dust.
  - Settled: the same small dark holes, before and after.

No second-opinion review: one colour constant, with no logic.

Verified:
- The `fps-client` typecheck passes. No test pins the dust colour.
- Burst frames before and after at 3 m and 6 m, mid-burst and settled, with no page errors.
