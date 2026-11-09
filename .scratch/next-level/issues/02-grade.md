# Grade, exposure and sharpness

Status: open

Spec: `../spec.md`

Saturation is pushed 1.16 over ACES at 0.7 exposure and the picture reads garish and soft. Retune the film look (packages/fps-client/src/pipeline.ts filmLook, game.ts tone mapping): natural saturation, a gentle S-curve, a light sharpen after TRAA, dither against banding. A per-map grade hook in Lighting.

## Comments
