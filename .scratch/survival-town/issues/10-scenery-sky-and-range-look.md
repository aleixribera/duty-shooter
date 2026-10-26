# 10 Scenery, sky, and the Practice Range's new look

Status: ready-for-agent
Milestone: 3 (art and presentation)
Blocked by: 08

## What to build

The world beyond the boundary, plus the range's refresh. See the spec sections "Rendering (presentation package)" and "Maps (the app)".

- **Survival Town's scenery** beyond the boundary:
  - desert terrain
  - test-site towers and structures
  - distant mountains
  - a sky that suits the afternoon sun

  The near scenery has bullet surfaces, so shots leaving the playable area hit it with normal impacts. The far mountains need none. Distant meshes are simplified. Add a heat shimmer on the horizon.
- **The Practice Range** gets the new sky, lighting and post-processing. Its layout, lanes, dummies, movement course and measuring grid stay as they are. Remove the old arena section and its spawns.

## Acceptance criteria

- [ ] A map test: bullets fired outward from inside the boundary hit scenery bullet surfaces (or travel to the far scenery), never player clip.
- [ ] The playtester agent confirms scenery impacts, and that there are no seams between the playable ground and the desert.
- [ ] The range's map tests pass with the arena removed, and the range looks consistent with the new menu in screenshots.
- [ ] The benchmark stays within budget, or the gap is recorded for ticket 15.

## Comments
