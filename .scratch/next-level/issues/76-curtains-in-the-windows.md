# Curtains in the windows

Status: resolved

Release: v2.187.25

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), its fifth defect (04, left third): "the ground-floor window (x 190-345, y 420-500) is two flat mid-grey panes with no sky, reflection or room behind them, while the open doorway beside it (x 620-715) shows a lit room with a sofa."

## Comments

- **What it is.** A house window's pane hides half the room behind it and mirrors the sky faintly (review 2026-11-12d made it so, against a milky sheet). Behind most panes there is only the room's plain far wall, so from the yard the pane was that wall at half strength: an even taupe from edge to edge.
- **Tried first: a stronger mirror.** Darker glass mirroring the sky and a hazed far skyline gave a sky-blue sheet that was just as flat. Close up, the skyline was a soft dark blob. The darker glass also hid players inside from outside while they still saw out clearly, which is unfair in a fight. Dropped.
- **What changed:**
  - `surface-materials.ts`: glass whose finish sets `curtains` draws curtains drawn back to each side of the pane. Each drape takes 13 to 20% of the width, gathered at a tie-back a third of the way up, in pleats 8 cm apart. The fabric is one of four (linen, a rust print, slate, off-white), shared by the windows of a wall. Where a drape hangs, the pane is drawn whole, so nothing beyond shows through.
  - The curtain is read from the pane's own edges (`faceEdges`), so it fits any window. It comes out the same on both faces of the pane, so it hides as much from the room as from the yard. The middle of the pane is unchanged: the room shows through as it did.
  - `surfaces/types.ts`: the `Finish.curtains` field, the light on the fabric as a share of the horizon's.
  - `survival-town.ts`: the houses' windows set it, 0.4 from the yard and 0.25 from the room.
  - The fabric pick is hashed from whole cells. The hash first took the wall's plane unrounded, and float wobble across the pane broke the drapes into dashes.
- **Seen in the page** (`../window-panes/look.mjs`, `sheet.jpg`):
  - From the back yard (the review's 04 view), both windows read as windows with tied-back curtains, the room between.
  - From 3 m the pleats are clean.
  - From the street, the front windows carry them too.
  - From inside, a living room window is framed by slate drapes, the view out unchanged between them.
- **Not in this slice.**
  - Panes still mirror nothing of the street beyond the sky.
  - The upstairs front window is an open frame, not glass.
  - Bots' sight ignores glass (`sightBlocked` in fps-core skips glass solids), so it ignores the curtains too. A bot sees a player behind a drape that a human can't. Bots already saw through the half-hidden pane better than a human, and the drapes cover only the pane's outer fifths, so this is written down rather than fixed here.

A second-opinion review confirmed the edges and the two-face symmetry. The pane's four edges are open (sash bars are decorations, nothing else lies in its plane), and `footOnGround` touches no pane. `cover`, `up` and the fabric match on both faces, and the TSL is correct. It found one real defect, fixed: the fabric's 12 m stretch was read per pixel, so the garage's west pane (z 23 to 24.5) straddled a cell and drew two fabrics. It is now taken from the pane's middle. It also raised a latent case, now guarded: a pane whose side ran on into more glass would measure that edge as FAR and turn wholly into curtain. And it suggested sizing the hem from the screen pixel so it doesn't shimmer at range, which is done.

Verified:
- The `fps-client` and `range` typechecks pass.
- The `surface-*` tests (41) and `survival-town` tests (92) pass.
- Window frames before and after: from the yard, at 3 m, from the street and from inside. No page errors.
