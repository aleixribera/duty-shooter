# Rocks look like stacked cubes since the hitbox fix

Status: open
Blocked by: none
Labels: bug

Ticket 63 fixed the invisible hitboxes by remodelling rocks as blocky jointed stone that fits a few boxes. The collision is right, but in `../shots/t65/zero-island-sniper-smoke-side-0.7s.jpg` the grassland rocks read as grey stacked cubes, not natural boulders; in the Dustlands the same style reads acceptably as sandstone ledges (`../shots/t63/look1/dl-strata.jpg`).

Keep the rule "what you see is what you hit, within a few cm", but give each Region natural rock shapes again: rounded/irregular boulders, outcrops and slabs per Region (granite in Frostbite, mossy boulders in the Jungle, sandstone ledges in the Dustlands, broken concrete/rubble in Ground Zero), built in Blender (`blender` skill) with textures through `game-textures`. Collision fitted to each model tightly enough (more boxes per model, or a convex-hull/rounded collider if the engine can afford it in the server tick); keep `kit-solids.test.ts`'s tolerance. Rebuild nav, recheck bot crossings, sightline/cover numbers, frame and server budgets.

## Comments
