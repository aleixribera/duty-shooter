# Smooth shadow edges

Status: resolved

Release: v2.187.26

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its fourth defect, the part ticket 75 left (07): "the only pattern on it is in the sunlit wedge at the top left (x 240-440, y 0-300), a fine diagonal dot grid like a screen door."

## Comments

- **What it is.** Near the player, the sun's light on the map comes from the realtime shadow map, and three's default filter reads it. That filter takes five taps on a disc, turned per screen pixel by interleaved gradient noise. The noise is fixed to the screen and the temporal AA can't average it out, so every penumbra was a diagonal dot grid. With five taps it also came out in six flat steps. Ticket 75 found it on the room's wall in 07. It is on every shadow edge near the player: the porch's scalloped fascia, sun stripes on a floor, a fence's shadow.
- **What changed:**
  - `sun-shadow.ts`: the sun's own shadow filter. It takes nine taps on a 3×3 grid a shadow-map texel apart, weighted 1-2-1 each way. Each tap is the hardware's bilinear blend of four depth tests. The taps are the same in every pixel, so a shadow's edge is a smooth ramp about four texels (18 cm) wide, with no grain and no steps.
  - `world-view.ts`: the sun's shadow uses it. No other light casts shadows.
- **Seen in the page** (`../sun-patch/look.mjs`, `sheet.jpg`):
  - The porch fascia's scalloped shadows and the sun stripes on the front room's floor were dot grids in steps. Now they are clean ramps.
  - The sunlit siding, white trim and lawn show no self-shadowing (acne) at the wider reach.
- **Cost.** Nine taps where there were five, on surfaces within the shadow map's 40 m.

A second-opinion review found no defects. The filter gets the same inputs as three's own and compares depth the same way, reversed depth and array maps included. It follows the map's size when the quality changes, the weights sum to one, and no other light or material is affected. It noted the corner taps reach 2.4 texels where the old disc reached 1.95, past the 1.37-texel normal bias, so a face the sun grazes could darken faintly. Survival Town's walls all meet the sun at n·L 0.55, the case the siding and trim frames show clean.

Verified:
- The `fps-client` typecheck passes. No test covers this shader; the page frames are the proof.
- Frames before and after at the porch fascia, the front room's floor and a lawn shadow, with no page errors.
