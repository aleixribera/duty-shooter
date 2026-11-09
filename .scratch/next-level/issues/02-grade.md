# Grade, exposure and sharpness

Status: resolved
Release: v2.143.0

Spec: `../spec.md`

Saturation is pushed 1.16 over ACES at 0.7 exposure and the picture reads garish and soft. Retune the film look (packages/fps-client/src/pipeline.ts filmLook, game.ts tone mapping): natural saturation, a gentle S-curve, a light sharpen after TRAA, dither against banding. A per-map grade hook in Lighting.

## Comments

Saturation no longer pushed 16%: midtones stay natural (x1.1) and the loudest colours are pulled back up to 22%, so paint and grass sit in the same light. Split tone gentler, vignette 0.24. A sharpen after temporal AA (four neighbours, calmed where they are bright so the sun's edge and flashes don't ring) and a grain too fine to see against banding. Tone mapping stays ACES at 0.7: AgX was the alternative, left for the per-map grade if a map needs it. The per-map grade hook was not needed yet: `cloudCover` was.
