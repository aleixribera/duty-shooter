# 11 Soldier rework, team uniforms and nameplates

Status: resolved
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

- [x] The hitboxes are unchanged: a test compares hitbox part sizes and positions before and after, in every stance.
- [x] The playtester agent checks soldiers in the open, in shade and indoors (consistent lighting, no glowing), in both team colours. It also checks that nameplates show over teammates only.
- [x] Draw calls per soldier fit the benchmark budget with 8 players in view.

## Comments

Resolved. The soldier's new meshes (rounded boxes and capsules, vest, pouches, helmet, goggles, pads, boots) came from the character-and-weapon presentation commit (6f411cd). This ticket adds the following on top of it, in `packages/fps-client/src/players-view.ts`:

- **Team uniforms.** Blue and orange take the UI's team colours (#3D8BFF, #FF9A3C) on the shoulder pads, with toned-down versions on the cloth, vest and helmet. Free-for-all keeps the neutral olive drab. The range dummies keep their own white-and-orange look. A soldier whose side changes between matches is rebuilt in the new uniform.
- **One draw call per soldier.** The soldier and rifle were about 25 meshes. They are now baked into one skinned mesh. Each piece is rigidly weighted to the pivot it rode on, and its material's colour goes into a vertex colour (the rifle is one gunmetal tone at third-person distance). The pivots became bones, so the procedural posing is untouched. The pieces stay in the hierarchy, hidden, for the ragdoll to throw. Eight soldiers in view now cost 8 draw calls, 16 with their shadows, against the 250 budget.
- **Nameplates.** A teammate gets a sprite over their head with their name in the UI's condensed type and a team-colour bar, at a constant size on screen. It is depth-tested, so walls hide it like anything else. It also writes depth, so the heat shimmer leaves it alone. Enemies never get one, and in free-for-all nobody does. A plate hides when its teammate dies. `Game` passes the match's mode, the local player's team and the lobby's names.
- **Lighting.** The soldier's one material is a standard material, so `WorldView.lightMoving` switches it to probe lighting like every other moving object. It casts a realtime shadow.

**Tests.**

- `packages/fps-core/test/hitboxes.test.ts` snapshots every hitbox part's size and position standing, crouching, halfway down and prone, through a new `hitboxes(pose)` export. The hit zones haven't changed since the weapon simulation, so the snapshot is the before.
- `packages/fps-client/test/players-view.test.ts`:
  - The two teams wear different colours, and in free-for-all everyone wears the same neutral one.
  - Nameplates show over living teammates only: none over enemies, none for a dead teammate, none in free-for-all.
  - Nameplates are depth-tested.
  - A soldier is exactly one visible mesh, under 10 k triangles and 1.5 to 2 m tall.

The existing stride and ragdoll tests still pass.

**In the browser.** A dev-page script put both teams in front of the cul-de-sac spot and in the north living room, viewed as a member of the blue team. In the open, the soldiers are sunlit with shadows; in the bus's shade they are darker. Indoors the blue soldier is darker again from the probes. None of them glow. Plates showed over the blue soldiers only and were crisp, hidden behind the helmet of a soldier in front.

Two defects turned up and were fixed:

- The third-person rifle baked in white, because its materials colour through nodes. It is now gunmetal.
- The heat shimmer smeared near edges into the far background and wobbled a plate drawn against the sky. The shimmer now borrows only from neighbours that are themselves far away.

The playtesting was done with these scripted scenes, because the agent's browser pane runs too slowly to host a team match.
