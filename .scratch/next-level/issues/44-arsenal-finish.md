# Every gun reads as a dark finish, not a black cut-out

Status: resolved

Release: v2.185.0

Spec: `../spec.md`

Follows ticket 43, which lifted the M4A1's own finish. The other eight guns are Blender models baked by `tools/weapon/gunsmith.py`, and their black finishes were darker still. Anodised aluminium was 0.016 albedo at 75% metal, nitride 0.022 at 85%, blued 0.014 at 90%, polymer 0.026. The Warden 9 in hand in full sun on Survival Town was a black shape: its slide measured 6.5 of 255 and its frame 8.4 (`../arsenal-finish/before/sidearm.jpg`).

## Comments

**v2.185.0.** The black finishes in `FINISHES` are now dark grey and mostly coating, matching the M4A1:

| Finish | Albedo | Metalness |
| --- | --- | --- |
| Nitride | 0.022 → 0.072 | 0.85 → 0.4 |
| Phosphate | 0.03 → 0.08 | 0.55 → 0.35 |
| Blued | 0.014 → 0.055 (still blue-black) | 0.9 → 0.5 |
| Anodised | 0.016 → 0.072 | 0.75 → 0.3 |
| Polymer | 0.026 → 0.062 | unchanged |
| Stipple | 0.022 → 0.055 | unchanged |
| Rubber | 0.018 → 0.042 | unchanged |

Bare steel, wood, paints and the sand and olive polymers are unchanged. All eight guns were rebaked, each in 23 to 38 s on this PC: the pistol, SMG, shotgun, sniper, LMG, DMR, burst rifle and revolver, with their `.glb` and `.blend` files.

Verified:
- `../arsenal-finish/sidearm.mjs` at ticket 37's sun spot. The pistol's slide went 6.5 → 20.0 and its frame 8.4 → 18.5, in line with the rifle after ticket 43 (receiver side 15.6, handguard 23.3). The slide serrations, ejection port and sights now read (`after/sidearm-pair.jpg`). A first, smaller lift (slide 12.8, `try1/`) still read as black.
- `../arsenal-finish/viewer.mjs`: every gun in the viewer mid-inspect (`viewer/sheet.jpg`). All load, no page errors.
- `prerendered-kit.test.ts` passes.

Not rebaked here: the frag, the smoke and flash canisters, the supply drop and the Reboot Beacon also use some of these finishes. They keep their current bake until their next rebuild, when they will pick up the lighter palette.
