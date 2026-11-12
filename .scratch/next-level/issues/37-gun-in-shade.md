# The gun in hand reads in shade

Status: resolved

Release: v2.178.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, picture 5/10, the lowest after identity): out of the sun the gun and gloves are a black cut-out against the lit street or wall behind them (`../reviews/2026-11-12/07-play-mid.jpg`). Out of the sun the gun's key light fell to 12% of its strength, and its fill was the same as in full sun, so a dark rifle lit by the fill alone lost every edge. Keep it a step darker than in sun, but readable.

## Comments

**v2.178.0.** Out of the sun the gun's key keeps 40% of its strength (the open sky overhead, was 12%), and its fill rises by up to 60% (light thrown back off the ground and walls round the player). Both still follow the ambient level, so a room darkens the gun as much as its walls. In full sun nothing changes. `SHADE_KEY` / `SHADE_FILL` in `viewmodel/viewmodel.ts`, used by `setLighting`.

Verified with `../gun-shade/shade.mjs`. It walks Survival Town alone, finds a spot in a wall's shadow facing the sunlit field (-54, -10) and a spot in sun 7 m out, and screenshots both, before and after (`../gun-shade/before/`, `../gun-shade/after/`). Mean brightness of the gun's own pixels, out of 255:

| | Shade | Sun |
| --- | --- | --- |
| Before | 7.1 | 15.6 |
| After | 11.6 | 15.6 |

Shade went from 46% to 74% of the sun level. In the after shot the rail, gloves and sleeve show where before they were solid black. `../gun-shade/indoor.mjs` (the north house) shows the gun dim and readable indoors, not glowing against the room. Typecheck passes.

Even in sun the rifle is very dark (16/255): its material, not the light. That is a separate pass if the picture review still flags it.
