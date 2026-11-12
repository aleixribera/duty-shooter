# Sharp stencils up close

Status: resolved

Release: v2.187.23

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its third defect (08, bottom third): "the 'SCHOOL BUS' letters along the bus side are blurred black blocks with stair-stepped notches in their edges, and the bullet holes in the black letters show as small pale tan four-pointed stars, not holes."

## Comments

- **What it is.** The lettering is the bus's stencil ("CIVIL EFFECTS TEST · VEHICLE 14", ticket 66), drawn into a texture at 256 px a metre. At arm's length a screen pixel covers about a tenth of a texture pixel, so the letters' antialiased edge spread into a wide blur, stepped where the pixels show. The pale stars are not bullet holes but the paint's chip flecks: discs of one pixel's radius are plus shapes, magnified tenfold.
- **What changed** (`world-details.ts`):
  - The stencil's texture now holds the letters' signed distance from their edges (`signedDistance`, an exact distance transform), and the shader cuts it at a screen pixel's width. The edge stays sharp however near.
  - The texture also keeps the plain coverage. Once a texture pixel is smaller than a screen pixel, the stencil draws that. Mipmaps average coverage truly, where averaging distances breaks thin strokes up from about 25 m.
  - Chips are cut from the letters before the distance is measured, so each keeps its own edge. Each is two or three overlapping discs, so it reads as a flake gone rather than a punched hole.
  - The paint's wear and overspray are as before.
- **Seen in the page** (`../bus-letters/look.mjs`, `sheet.jpg`, `close-sheet.jpg`, `range-sheet.jpg`):
  - At 0.5 and 1 m the letters have crisp edges with flaked chips, where they were soft blocks with plus-shaped stars.
  - At 4, 10, 25 and 40 m the lettering looks as it did.
  - The house stencils ("STRUCTURE 1") are sharp up close too.

A second-opinion review confirmed the distance transform, its sign and half-pixel convention, the byte round trip through the texture, and that `fwidth` is legal there. It raised one real defect, fixed: with the distance alone, mipmaps averaging distances would thin, merge or break the lettering from mid range. The plain-coverage blend now handles that, and the 25 and 40 m shots show it. It also asked for `willReadFrequently` on the canvas, which the stencil now reads twice (done), and for a brute-force check of the transform (added). Its load-time estimate for Survival Town's ten stencils is about 0.1 s at map build.

Verified:
- The `fps-client` typecheck passes.
- `stencil-distance` (new: a block's distances inside, outside and off a corner, an antialiased edge, empty and full masks, and a brute-force match on a scattered mask) and `world-details` tests pass (7/7).
- Bus frames before and after from 0.5 m to 40 m, and a house stencil up close, with no page errors.
