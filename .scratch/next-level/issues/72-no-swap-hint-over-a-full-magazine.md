# No swap hint over a full magazine

Status: resolved

Release: v2.187.21

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12e.md`), its fifth defect (07, bottom centre): "the hint 'Q Swap to your other weapon: faster than a reload' shows while the magazine is full (30, bottom right), the one moment it can't help."

## Comments

- **Why.** The swap hint is for the moment a reload is under way. A magazine reload puts the rounds in partway through, at its add-ammo point, and the weapon stays in its reload action until the animation ends. For that last stretch the gun reads 30/30 while the hint still saw a reload, and told the player to swap rather than wait.
- **What changed.** The swap hint now needs the magazine short as well as a reload under way (`matters` in `hints.ts`). Once the rounds are in, it steps aside and isn't put up again for the rest of that reload. A shotgun's shell-by-shell reload keeps the hint until the tube is full.

Verified:
- The `fps-client` typecheck passes.
- `hints` tests pass (22). The new one, the swap offered only while the magazine is short, fails before the fix and passes after.
- `../swap-hint/reload.mjs` seeds the hint memory so the swap is the next hint, then in Survival Town fires 20 rounds, reloads, and samples the hint line, the magazine and the weapon's action every 100 ms. No page errors.
  - Before (`before/samples.json`): the rounds go in at 700 ms, and the hint stays up over "30" until the reload ends at 1300 ms.
  - After (`after/samples.json`): the hint goes at 900 ms, as the rounds go in, while the reload runs on to 1400 ms.
