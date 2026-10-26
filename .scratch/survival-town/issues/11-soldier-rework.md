# 11 Soldier rework, team uniforms and nameplates

Status: ready-for-agent
Milestone: 3 (art and presentation)
Blocked by: 03, 08

## What to build

Soldiers that belong in the new world. See the spec section "Rendering (presentation package)".

- **Rebuild the soldier's meshes and materials** in stylised realism. The skeleton, the procedural posing and the hitbox parts stay exactly the same.
- **Team uniforms** in blue and orange, matching the approved UI palette. FFA uses a neutral uniform.
- **Nameplates** are drawn over teammates only, never over enemies, and are hidden behind walls.
- **Lighting:** soldiers are lit from the light-probe grid, so they darken under roofs and in shade, and they cast realtime shadows.
- **The range dummies** keep their distinct look.

## Acceptance criteria

- [ ] The hitboxes are unchanged: a test compares hitbox part sizes and positions before and after, in every stance.
- [ ] The playtester agent checks soldiers in the open, in shade and indoors (consistent lighting, no glowing), in both team colours. It also checks that nameplates show over teammates only.
- [ ] Draw calls per soldier fit the benchmark budget with 8 players in view.

## Comments
