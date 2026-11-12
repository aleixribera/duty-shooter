# Glass in the vehicles

Status: resolved

Release: v2.187.18

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12e.md`), its second defect: the school bus's and the pickup's windows are flat black slabs, read as paint rather than glass, with a white smudge on the pickup's windscreen.

## Comments

- **Why they were black.** The vehicles are map models. Their glass (`auto.glass`, a near-black 0x1c262d) went through the shared model material like their paint: an opaque, lit, shiny surface in that colour. Nothing is modelled inside a vehicle, so the glass had no inside to show, only its own dark colour and a hot sun highlight. That highlight was the white smudge on the pickup's windscreen.
- **What changed:**
  - A finish can now say `through`: a map model's glass with no room modelled behind it.
  - `loadMapModels` gives such glass its own material, `vehicleGlassMaterial`, as it already does for lamps and lit rooms.
  - It draws the glass solid and unlit. Behind it shows the sky beyond the window, in the glass's colour and dimmed by `through`, as light through the windows on the far side of the cab or the aisle. Over that is the mirrored sky: 15% square on, rising to all of it at a grazing angle.
  - Both skies are the reflected sky, whose sun is a soft lobe. Looking through the glass at the sun gives a glow, not a hot spot.
  - `auto.glass` is a blue-grey 0x8aa2ad with `through: 0.55`. It is used by the bus, the pickup and the station wagon.
- House panes, and every other map's glass, are drawn as before.

A second-opinion review found that the first try never reached the vehicles. It had put `through` into the baked surfaces' glass material, but vehicle parts come from the model file and never use that material. The new colour therefore only turned the old opaque material milky, which is what the first after shots showed: flat grey-green slabs. The effect moved to the model path, and the baked glass material was left unchanged. The review also warned that the sun's disc in the sky through the glass would bloom. The reflected sky avoids that: its sun lobe tops out at about half the sun's colour after the tint.

Verified:
- The `fps-client` and `range` typechecks pass.
- `probe-lit-smoke`, `survival-town` and `map` tests pass (124/124).
- `../windows/look.mjs` shot the bus and pickup from both sides of the street (`after/`, no page errors). `sheet.jpg` sets them against the before shots in `../stencils/scale/`:
  - The windows read as blue-grey glass, lighter where they mirror the sky and darker toward the ground.
  - The pickup's windscreen has no white spot.
  - The station wagon's windows match.
