# Rocks look like stacked cubes since the hitbox fix

Status: resolved
Release: v2.125.4
Blocked by: none
Labels: bug

Ticket 63 fixed the invisible hitboxes by remodelling rocks as blocky jointed stone that fits a few boxes. The collision is right, but in `../shots/t65/zero-island-sniper-smoke-side-0.7s.jpg` the grassland rocks read as grey stacked cubes, not natural boulders; in the Dustlands the same style reads acceptably as sandstone ledges (`../shots/t63/look1/dl-strata.jpg`).

Keep the rule "what you see is what you hit, within a few cm", but give each Region natural rock shapes again: rounded/irregular boulders, outcrops and slabs per Region (granite in Frostbite, mossy boulders in the Jungle, sandstone ledges in the Dustlands, broken concrete/rubble in Ground Zero), built in Blender (`blender` skill) with textures through `game-textures`. Collision fitted to each model tightly enough (more boxes per model, or a convex-hull/rounded collider if the engine can afford it in the server tick); keep `kit-solids.test.ts`'s tolerance. Rebuild nav, recheck bot crossings, sightline/cover numbers, frame and server budgets.

## Comments

Implementer (ticket 78 fix):

- Models (`tools/map/vegetation.py`, Blender, previews in `../t78/previews/`): `rock-a`/`rock-b` are now one weathered granite boulder each (`granite()`): every upright corner rounded by its own amount, a corner split off along a vertical joint, a sheared shoulder, the top rounded over and drawn in, the skin dented inward. `rubble-a`/`rubble-b` are new (`broken()`): two or three concrete blocks with tilted broken tops, chipped arrises, rough fracture faces and bent rebar. `rock-strata` (the Dustlands' sandstone ledges) is kept. LODs for each.
- Who wears what (`zero-island-plants.ts`, by `regionAt`): rubble in Ground Zero's crater; sandstone ledges and the old sandstone layer in the Dustlands; boulders elsewhere, wearing two new CC0 Poly Haven ground layers through `game-textures`/`tools/textures/ground.py`: `boulder` (rock_boulder_dry, granite, snow-capped in Frostbite) and `moss` (mossy_rock, the Mutant Jungle). Rubble wears the concrete `wall` layer. Rock tints lightened to suit the granite. Rocks pick their layer per kind (`PlantKind.layer`, one material each in `plants-view.ts`).
- Collision (`tools/map/fit-solids.mjs`, `kit-solids.ts` refitted): the fitter's lattice now reaches the outer 4 cm band and growth can't trade width for height, which had left round shapes at 65-80% fill. Boulders get 8 boxes (were 2 and 4), rubble 10 at a 0.4% worth. `kit-solids.test.ts`'s 5 cm rule is unchanged; rubble's fill floor is 0.75, boulders keep 0.85.
- The honest trade: at a 5 x 3 x 5 m rock the skin now stands a median 12.5 / 13.9 cm off the boxes (p90 21 / 24 cm), against 3.8 / 0.8 cm for the old blocks; within 5 cm below a third of its height, the rest is the rounded shoulders and top. Rounder boulders read better but fell to 76-81% fill and 16-24 cm gaps, so the rounding is a middle setting, and from the side they still read as rounded blocks; the granite and moss photos carry more of the look than the silhouette does.
- Sightlines: the rounded boulders opened one area (-288,-96 in Ground Zero's skirt) from a median view of 50 to 70 m (test bound 60). Rubble across all of Ground Zero made it worse (80 m: its broken tops are low) and also put a nav node in the shallows, so that was dropped. A boulder now stands 8% wider and deeper than its cover piece (`BOULDER_ACROSS`, `Dress.across`), about the cross-section the square stone had; the area is back to 60 m.
- Edge check in the real game (`../t63/edges.mjs` on port 5191, shots in `../shots/t78/edges-final/`): 9 targets, a boulder in every Region, a ledge in two and the crater's rubble. Every walk stopped against the drawn skin. All 9 shots at the old box's empty top corner went through (`airHit: none`), and every body shot hit, 0.38-0.89 m from the eye.
- Looks: same rocks before and after, near and mid, in all six Regions and the grassland: `../shots/t78/before/sheet.jpg`, `../shots/t78/final/sheet.jpg`.
- Budgets, before (HEAD export served on its own port, or ticket 74's v2.124.4 soak) and after:

| | Before | After |
|---|---|---|
| Solids on the island | 26,889 | 49,712 |
| Map build (sightline test) | 2.86 s | 2.88 s |
| Bench frame p50 / p99 (ms) | 3.9 / 7.4 | 4.1 / 7.9 |
| GPU p50 / p99 (ms) | 1.59 / 3.82 | 1.66 / 3.67 |
| Draw calls mean / max | 107 / 143 | 113 / 156 |
| Triangles mean | 606k | 751k |
| Download | | +89 KB vegetation.glb, +245 KB ground layers (+282 KB gzipped) |
| Pace soak tick mean / p99 (ms), Solos 10 seeds | 0.56 / 1.95 | 0.60 / 2.05 |
| Duos 5 seeds / Trios 5 seeds | 0.58 / 2.25, 0.59 / 2.53 | 0.68 / 2.37, 0.65 / 1.96 |
| Longest stuck (s), Solos / Duos / Trios | 19.0 / 16.0 / 17.5 | 21.5 / 19.0 / 23.0 |
| Ring deaths per Solos match | 1.2 | 1.2 |
| Land view median / p90 (m) | 30 / 180 | 30 / 180 |
| Ground Zero view median / p90 (m) | 30 / 240 | 30 / 250 |
| Worst area median view (m) | 60 | 60 |
| Cover median, land (m) | 3.6 | 3.6 |
| Soft cover within 6 m, land | 56.6% | 56.2% |
| Nav nodes / links | 161,153 / 1,549,103 | 160,929 / 1,545,022 |

- Caveats: the after soaks ran with another session's uncommitted ladder hunks in `bot.ts`/`nav.ts` in the tree; an earlier Trios run's longest stuck (27 s) was at (375,-196), with no rock within 12 m. The 60-client network load test was not rerun. Duos and Trios used 5 seeds, not 10.
- Nav rebuilt itself; `zero-island-nav`, `-bots`, `-royale-bots`, `-cover`, `-sightlines`, `-ground-zero` and `zero-island.test.ts` pass on the final code.
