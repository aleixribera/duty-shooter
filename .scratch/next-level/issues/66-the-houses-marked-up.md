# The houses marked up

Status: resolved

Release: v2.187.14

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`), Identity, scored 5 and the lowest: "Everything else on screen in play is an ordinary suburban TDM: no hazard stencil, siren, sky change or instrument in any frame from T-10:00 to T-9:12." The two houses read as any street. Nothing on them says they are on a test range waiting for the bomb.

## Comments

- **Stencils on the street fronts.** The site's crew has marked up each house as a test structure, in paint on its front:
  - "STRUCTURE 1" and "STRUCTURE 2" in lamp black over the garage doors, between the door frame's head and the top trim.
  - A red-oxide survey mark beside the upstairs window: the bearing and distance from that house to ground zero, worked out from the map's own numbers. The north house reads `GZ 071°` / `1,460 FT`, the south house `GZ 068°` / `1,490 FT`.
  - Ground zero is now one constant (`GROUND_ZERO`) that both the nuke and the marks read, so they can't drift apart.
  - The fronts face the street, so a player sees the marks from either spawn and while crossing the middle.
- **How it's painted** (`stencilMesh` in `world-details.ts`):
  - A plane 4 mm off the face is drawn with the bullet holes' modulate blend (2 × texture × what's behind it), so the paint takes the siding's own light, shadow, boards and grime. It doesn't glow or float as a flat sticker would.
  - The paint's colour is ink ÷ siding in linear light, one constant in the shader. The texture carries only coverage, in alpha.
  - The letters are drawn in the UI's condensed type, with stencil bridges cut through A, B, D, O, P, Q, R, 0, 4, 6, 8 and 9.
  - A faint overspray rings each letter, and seeded wear (a coarse thinning wash plus chipped flecks) makes every mark weathered the same way on every build.
- **General, not Survival Town only.** `Stencil` sits beside the other surface types in `fps-client/surfaces`. Any map can list `stencils` in its definition, and `WorldView` builds them and disposes their textures.
- The review's own one-hour pick (staircase and shutters, material) is left for a later pass. This one goes at the lowest score.

A second-opinion review checked the facing, the offset off the wall, the bearing maths, clearances, disposal, the TAA velocity buffer and destination alpha, and found them right. It raised two points, both fixed:
- **The paint's colour came from the canvas.** A canvas keeps its pixels premultiplied, so where coverage thinned (letter edges, far mipmaps), the colour came back toward black and the red mark read browner and darker than meant. The colour is now one constant in the shader, and the texture carries coverage alone. A re-shot crop (`../stencils/gz-after.png` against `gz-after2.png`) shows the mark redder and cleaner at the edges.
- `Stencil` had gone in between `Decoration` and its doc comment. Moved.

Verified:
- The `fps-client` and `range` typechecks pass.
- `survival-town` and `map` tests pass (119/119).
- `../windows/look.mjs` shot Survival Town in the light Chrome (`../stencils/after/`, no page errors):
  - `garage.jpg`: "STRUCTURE 1" reads the right way round over the garage door, with the bridges, overspray and wear visible. It takes the wall's shadow under the eave.
  - `street.jpg`: the red `GZ 071°` / `1,460 FT` beside the north house's upstairs window, clear of the shutters and corner board.
  - `south.jpg`: "STRUCTURE 2" and the `068°` / `1,490 FT` mark on the yellow south house, also unmirrored.
