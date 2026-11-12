# A wall, not cardboard

Status: resolved
Release: v2.187.47

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12h.md`), its weakest point and first defect (06, 07, 08, the whole frame): "the wall the run stood against for 40 s reads as brown cardboard. In 07 a room corner ... is drawn only as a 1-2 px seam ... nothing darkens toward the crease. 08 is a single tone (RGB about 123, 98, 67) with a fine grain like paper." Its fix: find which wall it is (the capture prints the position and the solid under the crosshair), then give that finish large-scale tone variation (patches about a metre across) and occlusion that darkens a corner over its last 30 cm. Check: a frame 50 cm from that corner, the two faces 15 levels or more apart and a dark band in the crease.

## Comments

**2026-11-13, loop pass 2.** The wall: replaying the review's walk (`../wall/probe.mjs`) put the run inside the two-storey house south of the street (floor x -8.1..6.1, z -31.85..-13.9), against the room face of its north wall (solid 899), whose look is `inside: wall`, plaster 0xEADFC6. Cream plaster reads as brown cardboard because inside the house the bake is dim and `decode` adds a flat warm fill (0.2, 0.18, 0.15) that is three times the bake's own light there, so every face of a room gets the same light; and the bake's 20 cm texels (sampled 3 cm in from each edge) smear a corner's occlusion to a 15-level dip.

What changed:
- **Crease shade.** `creaseEdges` (`surfaces/edges.ts`) finds, per face edge, where another opaque solid meets the face in a concave crease (probes 5 cm in front of the face, at or just past the edge; where the neighbour overlaps the face, how far in the crease runs). It rides on a new `faceCreases` vertex attribute, and the static surfaces' lighting takes ambient and lamp light down to 45% over the last 30 cm into a crease (sun untouched). Room corners, wall feet and the line under ceilings now darken. Skipped on terrain maps (Zero Island): its 316k faces took 1.5-2 s at load, and objective 2 (a toaster) comes first.
- **The fill leans.** The flat fill now leans with the face's normal along the world axis nearest the sun (x0.55 to x1.45), so two faces of a corner differ. Leaning along the sun itself failed half the corners: Survival Town's sun stands at 45 degrees to its streets. Making the fill multiply the bake instead (tried first) kept faces only 5-8 levels apart and brightened probe-lit soldiers, so it was dropped.
- **Plaster tone.** The coat's drift is now about a metre across at +-8%, with a slower +-5% under it (was 1.4 m at +-3.5%).
- The review capture prints the player's position and the solid under the crosshair at frame 07.

Check (`../wall/look.mjs`, frames in `../wall/before|after/`, `../wall/sheet.jpg`), 50 cm from two of the room's corners: the two faces were 1-2 levels apart (104 vs 102, 103 vs 102) with a crease dip to 88; now 22 apart (103 vs 80, 81 vs 102) with a dark band to 39-41 in the crease. A wider view of the room (`after/corner-3_-28_-2.356.jpg`) shows the ceiling line and the far corner, and the porch outside (`after/corner-2_-9_0.jpg`) is unchanged in the sun. Second-opinion review: no bugs; noted that a collision box under a Blender model can still cast a crease, and that the lean also touches dim outdoor walls (fine in the porch frame).

