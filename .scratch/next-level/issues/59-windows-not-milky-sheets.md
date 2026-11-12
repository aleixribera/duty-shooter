# Windows, not milky sheets

Status: resolved

Release: v2.187.3

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, Picture): in `08-play-late.jpg`, "the window right of it is a milky sheet". From the yard every Survival Town window read as a pale grey-white panel set in the siding. The glass hid only 14% of what was behind it, so from outside you saw straight through to the bright beige plaster of the room. The panes also had no sash bars.

## Comments

**v2.187.3.** The houses' windows read as glazed, double-hung windows from the street.

- **Sash bars.** A new `Opening.sash` (`builder.ts`) draws, in the trim's white paint: a stile up each side, a rail across the head and the foot, and a meeting rail halfway up where the two sashes meet. They are decorations on the pane, through it and 2 cm proud of each face, so they show from both sides. They are visual only.
- **Glass that is dark from the street and clear from the room.** A new `Opening.paneLook` gives the pane a look with an `inside` finish. The outer face wears `window`: near-black glass hiding half the room. The face looking into the room wears `window.inside`, the old clear glass, so the view out is unchanged. `Finish.opacity` sets how much a pane hides seen square on; it is still 0.14 by default.
- **The sky in the glass.** The first try made the panes whiter, not darker. Blending scales the pane's own light by its opacity, and its own light is mostly the mirrored HDR sky. The glass now mirrors the sky by 0.14 / opacity, so the sky it reflects stays as it was and the extra opacity only dims the room behind. Every other map's glass has the default opacity, so its factor is 1 and it is unchanged.

A second-opinion review found that the factor is right only square on. At a slant the fresnel term raises clear glass's opacity more than the dark pane's, so the dark pane mirrors less sky there than clear glass would. Its proposed fix made the factor vary per pixel, as clear glass's opacity over the pane's at each angle. I tried it twice, as that ratio and as a straight line in the fresnel term. Both drew the panes pale again in WebGPU (`../windows/after4`-style shots, since deleted), while the constant factor drew them dark under the same light (`../windows/after3/near.jpg`). The constant factor stays, with a comment saying why. Dark glass mirroring a little less at a slant is what tinted glass does, and the panes read as glass from every spot shot.

Verified:
- Typecheck passes for `apps/range` and `fps-client`.
- `survival-town.test.ts` and `map.test.ts` pass (119/119), including the decoration placement checks.
- A throwaway test listed the finish on every glass face of Survival Town's panes: 18 `window` (outer) and 18 `window.inside` (inner).
- `../windows/look.mjs` shot the north house's east wall from the lawn, at 10 m and from the edge of the desert, and the ground floor from inside:
  - before: `../lawn/after3/e1.jpg` (pale panels);
  - first try, `../windows/after/`: sash bars, but the panes turned whiter;
  - `../windows/after2/near.jpg` and `../windows/after3/near.jpg` (the shipped code, re-shot after the review): dark panes with the room dimly behind, white sashes.
  - From inside (`../windows/after/inside.jpg`) the glass is clear, with the sash bars and the yard beyond.
  - No page errors.
