# 08 Effects and graphics presets

Status: resolved
Milestone: 3 (audio, effects, HUD, graphics presets)
Blocked by: 06

## What to build

Effects (39-42): a muzzle flash that lights the environment, muzzle smoke after sustained fire, ejected shell casings that bounce and settle, impact decals and material-appropriate sparks or dust (from box material tags), blood on player hits (usable on dummies now). Post-processing and presets (66-69): PBR, cascaded shadows, AO, bloom, tonemapping, TAA, volumetric smoke; Low (dynamic render scale, reduced shadows, no AO or volumetrics), Normal, High; the WebGL2 fallback is capped at Normal. Preset choice lives in settings.

## Acceptance criteria

- [ ] Playtester agent: no console errors on each preset; effects visible when firing at concrete, metal, wood and a dummy.
- [ ] Forced WebGL2 mode caps the preset at Normal.
- [ ] Measured fps reported for each preset on the test machine.
